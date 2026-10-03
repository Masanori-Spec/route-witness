# Official local emulator evidence

Research and observation date: **2026-10-03 UTC**. This is a bounded static-site migration study, not a production-equivalence guarantee. No deploys, accounts, bindings, tunnels, production requests, or customer files were used.

## What was actually observed

The final paired fixture run recorded **46 HTTP responses across six scenarios and two official local tools**. **41 asserted responses matched; five additional responses were investigative observations without a complete expectation.** Each response preserves status, normalized Location, Content-Type, byte count, and SHA-256 of the response body in [`observed-results.json`](../fixtures/emulator/observed-results.json). The report includes the complete fixture snapshot, lockfile digest, tool pins, exact invocation, logs, and timestamps. The test runner does **not** import the route-witness model.

| Fixture | Netlify CLI 27.10.2 (static only) | Wrangler Pages 4.147.0 |
| --- | --- | --- |
| `/default /target.txt`, no explicit status | 301 | 302 |
| Existing `/existing.txt`, unforced 301 rule | Existing bytes, 200 | 301 to target |
| `/* /target.txt 200`, existing JS request | JS bytes, 200 | Target text bytes, 200 |
| Same text rewrite, missing request | Target text bytes, 200 | Target text bytes, 200 |
| Exact rule before overlapping splat | Exact rule | Exact rule |
| Overlapping splat before exact rule | Earlier splat | Earlier splat |
| Duplicate source | First rule | First rule; warning for duplicate |
| `/a /b.txt 200`, then `/b.txt /c.txt 200` | `/a` serves b bytes | `/a` serves b bytes |
| Existing shadow.txt, first unforced rule then forced duplicate | Existing bytes, 200 | First rule redirects |
| Forced Netlify rewrite to shell.html | Shell bytes, 200 | Corresponding unforced Pages rule redirects 308 to `/shell` |
| Existing JS, rewrite to `/shell.html` | Existing JS, 200 | 308 to `/shell`, empty response body |
| Existing JS, rewrite to extensionless `/shell` backed by shell.html | Existing JS, 200 | Shell HTML bytes, 200 |
| `/* /index.html 200`, existing JS | Existing JS, 200 | Rule rejected; existing JS, 200 |
| `/* /index.html 200`, missing request with 404.html present | Index bytes, 200 | Rule rejected; custom 404 bytes, 404 |
| Explicit 303 / 307 / 308 | Local CLI emits each supplied code | Emits each supplied code |

These last three groups matter: copying a common SPA line does **not** justify assuming the expected HTML interception, and a 200 rewrite can encounter HTML canonicalization in this pinned Pages runtime. Netlify's current documentation explicitly says 307 is unsupported even though its local CLI emits 307. Keep uncertain cases UNKNOWN in a docs-oriented model. Local behavior cannot settle hosted-service contradictions.

### Evidence levels

1. **Documentation-derived:** current published semantics below
2. **Official-local observed:** the pinned CLI/Pages responses above, with the restrictions below
3. **Hosted production:** not tested; never claimed

`observed-core.json` retains the initial result, including the original HTML-200 hypothesis mismatch and the Netlify startup failure. `observed-netlify-core.json` records its static-only retry; `observed-index.json` records the isolated catchall-index investigation. Those earlier reports predate the final expectation edits; the final report and its embedded fixture snapshot are the replay baseline. Updating assertions after an observed discrepancy is explicitly recorded here, not counted as a successful original prediction.

## Reproduce locally or in CI

Use Node **24.19.0** for the observed environment. The selected tools require at least Node 22.13.0. Tool dependencies are deliberately isolated from app dependencies.

```sh
npm --prefix fixtures/emulator/oracle ci --ignore-scripts --no-audit --no-fund
node scripts/emulator-check.mjs --check-fixtures
node scripts/emulator-check.mjs --run
```

The lockfile freezes the tools and dependency graph. `--ignore-scripts` was used during the observed installation; the platform-specific published esbuild/workerd packages were sufficient here. A platform on which a binary is absent should report a setup blocker, not silently update packages or disable security features. Do not commit `oracle/node_modules`.

Optional scoped replay:

```sh
node scripts/emulator-check.mjs --run --platform cloudflare --scenario catchall-index --output /tmp/route-witness-index.json
```

Exit codes: `0` = selected asserted expectations matched, `1` = observed assertion mismatch, `2` = at least one runtime could not start. Some investigative rows intentionally have no Netlify status assertion; their actual fingerprints are still captured. Read the report counts and coverage before describing a scoped run as a full pass.

For CI, install from the isolated lockfile, run both commands, and retain `fixtures/emulator/local-results.json` as an artifact even on failure. This repository does not need access tokens or live provider projects for these tests. Compare against the saved observation artifact as evidence, not as an exhaustive CDN specification.

### Isolation and limitations

- Each scenario gets a fresh temporary fixture and temporary HOME/XDG configuration directory. The child environment is allowlisted and contains no inherited API credentials, service bindings, user config, or project links
- HTTP probes stay on 127.0.0.1 and never follow Location. Ports are allocated from the local free-port range. The runner removes temporary fixtures and terminates the child after each scenario
- Netlify runs `dev --offline --dir … --framework '#static' --no-open --internal-disable-edge-functions --skip-gitignore`. Without the last feature-disable flag, this version tried to initialize/download Deno despite offline mode and exited with `fetch failed`
- The hidden flag is defined by the official CLI for environments without Deno. It disables the unused Edge Functions feature, not a browser/OS security control. This makes the observation **static-only** and is not a claim to have tested Edge Functions
- Wrangler uses `pages dev`, explicit local IP, no service bindings, no login, and a fixed compatibility date. Metrics are disabled. Its automatic `Request.cf` metadata fetch could not resolve workers.cloudflare.com and fell back to placeholder metadata; geo-conditioned behavior is outside the fixture scope
- Ordinary process/socket sandboxing remained enabled. No `--no-sandbox`, security-warning bypass, remote dev mode, or credential provisioning was used
- A complete 404.html fixture is intentional: without it Pages' implicit SPA behavior would mask some missing-rule outcomes

## Published semantics and primary sources

### Netlify

The documented engine uses the first matching rule in file order. `_redirects` runs before netlify.toml rules. Existing static paths generally shadow unforced rules; an exclamation suffix or TOML force enables interception. Omitted status is 301. 200 rewrites content internally. The status documentation says 307 is unsupported, while not exhaustively listing every other numeric code. The conservative product profile therefore need not model 303/308 merely because the local CLI accepts them.

- [Redirect processing order](https://docs.netlify.com/manage/routing/redirects/overview/#rule-processing-order)
- [Status codes and forcing](https://docs.netlify.com/manage/routing/redirects/redirect-options/)
- [Shadowing and rewrites](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)
- [Request-chain behavior and HTML aliases](https://docs.netlify.com/resources/troubleshooting/request-chain/)
- [Official dev CLI options](https://cli.netlify.com/commands/dev/)

The official CLI's selected-rule/static-file branch returns the static file immediately when unforced, rather than resuming at a later forced rule. The paired fixture confirms that behavior for the tested duplicate source. [Official Netlify CLI proxy source](https://github.com/netlify/cli/blob/main/src/utils/proxy.ts) was read as implementation evidence; no source code was copied into the product.

### Cloudflare Pages

Published defaults are 302, with explicit 301/302/303/307/308 support and same-site relative 200 proxying. Asset existence does not suppress a matching rule. Functions-served requests bypass `_redirects`. Rewrites do not recursively apply another rewrite. Published file limits are 2,000 static plus 100 dynamic rules and 1,000 characters per declaration. Rule order matters and the documentation advises placing static rules first.

- [Redirects, limits, and supported features](https://developers.cloudflare.com/pages/configuration/redirects/)
- [HTML canonicalization, 404 selection, and implicit SPA behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Official local Pages development](https://developers.cloudflare.com/pages/functions/local-development/)

Do not interpret “static first” as automatic exact-rule priority independent of file order. The inspected official parser counts everything after the first dynamic source against the dynamic budget; metadata construction likewise keeps later exact rules in ordered dynamic rules. The paired fixture observed an earlier splat beating a later exact rule.

The inspected pinned parser also rejects relative targets matching `/index(.html)?$` when the source ends in `/*`, and when the source ends in `/` with default HTML handling. It does so without a 200-status exception. The model can conservatively classify these patterns UNKNOWN instead of assuming the rejected line was safely ignored. The regex's dot is unescaped in upstream code; this is implementation detail, not a new portable grammar promise.

- [Official parser](https://github.com/cloudflare/workers-sdk/blob/main/packages/workers-shared/utils/configuration/parseRedirects.ts)
- [Official metadata construction](https://github.com/cloudflare/workers-sdk/blob/main/packages/workers-shared/utils/configuration/constructConfiguration.ts)

The source URLs track main and may change. The installed package versions and lockfile are the reproducibility anchors for the actual observations.

## Suggested bounded model policy

Keep UNKNOWN for functions, advanced conditions, unsupported syntax, incomplete inventory, unverified encoding, HTML aliases/canonicalization, and conflicting status semantics. An unsupported earlier rule must taint potentially affected requests instead of disappearing. Do not classify a dynamic-before-exact Pages request as an exact match based solely on the word “static.” This release may remain more conservative than a local observed fixture.
