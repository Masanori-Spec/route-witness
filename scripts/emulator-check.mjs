#!/usr/bin/env node
/** Official local HTTP oracle. It does not import route-witness's engine. */
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = join(root, "fixtures/emulator");
const oracleRoot = join(fixtureRoot, "oracle");
const fixtureText = await readFile(join(fixtureRoot, "cases.json"), "utf8");
const { scenarios } = JSON.parse(fixtureText);
const pins = JSON.parse(
  await readFile(join(oracleRoot, "package.json"), "utf8"),
).devDependencies;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const args = process.argv.slice(2);
const run = args.includes("--run");
const valueOf = (flag) =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const platformArg = valueOf("--platform");
if (platformArg && !["netlify", "cloudflare"].includes(platformArg))
  throw new Error("Use netlify or cloudflare");
const platforms = platformArg ? [platformArg] : ["netlify", "cloudflare"];
const selected = valueOf("--scenario")
  ? scenarios.filter((s) => s.id === valueOf("--scenario"))
  : scenarios;
if (!selected.length) throw new Error("No selected scenario");
const output = resolve(
  valueOf("--output") || join(fixtureRoot, "local-results.json"),
);
const timeoutMs = Number(valueOf("--timeout-ms") || 45000);
async function unusedPort() {
  const server = createServer();
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const port = server.address().port;
  await new Promise((accept) => server.close(accept));
  return port;
}
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000)
  throw new Error("Invalid timeout");
const known = new Set([
  "--run",
  "--platform",
  "--scenario",
  "--output",
  "--timeout-ms",
  "--check-fixtures",
]);
for (let i = 0; i < args.length; i++) {
  if (!known.has(args[i])) throw new Error(`Unknown argument: ${args[i]}`);
  if (
    ["--platform", "--scenario", "--output", "--timeout-ms"].includes(args[i])
  ) {
    if (!args[++i] || args[i].startsWith("--"))
      throw new Error("Missing argument");
  }
}
for (const s of scenarios) {
  if (!/^[a-z-]+$/.test(s.id) || !s.requests.length)
    throw new Error("Invalid scenario");
  for (const p of platforms) {
    const rules = s.rulesByPlatform?.[p] || s.rules;
    if (
      !rules ||
      rules.some((r) => !r.startsWith("/") || /https?:\/\//.test(r))
    )
      throw new Error("Fixture must stay local");
    for (const r of s.requests) {
      if (
        !r.path.startsWith("/") ||
        r.path.startsWith("//") ||
        r.path.includes("..")
      )
        throw new Error("Invalid local path");
      if (r.expected?.[p]?.bodyAsset)
        await readFile(join(fixtureRoot, "assets", r.expected[p].bodyAsset));
    }
  }
}
if (!run) {
  console.log(
    JSON.stringify(
      {
        status: "fixtures-valid-not-run",
        scenarios: scenarios.length,
        requestsPerPlatform: scenarios.reduce(
          (n, s) => n + s.requests.length,
          0,
        ),
        pins,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const report = {
  schemaVersion: 1,
  evidenceLevel: "official-local-emulator-http",
  startedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  pins,
  fixturesSha256: hash(fixtureText),
  fixtureSnapshot: JSON.parse(fixtureText),
  productionParityClaimed: false,
  netlifyEdgeFunctionsDisabled: true,
  runs: [],
};
const packageFor = { netlify: "netlify-cli", cloudflare: "wrangler" };
for (const p of platforms) {
  const packageName = packageFor[p];
  const installed = JSON.parse(
    await readFile(
      join(oracleRoot, "node_modules", packageName, "package.json"),
      "utf8",
    ),
  );
  if (installed.version !== pins[packageName])
    throw new Error(`Unexpected ${packageName} version: ${installed.version}`);
}
report.lockfileSha256 = hash(
  await readFile(join(oracleRoot, "package-lock.json")),
);
let active;
function stopActive() {
  if (active && active.exitCode === null) active.kill("SIGTERM");
}
process.on("SIGINT", stopActive);
process.on("SIGTERM", stopActive);
async function request(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(2500),
    headers: { "accept-encoding": "identity" },
  });
  const body = Buffer.from(await response.arrayBuffer());
  let location = response.headers.get("location");
  // Normalize only the ephemeral loopback origin; do not follow any redirect.
  if (location?.startsWith(`http://127.0.0.1:${port}/`))
    location = location.slice(`http://127.0.0.1:${port}`.length);
  return {
    status: response.status,
    location,
    contentType: response.headers.get("content-type"),
    bodyBytes: body.length,
    bodySha256: hash(body),
  };
}
for (const s of selected)
  for (const p of platforms) {
    const working = await mkdtemp(join(tmpdir(), "route-witness-oracle-"));
    const home = join(working, "home");
    const publicDir = join(working, "public");
    await mkdir(join(home, ".config"), { recursive: true });
    await cp(join(fixtureRoot, "assets"), publicDir, { recursive: true });
    await writeFile(
      join(publicDir, "_redirects"),
      (s.rulesByPlatform?.[p] || s.rules).join("\n") + "\n",
    );
    await writeFile(
      join(working, "netlify.toml"),
      '[build]\n  publish = "public"\n[dev]\n  framework = "#static"\n  autoLaunch = false\n',
    );
    const port = await unusedPort();
    const commandArgs =
      p === "netlify"
        ? [
            join(oracleRoot, "node_modules/netlify-cli/bin/run.js"),
            "dev",
            "--offline",
            "--internal-disable-edge-functions",
            "--dir",
            publicDir,
            "--framework",
            "#static",
            "--port",
            String(port),
            "--no-open",
            "--skip-gitignore",
          ]
        : [
            join(oracleRoot, "node_modules/wrangler/bin/wrangler.js"),
            "pages",
            "dev",
            publicDir,
            "--ip",
            "127.0.0.1",
            "--port",
            String(port),
            "--inspector-port",
            "0",
            "--compatibility-date",
            "2026-10-03",
            "--show-interactive-dev-session=false",
            "--log-level",
            "info",
          ];
    const env = {
      PATH: process.env.PATH || "",
      HOME: home,
      XDG_CONFIG_HOME: join(home, ".config"),
      TMPDIR: working,
      CI: "true",
      BROWSER: "none",
      NO_COLOR: "1",
      NETLIFY_TELEMETRY_DISABLED: "1",
      DO_NOT_TRACK: "1",
      WRANGLER_SEND_METRICS: "false",
    };
    const result = {
      scenario: s.id,
      platform: p,
      state: "starting",
      command: [process.execPath, ...commandArgs].map((x) =>
        x
          .replaceAll(working, "<temporary-fixture>")
          .replaceAll(oracleRoot, "<oracle>"),
      ),
      observations: [],
      log: "",
    };
    report.runs.push(result);
    console.log(`Checking ${s.id} on ${p}`);
    active = spawn(process.execPath, commandArgs, {
      cwd: working,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const child = active;
    let spawnError;
    child.on("error", (error) => {
      spawnError = error.message;
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        result.log = (result.log + chunk.toString()).slice(-24000);
      });
    try {
      const deadline = Date.now() + timeoutMs;
      let ready = false;
      while (Date.now() < deadline) {
        if (spawnError || child.exitCode !== null)
          throw new Error(
            spawnError || `Runtime exited (${child.exitCode}) before readiness`,
          );
        try {
          const probe = await request(port, "/assets/style.css");
          // Different scenarios may rewrite this readiness URL; require any HTTP result.
          if (probe.status >= 100) {
            ready = true;
            break;
          }
        } catch {}
        await delay(200);
      }
      if (!ready)
        throw new Error(`No local HTTP response within ${timeoutMs}ms`);
      for (const r of s.requests) {
        const observed = await request(port, r.path);
        const expected = r.expected?.[p];
        const failures = [];
        if (
          expected?.status !== undefined &&
          observed.status !== expected.status
        )
          failures.push(`status ${observed.status} != ${expected.status}`);
        if (
          expected?.location !== undefined &&
          observed.location !== expected.location
        )
          failures.push(
            `location ${observed.location} != ${expected.location}`,
          );
        if (expected?.bodyAsset) {
          const expectedHash = hash(
            await readFile(join(fixtureRoot, "assets", expected.bodyAsset)),
          );
          if (observed.bodySha256 !== expectedHash)
            failures.push(`body does not match ${expected.bodyAsset}`);
          if (observed.location !== null)
            failures.push("unexpected Location on expected asset response");
        }
        result.observations.push({
          path: r.path,
          observed,
          expectedHypothesis: expected || null,
          investigation: r.investigate || null,
          hypothesisResult: expected
            ? failures.length
              ? "mismatch"
              : "match"
            : "unasserted",
          failures,
        });
      }
      result.state = result.observations.some((r) => r.failures.length)
        ? "observed-with-mismatches"
        : "observed";
    } catch (error) {
      result.state = result.observations.length
        ? "partially-observed"
        : "blocked";
      result.error = error.message;
    } finally {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolveExit) => child.once("exit", resolveExit)),
        delay(1200),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
      active = undefined;
      result.log = result.log
        .replaceAll(working, "<temporary-fixture>")
        .replaceAll(oracleRoot, "<oracle>");
      await rm(working, { recursive: true, force: true });
      await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    }
  }
report.finishedAt = new Date().toISOString();
report.counts = {
  observedRequests: report.runs.reduce((n, r) => n + r.observations.length, 0),
  blockedRuns: report.runs.filter((r) => r.state === "blocked").length,
  hypothesisMismatches: report.runs
    .flatMap((r) => r.observations)
    .filter((r) => r.failures.length).length,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.counts));
process.exitCode = report.counts.blockedRuns
  ? 2
  : report.counts.hypothesisMismatches
    ? 1
    : 0;
