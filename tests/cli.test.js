import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { scanBuild, readBounded } from "../src/cli.js";
const cli = (...args) =>
  spawnSync(process.execPath, ["src/cli.js", ...args], { encoding: "utf8" });
test("demo CLI reports changes", () => {
  const r = cli(
    "--netlify",
    "fixtures/demo/netlify.txt",
    "--pages",
    "fixtures/demo/pages.txt",
    "--build",
    "fixtures/demo/build",
    "--requests",
    "fixtures/demo/requests.txt",
    "--static",
  );
  assert.equal(r.status, 1, r.stderr);
  const data = JSON.parse(r.stdout);
  assert.ok(data.coverage.intercepted >= 2);
  assert.equal(data.inputs.runtime, "static");
});
test("CLI no static attestation all unknown", () => {
  const r = cli(
    "--netlify",
    "fixtures/demo/netlify.txt",
    "--pages",
    "fixtures/demo/pages.txt",
    "--build",
    "fixtures/demo/build",
    "--requests",
    "fixtures/demo/requests.txt",
  );
  const data = JSON.parse(r.stdout);
  assert.equal(data.coverage.unknown, data.coverage.total);
});
test("CLI bad option and missing args exit2", () => {
  assert.equal(cli("--wat").status, 2);
  assert.equal(cli("--build", "x").status, 2);
  assert.equal(cli("--scan", "x", "--html").status, 2);
});
test("CLI HTML report static no script", () => {
  const r = cli(
    "--netlify",
    "fixtures/demo/netlify.txt",
    "--pages",
    "fixtures/demo/pages.txt",
    "--build",
    "fixtures/demo/build",
    "--requests",
    "fixtures/demo/requests.txt",
    "--static",
    "--html",
  );
  assert.ok(r.stdout.startsWith("<!doctype html>"));
  assert.ok(!r.stdout.includes("<script"));
});
test("inventory scanner complete sorted and symlink-safe", async () => {
  const d = await mkdtemp(path.join(os.tmpdir(), "route-witness-"));
  try {
    await mkdir(path.join(d, "assets"));
    await writeFile(path.join(d, "assets/a.js"), "a");
    await writeFile(path.join(d, "z.txt"), "z");
    assert.deepEqual(await scanBuild(d, true), {
      complete: true,
      paths: ["/assets/a.js", "/z.txt"],
      runtime: "static",
    });
    await symlink(path.join(d, "z.txt"), path.join(d, "link.txt"));
    await assert.rejects(() => scanBuild(d, true), /Symlink/);
    await assert.rejects(() => readBounded(path.join(d, "link.txt")));
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});
test("bounded reads reject size and malformed UTF8", async () => {
  const d = await mkdtemp(path.join(os.tmpdir(), "route-witness-"));
  try {
    const f = path.join(d, "x");
    await writeFile(f, "abc");
    await assert.rejects(() => readBounded(f, 2));
    await writeFile(f, Buffer.from([0xff]));
    await assert.rejects(() => readBounded(f));
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});
