# Route Witness

**同じ `_redirects` でも、同じ応答になるとは限りません。**

Netlify から Cloudflare Pages への静的サイト移行を、実際のビルドファイル一覧と URL コーパスで点検するローカルツールです。2 つの設定を別々に評価し、初回リクエストの処理・ステータス・対象を **SAME / CHANGED / UNKNOWN** と、設定行・ファイルの根拠で表示します。

An asset-aware, local-only request-outcome comparator for Netlify → Cloudflare Pages. It takes **two independently supplied `_redirects` files**, a complete build-file inventory and explicit URL paths. It compares initial routing actions and explains each difference. It does **not** convert configurations or certify production parity.

## Why use it?

A copied catch-all can intercept a real JavaScript file on Pages while Netlify lets that file shadow the rule. A missing status means **301 on Netlify and 302 on Pages**. Syntax that looks compatible can have other runtime constraints. Route Witness makes these risks reviewable as concrete request witnesses.

The included safe demonstration is `/* /fallback.txt 200` with a real `/assets/app.js`. Netlify serves that JS; Pages rewrites to the text file. This illustrates asset interception, not a MIME prediction. The usual `/* /index.html 200` is deliberately **UNKNOWN**: a pinned Wrangler parser rejected that rule as a loop, contrary to an overly broad documentation-only interpretation. A rewrite to `/shell.html` also produced a canonicalization redirect in the local fixture. See [measured evidence](docs/emulator-evidence.md).

## Run locally

Requires Node.js 22 or 24. No account, API key or runtime service.

```sh
npm ci --ignore-scripts
npm run check
npm run serve
```

Open `http://127.0.0.1:4173` after the build. The English / 日本語 interface works locally, with a Web Worker, cancellation, filters, source-line evidence, file import, JSON and self-contained HTML reports. It does not upload your configs or contact redirect destinations. Opening a hosted copy necessarily downloads the static application assets from that host; input processing stays in the browser.

### CLI

```sh
node src/cli.js \
  --netlify fixtures/demo/netlify.txt \
  --pages fixtures/demo/pages.txt \
  --build fixtures/demo/build \
  --requests fixtures/demo/requests.txt \
  --static > report.json
```

Exit code `0`: all initial outcomes SAME; `1`: at least one CHANGED or UNKNOWN; `2`: invalid input, I/O error or resource limit. Use `--html > report.html` for an escaped, script-free report. No result means “safe to deploy.”

```sh
node src/cli.js --scan path/to/build --static > inventory.json
node src/cli.js --netlify old.txt --pages proposed.txt \
  --inventory inventory.json --requests requests.txt --static
```

`--static` attests no Functions, Workers, framework adapters or extra routing influence the test. A manifest explicitly saying `runtime: "unknown"` is not overridden. Detected `_worker.js`, `_routes.json` or `.netlify` runtime paths also force UNKNOWN. The scanner reads file names, not asset contents, rejects symlinks and special files, and does not follow redirects or contact a deployment. Run it on an immutable finished build: it is not an atomic snapshot of a concurrently changing directory. The inventory describes the same static build on both hosts; different builds need separate analysis outside this version.

Inventory JSON:

```json
{
  "complete": true,
  "runtime": "static",
  "paths": ["/assets/app.js", "/assets/style.css", "/fallback.txt"]
}
```

UI inventory text can instead contain one root-relative file path per line. The UI's completeness/static-only controls are explicit attestations; pasted JSON cannot silently grant those assurances. A partial inventory always yields UNKNOWN. JS/CSS/image/font file paths are optionally appended to the corpus. Their extensions identify candidates, not verified content types.

## Bounded scope

- ASCII, canonical, root-relative request paths; exact source or one terminal `/*` and one destination `:splat`
- Netlify: 200, 301, 302 and explicit `!`; omitted status 301
- Pages: 200, 301, 302, 303, 307, 308; omitted status 302; `!` is never silently removed
- Exact non-HTML static files, canonical HTTPS external redirects and literal one-hop rewrite targets; client redirects have a separate bounded informational trace
- First matching rule with line evidence; an unsupported earlier potentially matching line blocks a confident result
- SHA-256 input digests, deterministic JSON, separately counted changed/unknown/intercepted requests

**UNKNOWN** is intentional for HTML canonicalization, trailing-slash/root requests, query/fragment/percent encoding, non-ASCII paths, named placeholders, conditions, domains, external 200 proxies, missing rewrite targets, SPA/404 fallback, runtime routing, and unverified status behavior. Netlify 307 remains UNKNOWN even though one local emulator returned it, because current Netlify docs call it unsupported. 303/308 on Netlify also remain outside this profile.

SAME compares only the **first action, status and target**. It does not compare bytes, MIME, headers, cache, cookies, DNS, host redirects or production behavior. Later redirect traces can end UNKNOWN or in a loop even when the first outcome is SAME. Read the evidence and scope; this is a corpus review aid, not an exhaustive route proof.

## Verification

- TypeScript strict checking and Node unit/adversarial/CLI tests
- 46 measured HTTP requests against pinned official local runtimes; 41 asserted fixture matches and five investigative measurements
- Independent regression comparison against those recorded measurements: **34 supported model outcomes match status/location/body fingerprints; 12 are explicitly UNKNOWN**
- Source/fixture and dependency-lock digests are checked in the test suite
- Sandboxed Chromium desktop/mobile/repeated/cancel/stale-state tests are prepared in CI; see [verification status](docs/verification.md) for what has actually run

```sh
npm test
node scripts/emulator-check.mjs --check-fixtures
# Optional heavier official runtime check, no deployment/account:
npm ci --ignore-scripts --prefix fixtures/emulator/oracle
node scripts/emulator-check.mjs --run
```

The official emulator tools are isolated development dependencies, never shipped in the app. Netlify static fixtures disable out-of-scope Edge Functions through a CLI internal option after its offline Deno setup failed. This limited evidence cannot establish hosted CDN conformance. [Reproducibility and discrepancies](docs/emulator-evidence.md)

## Positioning, sources and safety

Existing tools already validate, simulate and convert redirect rules. Route Witness focuses on **paired request outcomes using a real build inventory**, with explicit uncertainty. It is not claimed as novel or first. [Alternatives and difference](docs/positioning.md) · [Model/source boundaries](docs/semantics.md) · [Security](SECURITY.md)

No project-source license has been assigned. See [third-party notices](THIRD_PARTY_NOTICES.md) for development-tool attribution. Netlify and Cloudflare are their respective owners' product names; this project is unaffiliated.
