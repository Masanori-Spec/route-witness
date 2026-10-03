# Verification status

Date:2026-10-03. The executed evidence below identifies its exact source revision. Later changes require their own exact-commit CI result; recorded earlier evidence is not silently treated as a pass for new code.

## Executed in the build workspace

- Strict TypeScript checking and bundled core build
- Node unit, adversarial, CLI, digest and raw official-local golden-evidence comparisons
- Official local Netlify CLI27.10.2 and Wrangler4.147.0:46 HTTP observations across12 provider/scenario runs, zero assertion mismatches, no blocked final runs
- Of those46 measurements,34 supported model initial outcomes match raw status/location/body fingerprints and12 remain UNKNOWN
- Fixture and isolated lockfile SHA-256 consistency is asserted by `tests/oracle.test.js`

[Full official-local method, pinning and discrepancies](emulator-evidence.md). Local observations are not production conformance. Early failed hypotheses are retained, rather than relabeled as passes.

## Executed remote CI

[Run 37120511889](https://github.com/Masanori-Spec/route-witness/actions/runs/37120511889) passed all six jobs for code commit `ffd3f0847f19ca0463738d45a4573774196e9037`:

- Four unit/build jobs: Node 22/24 × UTC/Asia-Tokyo, each passing the 151 tests, formatting, strict type checking and build
- Sandboxed Chromium: **34 scenarios passed**, zero failed, no uncaught page errors. This includes scrolled unfocused clipping, focused bounds and keyboard activation of the skip link on desktop and mobile
- Fresh official-local fixtures: 46 measured HTTP responses, zero blocked runs, zero hypothesis mismatches; 34 supported model outcomes matched and 12 remained explicitly UNKNOWN. The tools remained pinned to Netlify27.10.2/Wrangler4.147.0
- Corrected desktop/mobile input, report and evidence screenshots were inspected. Layouts were readable without horizontal overflow, and the nonfocused skip-link capture artifact was removed while preserving keyboard focusability

### Earlier verification and correction

[Run 37119882514](https://github.com/Masanori-Spec/route-witness/actions/runs/37119882514) had already passed six jobs and 33 browser scenarios at `ca473bdf34b2025a6974e6448bd3cf9f3eafba9c`. Its screenshot review revealed the skip-link artifact; the code revision above fixed it and added the passing 34th scenario. Fresh runtime evidence in both runs agreed on 46 observations with no blocked runs or assertion mismatches. Documentation-only updates record this verified code revision; the publisher independently checks the final documentation commit's CI too.

## Browser execution environment

Sandbox-enabled Chromium tests are in `tests/browser/browser-test.mjs`. They exercise desktop/mobile layout, keyboard, input import, errors, repeated comparisons, swapping, cancellation, stale results, downloads and no runtime external request. The local attempt on 2026-10-03 was blocked before any scenario: the installed Chromium failed creating its process-singleton socket (Operation not permitted), with read-only crash settings also reported. Zero browser scenarios ran locally. The sandbox remained enabled. The executed remote browser/CI evidence above supplies the browser verification that this local workspace could not perform.

CI runs unit/build checks on Node22/24 and UTC/Asia-Tokyo; a standard Ubuntu22.04 browser job uses `chromiumSandbox: true`. A separate official-local fixture job installs pinned tools, compares supported model outcomes against newly measured JSON and uploads that evidence; it never deploys or logs in. The Ubuntu22.04 hosted runner is scheduled to retire April17,2027, so a future runner migration needs sandbox verification rather than adding `--no-sandbox`.

## Reproducible commands

```sh
npm ci --ignore-scripts
npm run check
node scripts/emulator-check.mjs --check-fixtures
npm ci --ignore-scripts --prefix fixtures/emulator/oracle
node scripts/emulator-check.mjs --run
npm run serve
npm run test:browser
```

The archive/source manifest excludes every `node_modules`, generated app build, temporary runtime home and private local path. Only authored source and deliberate fixture evidence should be published. Source is unlicensed unless the owner later chooses one.
