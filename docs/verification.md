# Verification status

Date:2026-10-03. Exact release commit and remote CI status must be verified by the publisher; this file does not pre-claim CI success.

## Executed in the build workspace

- Strict TypeScript checking and bundled core build
- Node unit, adversarial, CLI, digest and raw official-local golden-evidence comparisons
- Official local Netlify CLI27.10.2 and Wrangler4.147.0:46 HTTP observations across12 provider/scenario runs, zero assertion mismatches, no blocked final runs
- Of those46 measurements,34 supported model initial outcomes match raw status/location/body fingerprints and12 remain UNKNOWN
- Fixture and isolated lockfile SHA-256 consistency is asserted by `tests/oracle.test.js`

[Full official-local method, pinning and discrepancies](emulator-evidence.md). Local observations are not production conformance. Early failed hypotheses are retained, rather than relabeled as passes.

## Browser and CI

Sandbox-enabled Chromium tests are prepared in `tests/browser/browser-test.mjs`. They exercise desktop/mobile layout, keyboard, input import, errors, repeated comparisons, swapping, cancellation, stale results, downloads and no runtime external request. The local attempt on 2026-10-03 was blocked before any scenario: the installed Chromium failed creating its process-singleton socket (Operation not permitted), with read-only crash settings also reported. Zero browser scenarios ran locally. The sandbox remained enabled. Exact remote browser/CI results belong in release evidence after they run.

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
