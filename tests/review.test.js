import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { compare, reportHtml } from "../build/engine.js";

const run = (rules, request, paths = ["/target.txt", "/404.html"]) =>
  compare({
    netlify: rules,
    pages: rules,
    requests: [request],
    autoAssets: false,
    inventory: { complete: true, runtime: "static", paths },
  }).results[0];

test(
  "FIFO inputs reject promptly before awaiting a writer",
  { skip: process.platform === "win32" },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "route-review-"));
    try {
      const fifo = path.join(dir, "input.fifo");
      const create = spawnSync("mkfifo", [fifo], { encoding: "utf8" });
      assert.equal(create.status, 0, create.stderr);
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import {readBounded} from './src/cli.js';
       try { await readBounded(process.argv[1]); process.exitCode = 99; }
       catch (error) { console.error(error.message); process.exitCode = 2; }`,
          fifo,
        ],
        { encoding: "utf8", timeout: 2000 },
      );
      assert.equal(
        result.error,
        undefined,
        "Input open must not wait for a FIFO writer",
      );
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /regular file/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

// Measured locally on netlify-cli 27.10.2 / wrangler 4.147.0:
// Netlify served these control-file rewrites with 200; Pages returned 502.
for (const target of ["/_redirects", "/_headers"]) {
  test(`control-file rewrite ${target} is not a confident SAME`, () => {
    const result = run(`/probe ${target} 200`, "/probe", [target, "/404.html"]);
    assert.equal(result.verdict, "UNKNOWN");
    assert.equal(result.pages.kind, "unknown");
  });
}

// Netlify's parser rejects the full /.netlify prefix, not just /.netlify/.
for (const request of ["/.netlify", "/.netlifyx"]) {
  test(`reserved Netlify prefix ${request} remains unknown`, () => {
    assert.equal(run(`${request} /target.txt 302`, request).verdict, "UNKNOWN");
  });
}

for (const target of [
  "https://example.invalid",
  "https://EXAMPLE.invalid:443/a",
  "https://127.1/a",
]) {
  test(`noncanonical external destination ${target} remains unknown`, () => {
    assert.equal(run(`/probe ${target} 302`, "/probe").verdict, "UNKNOWN");
  });
}

test("Pages HTTP destination rejected by pinned parser remains unknown", () => {
  const result = run("/probe http://example.invalid/a 302", "/probe");
  assert.equal(result.verdict, "UNKNOWN");
  assert.equal(result.pages.kind, "unknown");
});

test("Netlify slashless wildcard-prefix match never silently falls through", () => {
  const result = run("/edge/* /target.txt 302\n/edge /other.txt 302", "/edge");
  assert.equal(result.verdict, "UNKNOWN");
  assert.equal(result.netlify.kind, "unknown");
  assert.equal(result.pages.target, "/other.txt");
});

test("standalone report escapes injected text in every rendered data section", () => {
  const report = compare({
    netlify: "",
    pages: "",
    requests: ["/target.txt"],
    autoAssets: false,
    inventory: { complete: true, runtime: "static", paths: ["/target.txt"] },
  });
  const attack = `</pre></article><script>alert('x')</script><img src=x onerror="alert(1)">`;
  report.profile.evidence = attack;
  report.profile.scope = attack;
  report.results[0].path = attack;
  report.results[0].reason = attack;
  report.results[0].netlify.reason = attack;
  report.results[0].pages.target = attack;
  report.diagnostics.push({
    platform: "pages",
    line: 1,
    code: "UNSUPPORTED",
    message: attack,
  });
  const html = reportHtml(report);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("default-src 'none'"));
});
