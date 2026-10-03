# API contract · v0.1

`compare(input)` in `src/engine.ts` returns a deterministic JSON-compatible report synchronously. It performs no network, filesystem, DOM or clock access, and is shared by the CLI and browser Worker. Invalid structure or an exceeded resource limit throws an Error; a request outside the supported semantic profile produces UNKNOWN.

## Input

```ts
{
  netlify: string;
  pages: string;
  inventory: {
    complete: boolean;
    paths: string[];
    runtime: "static" | "unknown";
  };
  requests: string[];
  autoAssets?: boolean; // true when omitted
}
```

Inventory paths are URL-root file paths such as `/assets/app.js`; `.html` files may be listed even though request/canonicalization support is restricted. Completeness and runtime are required, explicit assertions. Runtime markers force UNKNOWN even if the caller selected static. Both configurations and the same inventory are used as supplied; there is no conversion.

`parseInventoryText(text, complete, runtime)` accepts one path per line, a JSON paths array, or an object containing `paths`. Its explicit arguments override JSON attestations. `parseRequestsText(text)` trims lines and skips blank/comment lines. Both text parsers have a 1,000,000-character ingress cap. Full resource/grammar limits are exported as `LIMITS` and documented in [semantics](semantics.md).

## Report

```ts
{
  schemaVersion: 1;
  profile: { id, date, evidence, scope };
  inputs: {
    digests: { netlify, pages, inventory, requests }; // SHA-256
    inventoryComplete: boolean;
    runtime: "static" | "unknown";
  };
  coverage: { supplied, autoAdded, total, same, changed, unknown, intercepted };
  diagnostics: Array<{ platform, line, code, message }>;
  results: Array<{
    path: string;
    origin: "supplied" | "asset";
    verdict: "SAME" | "CHANGED" | "UNKNOWN";
    reason: string;
    interception: boolean;
    netlify: Outcome;
    pages: Outcome;
  }>;
}
```

An Outcome contains `kind` (`asset`, `redirect`, `rewrite`, `unknown`), `status` (number or null), `target` (string or null), an English `reason`, `evidence`, `trace` and `chainEnd` (`terminal`, `external`, `unknown`, `loop`, `hop-limit`). Evidence entries contain `type` (`rule`, `asset`, `scope`, `ordering`), optional physical `line`, and `detail`. A trace step contains request `path`, `kind`, `status`, `target` and nullable rule `line`.

Only initial kind/status/target determine the verdict. Different actions remain CHANGED even when they name the same target file. UNKNOWN on either initial outcome makes the comparison UNKNOWN; later trace uncertainty does not retroactively change the initial verdict. Traces are bounded to eight steps and evidence is bounded to six entries. Redirect destinations are never fetched.

`reportHtml(report)` returns an escaped, script-free, standalone HTML report with restrictive CSP. `sha256(text)` is a synchronous UTF-8 digest implementation, checked against Node's cryptographic implementation. Browser response validation rejects malformed Worker payloads before rendering.

## Stability

No timestamps or environment paths appear in a generated comparison. Unique explicit requests retain first-seen order; auto-added candidate assets are sorted. Inventory paths are sorted; duplicate inventory paths are errors. The raw configuration strings and original request list influence digests, including semantically insignificant differences. SAME is a bounded routing statement, not a byte-level or production-conformance guarantee.
