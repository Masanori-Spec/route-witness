import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { compare } from "../build/engine.js";
const base = "fixtures/emulator/";
const casesText = await readFile(base + "cases.json", "utf8");
const cases = JSON.parse(casesText),
  observed = JSON.parse(
    await readFile(
      process.env.ROUTE_WITNESS_ORACLE_REPORT || base + "observed-results.json",
      "utf8",
    ),
  );
const sha = (x) => createHash("sha256").update(x).digest("hex");
const paths = [];
async function walk(rel = "") {
  for (const ent of await readdir(base + "assets/" + rel, {
    withFileTypes: true,
  })) {
    if (ent.isDirectory()) await walk(rel + ent.name + "/");
    else paths.push("/" + rel + ent.name);
  }
}
await walk();
test("official local evidence pins inputs and excludes production claim", async () => {
  assert.equal(observed.fixturesSha256, sha(casesText));
  assert.equal(
    observed.lockfileSha256,
    sha(await readFile(base + "oracle/package-lock.json")),
  );
  assert.equal(observed.productionParityClaimed, false);
  assert.equal(observed.counts.observedRequests, 46);
  assert.equal(observed.counts.blockedRuns, 0);
});
let compared = 0,
  explicitUnknown = 0;
for (const scenario of cases.scenarios) {
  const report = compare({
    netlify: (scenario.rulesByPlatform?.netlify || scenario.rules).join("\n"),
    pages: (scenario.rulesByPlatform?.cloudflare || scenario.rules).join("\n"),
    inventory: { complete: true, runtime: "static", paths },
    requests: scenario.requests.map((r) => r.path),
    autoAssets: false,
  });
  for (const result of report.results)
    for (const [side, provider] of [
      ["netlify", "netlify"],
      ["pages", "cloudflare"],
    ]) {
      const outcome = result[side],
        measurement = observed.runs
          .find((r) => r.scenario === scenario.id && r.platform === provider)
          ?.observations.find((r) => r.path === result.path)?.observed;
      test(`official local ${scenario.id} ${provider} ${result.path}`, async () => {
        assert.ok(measurement, "missing measured HTTP response");
        if (outcome.kind === "unknown") {
          assert.ok(outcome.reason.length > 0);
          explicitUnknown++;
          return;
        }
        compared++;
        assert.equal(outcome.status, measurement.status);
        if (outcome.kind === "redirect")
          assert.equal(outcome.target, measurement.location);
        else {
          assert.equal(measurement.location, null);
          assert.equal(
            sha(await readFile(base + "assets" + outcome.target)),
            measurement.bodySha256,
          );
        }
      });
    }
}
test("oracle comparison coverage is explicit", () => {
  assert.ok(compared >= 30, `only ${compared} model outcomes compared`);
  assert.ok(
    explicitUnknown >= 8,
    `only ${explicitUnknown} conservatively unknown`,
  );
  console.log(
    `Official-local golden evidence: ${compared} supported model outcomes agree; ${explicitUnknown} outcomes remain UNKNOWN.`,
  );
});
