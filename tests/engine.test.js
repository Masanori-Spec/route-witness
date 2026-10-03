import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  compare,
  sha256,
  parseInventoryText,
  parseRequestsText,
  reportHtml,
  LIMITS,
} from "../build/engine.js";
const base = {
  netlify: "",
  pages: "",
  inventory: {
    complete: true,
    runtime: "static",
    paths: [
      "/assets/app.js",
      "/assets/style.css",
      "/fallback.txt",
      "/index.html",
      "/b.txt",
      "/c.txt",
    ],
  },
  requests: ["/assets/app.js"],
  autoAssets: false,
};
const run = (n = "", p = n, path = "/assets/app.js", extra = {}) =>
  compare({ ...base, netlify: n, pages: p, requests: [path], ...extra });
const first = (...args) => run(...args).results[0];
for (const [name, n, p, url, expected] of [
  [
    "static exists",
    "",
    "",
    "/assets/app.js",
    ["SAME", "asset", 200, "/assets/app.js", "asset", 200, "/assets/app.js"],
  ],
  [
    "asset shadow",
    "/* /fallback.txt 200",
    undefined,
    "/assets/app.js",
    [
      "CHANGED",
      "asset",
      200,
      "/assets/app.js",
      "rewrite",
      200,
      "/fallback.txt",
    ],
  ],
  [
    "forced",
    "/* /fallback.txt 200!",
    "/* /fallback.txt 200",
    "/assets/app.js",
    ["SAME", "rewrite", 200, "/fallback.txt", "rewrite", 200, "/fallback.txt"],
  ],
  [
    "default differs",
    "/old /new",
    undefined,
    "/old",
    ["CHANGED", "redirect", 301, "/new", "redirect", 302, "/new"],
  ],
  [
    "explicit default",
    "/old /new 302",
    undefined,
    "/old",
    ["SAME", "redirect", 302, "/new", "redirect", 302, "/new"],
  ],
  [
    "splat expands",
    "/old/* /new/:splat 301",
    undefined,
    "/old/a/b",
    ["SAME", "redirect", 301, "/new/a/b", "redirect", 301, "/new/a/b"],
  ],
  [
    "literal and wildcard order",
    "/old/* /dynamic/:splat 302\n/old/a /specific 301",
    undefined,
    "/old/a",
    ["SAME", "redirect", 302, "/dynamic/a", "redirect", 302, "/dynamic/a"],
  ],
  [
    "exact before wildcard",
    "/old/a /specific 301\n/old/* /dynamic/:splat 302",
    undefined,
    "/old/a",
    ["SAME", "redirect", 301, "/specific", "redirect", 301, "/specific"],
  ],
  [
    "one hop rewrite",
    "/a /b.txt 200\n/b.txt /c.txt 200",
    undefined,
    "/a",
    ["SAME", "rewrite", 200, "/b.txt", "rewrite", 200, "/b.txt"],
  ],
  [
    "external redirect",
    "/old https://example.invalid/new 301",
    undefined,
    "/old",
    [
      "SAME",
      "redirect",
      301,
      "https://example.invalid/new",
      "redirect",
      301,
      "https://example.invalid/new",
    ],
  ],
])
  test(name, () => {
    const r = first(n, p ?? n, url);
    assert.deepEqual(
      [
        r.verdict,
        r.netlify.kind,
        r.netlify.status,
        r.netlify.target,
        r.pages.kind,
        r.pages.status,
        r.pages.target,
      ],
      expected,
    );
  });

test("interception evidence includes rule and asset", () => {
  const r = first("/* /fallback.txt 200");
  assert.equal(r.interception, true);
  assert.equal(r.netlify.evidence[0].line, 1);
  assert.ok(
    r.netlify.evidence.some(
      (e) => e.type === "asset" && e.detail === "/assets/app.js",
    ),
  );
});
test("force not silently stripped", () =>
  assert.equal(first("/* /fallback.txt 200!").pages.kind, "unknown"));
test("Netlify shadow returns file before later forced rule", () => {
  const r = first(
    "/assets/app.js /fallback.txt 200\n/assets/app.js /c.txt 200!",
  );
  assert.equal(r.netlify.kind, "asset");
  assert.equal(r.netlify.target, "/assets/app.js");
});
test("missing inventory target unknown", () =>
  assert.equal(
    first("/a /absent.txt 200", undefined, "/a").verdict,
    "UNKNOWN",
  ));
test("unknown fallback missing file", () =>
  assert.equal(first("", "", "/missing").verdict, "UNKNOWN"));
test("Pages HTML rewrite remains unknown after observed canonicalization", () => {
  const r = first("/a /index.html 200", undefined, "/a");
  assert.equal(r.pages.kind, "unknown");
  assert.equal(r.netlify.kind, "rewrite");
});
test("Pages wildcard-to-index rejection is not silently skipped", () => {
  const r = first("/* /index.html 200");
  assert.equal(r.verdict, "UNKNOWN");
  assert.match(r.pages.reason, /parser rejects/);
});
test("unsupported earlier condition taints request", () =>
  assert.equal(
    first("/assets/* /x 301 Country=jp\n/* /fallback.txt 200").verdict,
    "UNKNOWN",
  ));
test("unsupported unmatched exact condition does not taint", () =>
  assert.equal(
    first("/other /x 301 Country=jp\n/* /fallback.txt 200").verdict,
    "CHANGED",
  ));
test("unknown named source may match anything", () =>
  assert.equal(
    first("/:name /x 301\n/* /fallback.txt 200").verdict,
    "UNKNOWN",
  ));
test("later unsupported rule does not taint resolved first match", () =>
  assert.equal(
    first("/old /new 301\n/:any /later", undefined, "/old").verdict,
    "SAME",
  ));
for (const path of [
  "/",
  "/x/",
  "/x.html",
  "/x.htm",
  "/a%2Fb",
  "/a?x=1",
  "/a#x",
  "//host/a",
  "/a/../b",
  "/a/./b",
  "/a\\b",
  "/日本語",
  "/x\u0000",
  "https://x/y",
])
  test(`unsupported request ${JSON.stringify(path)}`, () =>
    assert.equal(
      first("/* /fallback.txt 200", undefined, path).verdict,
      "UNKNOWN",
    ));
for (const rule of [
  "/x https://example.com/ 200",
  "/x /y 302!",
  "/x /y 404",
  "/x /y 301 extra",
  "/x /y?query=1 301",
  "/x /y#fragment 301",
  "/x /y/%2f 301",
])
  test(`unsupported Pages rule ${rule}`, () =>
    assert.equal(first("", rule, "/x").pages.kind, "unknown"));
for (const code of [303, 307, 308])
  test(`Netlify unverified ${code}`, () => {
    const r = first(`/x /y ${code}`, undefined, "/x");
    assert.equal(r.netlify.kind, "unknown");
    assert.equal(r.pages.kind, "redirect");
  });
test("HTML alias unknown for request", () =>
  assert.equal(
    first("/a /b 301", undefined, "/a", {
      inventory: { ...base.inventory, paths: ["/a.html"] },
    }).verdict,
    "UNKNOWN",
  ));
test("partial inventory never yields confident result", () =>
  assert.equal(
    first("/old /new 301", undefined, "/old", {
      inventory: { ...base.inventory, complete: false },
    }).verdict,
    "UNKNOWN",
  ));
test("runtime unknown never yields confident result", () =>
  assert.equal(
    first("/old /new 301", undefined, "/old", {
      inventory: { ...base.inventory, runtime: "unknown" },
    }).verdict,
    "UNKNOWN",
  ));
test("runtime marker overrides static claim", () => {
  const r = run("", "", "/assets/app.js", {
    inventory: {
      ...base.inventory,
      paths: [...base.inventory.paths, "/_worker.js"],
    },
  });
  assert.equal(r.inputs.runtime, "unknown");
  assert.equal(r.results[0].verdict, "UNKNOWN");
});
test("corpus auto adds only asset extensions and deduplicates", () => {
  const r = compare({
    ...base,
    autoAssets: true,
    requests: ["/assets/app.js", "/assets/app.js"],
  });
  assert.equal(r.coverage.supplied, 1);
  assert.equal(r.coverage.autoAdded, 1);
  assert.equal(r.coverage.total, 2);
});
test("input order preserved; auto inventory sorted", () => {
  const r = compare({ ...base, autoAssets: true, requests: ["/z", "/a"] });
  assert.deepEqual(
    r.results.map((r) => r.path),
    ["/z", "/a", "/assets/app.js", "/assets/style.css"],
  );
});
test("redirect cycle bounded", () => {
  const r = first("/a /b 301\n/b /a 302", undefined, "/a");
  assert.equal(r.netlify.chainEnd, "loop");
  assert.equal(r.netlify.trace.length, 2);
});
test("redirect hop cap", () => {
  const rules = Array.from(
    { length: 10 },
    (_, i) => `/a${i} /a${i + 1} 301`,
  ).join("\n");
  const r = first(rules, undefined, "/a0");
  assert.equal(r.netlify.chainEnd, "hop-limit");
  assert.equal(r.netlify.trace.length, 8);
});
test("external redirects never traversed", () => {
  const r = first("/a https://example.invalid/ 301", undefined, "/a");
  assert.equal(r.pages.chainEnd, "external");
  assert.equal(r.pages.trace.length, 1);
});
test("initial SAME can have unknown subsequent trace and says initial", () => {
  const r = first("/a /missing 301", undefined, "/a");
  assert.equal(r.verdict, "SAME");
  assert.equal(r.pages.chainEnd, "unknown");
  assert.match(r.reason, /Initial/);
});
test("input digests and result deterministic", () =>
  assert.deepEqual(run("/* /fallback.txt 200"), run("/* /fallback.txt 200")));
for (const text of ["", "abc", "日本語", "x".repeat(1000)])
  test(`sha256 ${text.length}`, () =>
    assert.equal(
      sha256(text),
      createHash("sha256").update(text).digest("hex"),
    ));
test("text and JSON inventory explicit controls", () => {
  assert.deepEqual(parseInventoryText("/a.txt\n/b.txt\n", true, "static"), {
    complete: true,
    paths: ["/a.txt", "/b.txt"],
    runtime: "static",
  });
  assert.equal(
    parseInventoryText(
      '{"paths":["/x.txt"],"complete":true,"runtime":"static"}',
      false,
      "unknown",
    ).complete,
    false,
  );
});
test("requests trim and skip comments", () =>
  assert.deepEqual(parseRequestsText("# paths\n/a\n\n /b "), ["/a", "/b"]));
test("safe escaped standalone HTML", () => {
  const r = run("", "", "/x<script>alert(1)</script>");
  const html = reportHtml(r);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("default-src 'none'"));
});
for (const input of [
  { ...base, inventory: { paths: [], runtime: "static" } },
  { ...base, inventory: { ...base.inventory, paths: ["/../escape"] } },
  { ...base, inventory: { ...base.inventory, paths: ["/x", "/x"] } },
  { ...base, requests: [] },
  { ...base, requests: [42] },
  { ...base, autoAssets: "false" },
])
  test("invalid structural input throws", () =>
    assert.throws(() => compare(input)));
test("caps config text", () =>
  assert.throws(() => run("x".repeat(LIMITS.configChars + 1))));
test("caps config lines", () =>
  assert.throws(() => run("\n".repeat(LIMITS.ruleLines))));
test("caps corpus including auto", () =>
  assert.throws(() =>
    compare({
      ...base,
      autoAssets: true,
      inventory: {
        ...base.inventory,
        paths: Array.from({ length: 2001 }, (_, i) => `/a${i}.js`),
      },
    }),
  ));
test("caps Pages dynamic rules", () =>
  assert.throws(() =>
    run(
      "",
      Array.from({ length: 101 }, (_, i) => `/a${i}/* /b/:splat 302`).join(
        "\n",
      ),
    ),
  ));
test("adversarial regex characters never interpreted", () =>
  assert.equal(
    first("/(a+)+ /b 301", undefined, "/aaaaaaaa").verdict,
    "UNKNOWN",
  ));
test("source lines retain comments and blank lines", () =>
  assert.equal(
    first("# comment\n\n/old /new 301", undefined, "/old").pages.evidence[0]
      .line,
    3,
  ));
test("duplicate evidence", () =>
  assert.ok(
    run("/old /new 301\n/old /again 302", undefined, "/old").diagnostics.some(
      (d) => d.code === "DUPLICATE_SOURCE",
    ),
  ));
test("no mutation of input", () => {
  const input = structuredClone(base);
  compare(input);
  assert.deepEqual(input, base);
});
test("Pages counts exact rules in dynamic tail budget", () =>
  assert.throws(
    () =>
      run(
        "",
        [
          "/unused/* /target.txt 302",
          ...Array.from({ length: 100 }, (_, i) => `/r${i} /target.txt 302`),
        ].join("\n"),
        "/r99",
      ),
    /dynamic-tail/,
  ));
test("external raw dot segments never normalized into supported input", () =>
  assert.equal(
    first("/a https://example.com/a/../b 301", undefined, "/a").verdict,
    "UNKNOWN",
  ));
for (const target of [
  "http://example.invalid/a",
  "https://example.invalid",
  "https://EXAMPLE.invalid:443/a",
  "https://127.1/a",
  "https://127.0.0.1/a",
])
  test(`uncertain external serialization ${target}`, () =>
    assert.equal(
      first(`/x ${target} 302`, undefined, "/x").verdict,
      "UNKNOWN",
    ));
test("Netlify wildcard bare-prefix normalization cannot become false SAME", () => {
  const r = first(
    "/edge/* /target.txt 302\n/edge /other.txt 302",
    undefined,
    "/edge",
  );
  assert.equal(r.verdict, "UNKNOWN");
  assert.equal(r.netlify.kind, "unknown");
  assert.equal(r.pages.target, "/other.txt");
});
test("earlier exact source resolves before a later bare-prefix wildcard", () =>
  assert.equal(
    first("/edge /other.txt 302\n/edge/* /target.txt 302", undefined, "/edge")
      .verdict,
    "SAME",
  ));
