/** A deliberately bounded documentation-derived static routing model. No I/O. */
export const LIMITS = Object.freeze({
  configChars: 100_000,
  ruleLines: 500,
  lineChars: 1000,
  inventoryPaths: 10_000,
  requests: 2000,
  pathChars: 2048,
  work: 3_000_000,
  hops: 8,
});
export type Platform = "netlify" | "pages";
export type Inventory = {
  complete: boolean;
  paths: string[];
  runtime: "static" | "unknown";
};
export type Input = {
  netlify: string;
  pages: string;
  inventory: Inventory;
  requests: string[];
  autoAssets?: boolean;
};
type Evidence = {
  type: "rule" | "asset" | "scope" | "ordering";
  line?: number;
  detail: string;
};
type Step = {
  path: string;
  kind: string;
  status: number | null;
  target: string | null;
  line: number | null;
};
export type Outcome = {
  kind: "asset" | "redirect" | "rewrite" | "unknown";
  status: number | null;
  target: string | null;
  reason: string;
  evidence: Evidence[];
  trace: Step[];
  chainEnd: "terminal" | "external" | "unknown" | "loop" | "hop-limit";
};
type Rule = {
  line: number;
  raw: string;
  from: string;
  to: string;
  status: number;
  force: boolean;
  splat: boolean;
  supported: boolean;
  problem: string;
  scope: string | null;
};
type Diagnostic = {
  platform: Platform;
  line: number;
  code: string;
  message: string;
};
export type Result = {
  path: string;
  origin: "supplied" | "asset";
  verdict: "SAME" | "CHANGED" | "UNKNOWN";
  reason: string;
  interception: boolean;
  netlify: Outcome;
  pages: Outcome;
};
export type Report = {
  schemaVersion: 1;
  profile: { id: string; date: string; evidence: string; scope: string };
  inputs: {
    digests: Record<string, string>;
    inventoryComplete: boolean;
    runtime: string;
  };
  coverage: {
    supplied: number;
    autoAdded: number;
    total: number;
    same: number;
    changed: number;
    unknown: number;
    intercepted: number;
  };
  diagnostics: Diagnostic[];
  results: Result[];
};
const ASSET =
  /\.(?:js|mjs|cjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot)$/i;
const cleanPath = (p: string) =>
  p.startsWith("/") &&
  !p.startsWith("//") &&
  p.length <= LIMITS.pathChars &&
  /^\/[A-Za-z0-9_.~/-]*$/.test(p) &&
  !p.includes("//") &&
  !p.split("/").some((s) => s === "." || s === "..");
const safeSource = (p: string) =>
  cleanPath(p) && p !== "/" && !p.endsWith("/") && !/\.html?$/i.test(p);
const sourceScope = (p: string) =>
  safeSource(p) ? p : p.endsWith("/*") && cleanPath(p.slice(0, -1)) ? p : null;
function targetValid(p: string, splat: boolean): boolean {
  if (p.length > LIMITS.pathChars) return false;
  const replacement = p.replaceAll(":splat", "sample");
  if (p.includes(":splat") && !splat) return false;
  if (p.split(":splat").length > 2) return false;
  if (cleanPath(replacement)) return true;
  if (
    !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9_.~/-]*)?$/.test(
      replacement,
    )
  )
    return false;
  const rawPath = replacement.replace(/^https?:\/\/[^/]+/, "") || "/";
  if (!cleanPath(rawPath)) return false;
  try {
    const url = new URL(replacement);
    return (
      !url.username &&
      !url.password &&
      cleanPath(url.pathname) &&
      url.href === replacement &&
      url.hostname.includes(".") &&
      /[a-z]/.test(url.hostname.split(".").at(-1)!) &&
      url.hostname
        .split(".")
        .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    );
  } catch {
    return false;
  }
}
function parseConfig(
  text: string,
  platform: Platform,
): { rules: Rule[]; diagnostics: Diagnostic[] } {
  if (typeof text !== "string" || text.length > LIMITS.configChars)
    throw new Error(
      `${platform}: configuration exceeds ${LIMITS.configChars} characters.`,
    );
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length > LIMITS.ruleLines)
    throw new Error(`${platform}: maximum ${LIMITS.ruleLines} lines.`);
  const rules: Rule[] = [],
    diagnostics: Diagnostic[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) continue;
    const tokens = raw.split(/\s+/),
      [from = "", to = "", code] = tokens;
    const force = !!code?.endsWith("!"),
      status = code
        ? Number(code.replace(/!$/, ""))
        : platform === "netlify"
          ? 301
          : 302;
    const splat = from.endsWith("/*"),
      scope = sourceScope(from);
    let problem = "";
    if (raw.length > LIMITS.lineChars)
      problem = "Rule exceeds the 1000-character supported limit.";
    else if (tokens.length < 2 || tokens.length > 3)
      problem =
        "Expected source destination [status]; conditions or malformed fields are unsupported.";
    else if (scope === null)
      problem =
        "Source needs a canonical exact path or one terminal /*. HTML, root, trailing slash, domain, query, fragment, encoding and named placeholders are outside this profile.";
    else if (!targetValid(to, splat))
      problem =
        "Destination encoding, queries, fragments, placeholders or unsafe path syntax is outside this profile.";
    else if (code && !/^(200|301|302|303|307|308)!?$/.test(code))
      problem = "Unsupported status or flag.";
    else if (platform === "pages" && force)
      problem =
        "Netlify force (!) syntax is not a supported Pages rule. It is never silently stripped.";
    else if (platform === "netlify" && [303, 307, 308].includes(status))
      problem =
        "This profile only models documented Netlify 200/301/302; 307 is documented unsupported, and 303/308 are unverified.";
    else if (status === 200 && !to.startsWith("/"))
      problem = "External 200 proxies are not modeled.";
    else if (platform === "pages" && splat && /\/index(.html)?$/.test(to))
      problem =
        "Pinned Pages parser rejects wildcard-to-index destinations as loops, including status 200; hosted equivalence is unverified.";
    const rule = {
      line: i + 1,
      raw,
      from,
      to,
      status,
      force,
      splat,
      supported: !problem,
      problem,
      scope,
    };
    rules.push(rule);
    if (problem)
      diagnostics.push({
        platform,
        line: i + 1,
        code: "UNSUPPORTED",
        message: problem,
      });
    const previous = rules
      .slice(0, -1)
      .find((r) => r.supported && r.from === from);
    if (previous)
      diagnostics.push({
        platform,
        line: i + 1,
        code: "DUPLICATE_SOURCE",
        message: `Earlier source at line ${previous.line}; this rule is not assumed reachable.`,
      });
  }
  if (platform === "pages") {
    let dynamicStarted = false,
      dynamicCount = 0;
    for (const rule of rules) {
      if (rule.splat || rule.scope === null || rule.from.includes(":"))
        dynamicStarted = true;
      if (dynamicStarted && ++dynamicCount > 100)
        throw new Error(
          "Pages: maximum 100 dynamic-tail rules, including exact rules after the first dynamic source.",
        );
    }
  }
  return { rules, diagnostics };
}
const matches = (rule: Rule, path: string) =>
  rule.scope === null ||
  (rule.scope.endsWith("/*")
    ? path.startsWith(rule.scope.slice(0, -1))
    : path === rule.scope);
const unknown = (reason: string, evidence: Evidence[] = []): Outcome => ({
  kind: "unknown",
  status: null,
  target: null,
  reason,
  evidence,
  trace: [],
  chainEnd: "unknown",
});
const known = (
  kind: Outcome["kind"],
  status: number,
  target: string,
  reason: string,
  evidence: Evidence[],
): Outcome => ({
  kind,
  status,
  target,
  reason,
  evidence,
  trace: [],
  chainEnd: "terminal",
});
const htmlAlias = (p: string, assets: Set<string>) =>
  [`${p}.html`, `${p}/index.html`, `${p}.htm`].find((a) => assets.has(a));
function one(
  platform: Platform,
  path: string,
  rules: Rule[],
  assets: Set<string>,
  inventory: Inventory,
  spend: () => void,
): Outcome {
  if (inventory.runtime !== "static")
    return unknown(
      "Static-only routing has not been attested. Functions, Workers, framework adapters or other routing may intercept the request.",
      [{ type: "scope", detail: "Runtime unknown" }],
    );
  if (!inventory.complete)
    return unknown(
      "A complete build inventory is required. Missing paths could change shadowing and rewrite outcomes.",
      [{ type: "scope", detail: "Inventory incomplete" }],
    );
  if (!safeSource(path))
    return unknown(
      "Request encoding, query, fragment, root, HTML or trailing-slash normalization is outside this profile.",
      [{ type: "scope", detail: path }],
    );
  if (
    /\/(?:_redirects|_headers|_routes\.json|_worker\.js)(?:\/|$)/.test(path) ||
    path.startsWith("/.netlify")
  )
    return unknown("Platform control or runtime paths are not modeled.");
  const alias = htmlAlias(path, assets);
  if (alias)
    return unknown(
      "HTML alias/canonicalization can alter routing before or during resolution.",
      [{ type: "asset", detail: alias }],
    );
  const applicable: Rule[] = [];
  for (const rule of rules) {
    spend();
    if (
      matches(rule, path) ||
      (platform === "netlify" &&
        rule.scope?.endsWith("/*") &&
        path === rule.scope.slice(0, -2))
    )
      applicable.push(rule);
  }
  const first = applicable[0];
  if (first && !first.supported)
    return unknown(first.problem, [
      { type: "rule", line: first.line, detail: first.raw },
    ]);
  if (
    platform === "netlify" &&
    first?.splat &&
    path === first.from.slice(0, -2)
  )
    return unknown(
      "Netlify may match a wildcard prefix without its trailing slash; this normalization boundary is not modeled.",
      [{ type: "rule", line: first.line, detail: first.raw }],
    );
  if (first) {
    const evidence: Evidence[] = [
      { type: "rule", line: first.line, detail: first.raw },
    ];
    for (const r of applicable.slice(1, 4))
      evidence.push({
        type: "ordering",
        line: r.line,
        detail: `Later potentially matching rule: ${r.raw}`,
      });
    if (platform === "netlify" && assets.has(path) && !first.force)
      return known(
        "asset",
        200,
        path,
        "Existing static file shadows the unforced Netlify rule.",
        [...evidence, { type: "asset", detail: path }],
      );
    const target = first.to.replace(
      ":splat",
      first.splat ? path.slice(first.from.length - 1) : "",
    );
    if (!targetValid(target, false))
      return unknown(
        "Expanded destination is outside safe canonical path syntax.",
        evidence,
      );
    if (first.status !== 200)
      return known(
        "redirect",
        first.status,
        target,
        `${platform === "netlify" ? "Netlify" : "Pages"} rule selects a client redirect.`,
        evidence,
      );
    if (
      /\/(?:_redirects|_headers|_routes\.json|_worker\.js)(?:\/|$)/.test(
        target,
      ) ||
      target.startsWith("/.netlify")
    )
      return unknown(
        "Rewrite target is a platform control or runtime path, which is not modeled.",
        evidence,
      );
    if (
      platform === "pages" &&
      (/\.html?$/i.test(target) ||
        target.endsWith("/") ||
        htmlAlias(target, assets))
    )
      return unknown(
        "Pages HTML canonicalization or alias handling can change a 200 rewrite into a redirect. This profile does not predict its final status.",
        [...evidence, { type: "asset", detail: target }],
      );
    if (assets.has(target))
      return known(
        "rewrite",
        200,
        target,
        "One internal rewrite serves the target file; the target is not evaluated as another redirect rule.",
        [...evidence, { type: "asset", detail: target }],
      );
    return unknown(
      "Rewrite target is not an exact inventory file. Fallback, alias and missing-target behavior is not modeled.",
      [
        ...evidence,
        { type: "asset", detail: `Missing exact target: ${target}` },
      ],
    );
  }
  if (assets.has(path))
    return known(
      "asset",
      200,
      path,
      "No matching rule; exact non-HTML static asset exists.",
      [{ type: "asset", detail: path }],
    );
  return unknown(
    "No rule or exact file. Platform HTML/404/SPA fallback is outside this profile.",
    [{ type: "scope", detail: path }],
  );
}
function trace(
  platform: Platform,
  path: string,
  rules: Rule[],
  assets: Set<string>,
  inventory: Inventory,
  spend: () => void,
): Outcome {
  const initial = one(platform, path, rules, assets, inventory, spend);
  let current = initial,
    p = path;
  const seen = new Set<string>();
  for (let hop = 0; hop < LIMITS.hops; hop++) {
    seen.add(p);
    initial.trace.push({
      path: p,
      kind: current.kind,
      status: current.status,
      target: current.target,
      line: current.evidence.find((e) => e.type === "rule")?.line ?? null,
    });
    if (current.kind === "unknown") {
      initial.chainEnd = "unknown";
      return initial;
    }
    if (current.kind !== "redirect") {
      initial.chainEnd = "terminal";
      return initial;
    }
    if (current.target!.startsWith("http")) {
      initial.chainEnd = "external";
      return initial;
    }
    p = current.target!;
    if (seen.has(p)) {
      initial.chainEnd = "loop";
      return initial;
    }
    if (hop === LIMITS.hops - 1) {
      initial.chainEnd = "hop-limit";
      return initial;
    }
    current = one(platform, p, rules, assets, inventory, spend);
  }
  return initial;
}
function inventoryValidated(i: Inventory): Inventory {
  if (
    !i ||
    typeof i.complete !== "boolean" ||
    !Array.isArray(i.paths) ||
    !["static", "unknown"].includes(i.runtime)
  )
    throw new Error(
      "Inventory requires complete:boolean, paths:array and runtime:static|unknown.",
    );
  if (i.paths.length > LIMITS.inventoryPaths)
    throw new Error(`Maximum ${LIMITS.inventoryPaths} inventory paths.`);
  const seen = new Set<string>();
  for (const p of i.paths) {
    if (typeof p !== "string" || !cleanPath(p) || p === "/" || p.endsWith("/"))
      throw new Error(
        `Invalid inventory file path: ${String(p).slice(0, 100)}`,
      );
    if (seen.has(p)) throw new Error(`Duplicate inventory file: ${p}`);
    seen.add(p);
  }
  const paths = [...seen].sort();
  const runtime = paths.some(
    (p) =>
      /(^|\/)(?:_worker\.js|_routes\.json)(\/|$)/.test(p) ||
      p.startsWith("/.netlify"),
  )
    ? "unknown"
    : i.runtime;
  return { complete: i.complete, paths, runtime };
}
export function parseInventoryText(
  text: string,
  complete: boolean,
  runtime: Inventory["runtime"],
): Inventory {
  if (typeof text !== "string" || text.length > 1_000_000)
    throw new Error("Inventory text exceeds 1,000,000 characters.");
  const t = text.trim();
  let paths: unknown;
  if (t.startsWith("{") || t.startsWith("[")) {
    const parsed = JSON.parse(t);
    paths = Array.isArray(parsed) ? parsed : parsed.paths;
  } else
    paths = t
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  return inventoryValidated({ paths: paths as string[], complete, runtime });
}
export function parseRequestsText(text: string): string[] {
  if (typeof text !== "string" || text.length > 1_000_000)
    throw new Error("Request text exceeds 1,000,000 characters.");
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
}
/** SHA-256 of UTF-8 inputs, synchronous so the exact core runs in a Web Worker and CLI. */
export function sha256(text: string): string {
  const bytes = new TextEncoder().encode(text),
    length = bytes.length,
    buffer = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  buffer.set(bytes);
  buffer[length] = 128;
  const view = new DataView(buffer.buffer);
  view.setUint32(buffer.length - 8, Math.floor(length / 0x20000000));
  view.setUint32(buffer.length - 4, (length * 8) >>> 0);
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const h = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19,
    ],
    w = new Uint32Array(64),
    rotr = (a: number, n: number) => (a >>> n) | (a << (32 - n));
  for (let offset = 0; offset < buffer.length; offset += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(offset + j * 4);
    for (let j = 16; j < 64; j++) {
      const a = w[j - 15],
        b = w[j - 2];
      w[j] =
        (w[j - 16] +
          (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) +
          w[j - 7] +
          (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>>
        0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let j = 0; j < 64; j++) {
      const t1 =
          (hh +
            (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
            ((e & f) ^ (~e & g)) +
            k[j] +
            w[j]) >>>
          0,
        t2 =
          ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) +
            ((a & b) ^ (a & c) ^ (b & c))) >>>
          0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, j) => (h[j] = (h[j] + v) >>> 0));
  }
  return h.map((v) => v.toString(16).padStart(8, "0")).join("");
}
export function compare(input: Input): Report {
  if (!input || typeof input !== "object")
    throw new Error("Expected comparison input.");
  const inventory = inventoryValidated(input.inventory),
    assets = new Set(inventory.paths),
    n = parseConfig(input.netlify, "netlify"),
    c = parseConfig(input.pages, "pages");
  if (
    !Array.isArray(input.requests) ||
    input.requests.length > LIMITS.requests ||
    input.requests.some(
      (p) => typeof p !== "string" || p.length > LIMITS.pathChars,
    )
  )
    throw new Error(
      `Requests must be strings up to ${LIMITS.pathChars} characters; maximum ${LIMITS.requests}.`,
    );
  if (input.autoAssets !== undefined && typeof input.autoAssets !== "boolean")
    throw new Error("autoAssets must be boolean.");
  const supplied = [...new Set(input.requests)],
    all = new Map<string, "supplied" | "asset">(
      supplied.map((p) => [p, "supplied"]),
    );
  if (input.autoAssets !== false)
    for (const a of inventory.paths)
      if (ASSET.test(a) && !all.has(a)) all.set(a, "asset");
  if (all.size > LIMITS.requests)
    throw new Error(
      `Corpus including assets exceeds ${LIMITS.requests} requests. Narrow the build or disable automatic assets.`,
    );
  if (!all.size)
    throw new Error("Add at least one request or an auto-included asset.");
  let work = 0;
  const spend = () => {
    if (++work > LIMITS.work)
      throw new Error(
        "Comparison work limit exceeded. Reduce the rule or request corpus.",
      );
  };
  const results: Result[] = [];
  for (const [path, origin] of all) {
    const netlify = trace("netlify", path, n.rules, assets, inventory, spend),
      pages = trace("pages", path, c.rules, assets, inventory, spend);
    const verdict =
      netlify.kind === "unknown" || pages.kind === "unknown"
        ? "UNKNOWN"
        : netlify.kind === pages.kind &&
            netlify.status === pages.status &&
            netlify.target === pages.target
          ? "SAME"
          : "CHANGED";
    const interception =
      verdict === "CHANGED" &&
      netlify.kind === "asset" &&
      ASSET.test(path) &&
      (pages.kind === "rewrite" || pages.kind === "redirect");
    results.push({
      path,
      origin,
      verdict,
      reason:
        verdict === "UNKNOWN"
          ? "At least one initial request outcome is outside the supported profile."
          : verdict === "SAME"
            ? "Initial action, status and target agree for this supplied request."
            : "Initial action, status or target differs.",
      interception,
      netlify,
      pages,
    });
  }
  return {
    schemaVersion: 1,
    profile: {
      id: "static-path-v1",
      date: "2026-10-03",
      evidence:
        "Documentation-derived model; local emulator evidence, when present, is separate. No production conformance claim.",
      scope:
        "Initial request routing only. Same does not compare bytes, headers, cache, DNS, security or production deployment.",
    },
    inputs: {
      digests: {
        netlify: sha256(input.netlify),
        pages: sha256(input.pages),
        inventory: sha256(JSON.stringify(inventory)),
        requests: sha256(
          JSON.stringify({
            requests: input.requests,
            autoAssets: input.autoAssets !== false,
          }),
        ),
      },
      inventoryComplete: inventory.complete,
      runtime: inventory.runtime,
    },
    coverage: {
      supplied: supplied.length,
      autoAdded: all.size - supplied.length,
      total: all.size,
      same: results.filter((r) => r.verdict === "SAME").length,
      changed: results.filter((r) => r.verdict === "CHANGED").length,
      unknown: results.filter((r) => r.verdict === "UNKNOWN").length,
      intercepted: results.filter((r) => r.interception).length,
    },
    diagnostics: [...n.diagnostics, ...c.diagnostics],
    results,
  };
}
const escape = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function reportHtml(report: Report): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Route Witness report</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:0 24px;color:#18343b;background:#f4f6f3}article{border:1px solid #aebfbb;padding:20px;margin:20px 0;background:white}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:38px}code{overflow-wrap:anywhere}</style><h1>Route Witness</h1><p>${escape(report.profile.evidence)}</p><p>${escape(report.profile.scope)}</p><pre>${escape(JSON.stringify(report.coverage, null, 2))}</pre>${report.results.map((r) => `<article><h2>${escape(r.verdict)} · ${escape(r.path)}</h2><p>${escape(r.reason)} ${r.interception ? "Asset interception risk (extension-based evidence)." : ""}</p><h3>Netlify</h3><pre>${escape(JSON.stringify(r.netlify, null, 2))}</pre><h3>Cloudflare Pages</h3><pre>${escape(JSON.stringify(r.pages, null, 2))}</pre></article>`).join("")}<h2>Evidence & reproducibility</h2><pre>${escape(JSON.stringify({ profile: report.profile, inputs: report.inputs, diagnostics: report.diagnostics }, null, 2))}</pre></html>`;
}
