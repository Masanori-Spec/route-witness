#!/usr/bin/env node
import { open, lstat, opendir, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compare,
  reportHtml,
  parseRequestsText,
  LIMITS,
} from "../build/engine.js";

export async function readBounded(file, max = 1_000_000) {
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error(
      "Input must be a regular file, not a symlink or special file.",
    );
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > max)
      throw new Error("Input must be a bounded regular file.");
    const buffer = Buffer.alloc(max + 1);
    let used = 0;
    while (used <= max) {
      const { bytesRead } = await handle.read(
        buffer,
        used,
        max + 1 - used,
        null,
      );
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > max) throw new Error("Input grew beyond its size limit.");
    return new TextDecoder("utf-8", { fatal: true }).decode(
      buffer.subarray(0, used),
    );
  } finally {
    await handle.close();
  }
}
export async function scanBuild(root, staticOnly = false) {
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("Build root must be a real directory, not a symlink.");
  const base = await realpath(root),
    paths = [];
  let visited = 0;
  async function walk(dir, relative, depth) {
    if (depth > 32) throw new Error("Maximum build directory depth is 32.");
    const entries = await opendir(dir);
    for await (const entry of entries) {
      if (++visited > 20_000)
        throw new Error("Maximum 20,000 filesystem entries.");
      const file = path.join(dir, entry.name),
        rel = relative + "/" + entry.name;
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${rel}`);
      const resolved = await realpath(file);
      if (!resolved.startsWith(base + path.sep))
        throw new Error("Build path escaped its root.");
      if (stat.isDirectory()) await walk(file, rel, depth + 1);
      else if (stat.isFile()) {
        paths.push(rel);
        if (paths.length > LIMITS.inventoryPaths)
          throw new Error("Inventory file limit exceeded.");
      } else throw new Error(`Special file rejected: ${rel}`);
    }
  }
  await walk(base, "", 0);
  return {
    complete: true,
    paths: paths.sort(),
    runtime: staticOnly ? "static" : "unknown",
  };
}
export async function main(args) {
  if (args.includes("--help") || args.length === 0) {
    console.log(`Route Witness 0.1 · documentation-derived static request model

Compare:
  node src/cli.js --netlify source.txt --pages target.txt --build public --requests paths.txt --static
  node src/cli.js --netlify source.txt --pages target.txt --inventory inventory.json --requests paths.txt --static
Inventory only:
  node src/cli.js --scan public --static > inventory.json

Options: --html (standalone HTML on stdout), --no-auto-assets
--static attests there are no Functions, Workers, framework adapters or additional routing.
Without this attestation all requests are UNKNOWN. Inventory JSON must explicitly
contain complete:boolean, paths:string[], runtime:static|unknown. --static never
overrides an inventory that says runtime:unknown. Runtime markers also force UNKNOWN.
Both configs are required; this does not convert or silently edit configurations.
Exit: 0 all SAME, 1 any CHANGED or UNKNOWN, 2 input/IO/limit error.
SAME compares only initial action/status/target, never bytes/headers or a hosted CDN.`);
    return 0;
  }
  const values = {},
    flags = new Set(),
    valueKeys = new Set([
      "--netlify",
      "--pages",
      "--build",
      "--inventory",
      "--requests",
      "--scan",
    ]),
    flagKeys = new Set(["--static", "--html", "--no-auto-assets"]);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (values[key] !== undefined || flags.has(key))
      throw new Error(`Duplicate option ${key}`);
    if (flagKeys.has(key)) flags.add(key);
    else if (valueKeys.has(key)) {
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error(`Missing value ${key}`);
      values[key] = args[++i];
    } else throw new Error(`Unknown option ${key}`);
  }
  if (values["--scan"]) {
    if (
      Object.keys(values).length !== 1 ||
      [...flags].some((f) => f !== "--static")
    )
      throw new Error("--scan accepts only --static.");
    console.log(
      JSON.stringify(
        await scanBuild(values["--scan"], flags.has("--static")),
        null,
        2,
      ),
    );
    return 0;
  }
  if (
    !values["--netlify"] ||
    !values["--pages"] ||
    !values["--requests"] ||
    !!values["--build"] === !!values["--inventory"]
  )
    throw new Error(
      "Require both configs, requests and exactly one of --build or --inventory.",
    );
  const inventory = values["--build"]
    ? await scanBuild(values["--build"], flags.has("--static"))
    : JSON.parse(await readBounded(values["--inventory"]));
  if (!flags.has("--static")) inventory.runtime = "unknown";
  const result = compare({
    netlify: await readBounded(values["--netlify"], LIMITS.configChars),
    pages: await readBounded(values["--pages"], LIMITS.configChars),
    inventory,
    requests: parseRequestsText(await readBounded(values["--requests"])),
    autoAssets: !flags.has("--no-auto-assets"),
  });
  console.log(
    flags.has("--html") ? reportHtml(result) : JSON.stringify(result, null, 2),
  );
  return result.coverage.changed || result.coverage.unknown ? 1 : 0;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`route-witness: ${error.message}`);
      process.exitCode = 2;
    });
}
