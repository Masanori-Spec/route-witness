# Independent safety review

Reviewed 2026-10-03: `src/engine.ts`, `src/cli.js`, the API contract,
unit tests, and the pinned local-emulator implementation. This is a bounded
code/model review, not a security certification or a production-conformance claim.

## Additional measured local observations

The following probes ran against the already pinned `netlify-cli 27.10.2` and
`wrangler 4.147.0` using Node 24.19.0. Each used an isolated temporary static build,
`target.txt` containing `TARGET`, and `404.html` containing `404MARK`. Requests
used loopback HTTP with `redirect: 'manual'`; external redirect targets were never
fetched. Netlify ran offline with Edge Functions disabled; Wrangler ran Pages dev.
The raw status/Location pairs below were captured from those local HTTP responses.

| Rules / request | Netlify observed | Pages observed |
| --- | --- | --- |
| One `/unused/* /target.txt 302`, then 100 exact `/rN /target.txt 302` lines; request `/r99` | 302, `/target.txt` | 404, no Location |
| `/control /_redirects 200`; request `/control` | 200, no Location | 502, no Location |
| `/header /_headers 200`; request `/header` | 200, no Location | 502, no Location |
| `/.netlify /target.txt 302`; request `/.netlify` | 404, no Location | 302, `/target.txt` |
| `/.netlifyx /target.txt 302`; request `/.netlifyx` | 404, no Location | 302, `/target.txt` |
| `/extempty https://example.invalid 302`; request `/extempty` | 302, `https://example.invalid/` | 302, `https://example.invalid/` |
| `/extcaps https://EXAMPLE.invalid:443/a 302`; request `/extcaps` | 302, `https://example.invalid/a` | 302, `https://example.invalid/a` |
| `/exthttp http://example.invalid/a 302`; request `/exthttp` | 302, `http://example.invalid/a` | 404, no Location |
| `/edge/* /target.txt 302` followed by `/edge /other.txt 302`; request `/edge` | 302, `/target.txt` | 302, `/other.txt` |

These observations exposed cases where the earlier model could confidently
compare a rule that an emulator skipped or normalized differently. The model now
rejects the dynamic-tail overflow and returns UNKNOWN for the relevant control,
reserved-prefix, noncanonical/external-protocol, and slashless-wildcard boundaries.
The exact hosted behavior remains unverified; the local status values above are
not generalized into promises about either production service.

Pinned source inspection corroborated the Pages dynamic-tail counter, HTTPS-only
destination parser, and Netlify's full `/.netlify` source-prefix rejection.
Regular regression coverage is in `tests/review.test.js` and
`tests/engine.test.js`. The independently stored broader emulator corpus and
HTTP artifacts are in `fixtures/emulator/`; the extra probe table above is
separate from that corpus and its recorded observation counts.

## CLI and report checks

- A FIFO previously blocked at `open()` before file-type validation. A bounded
  subprocess reproduced that hang. `O_NONBLOCK` plus `fstat()` now rejects it;
  the subprocess regression has a timeout to keep future failures bounded.
- Final-component symlinks are rejected by `O_NOFOLLOW`; build scans reject
  encountered symlinks and special files. The scan is not a transactionally atomic
  snapshot of a concurrently modified tree. Use a stable build directory.
- Build-directory enumeration now streams through `opendir()` and enforces its
  entry budget before retaining an unbounded directory listing; final paths are
  still sorted deterministically.
- All dynamic sections of the HTML report remained escaped under script/image
  injection payloads. The report contains a restrictive CSP and no script.
- Initial outcomes alone determine SAME/CHANGED/UNKNOWN. Later redirect-chain
  uncertainty does not silently change the initial verdict; the trace is bounded.
- Configuration, corpus, path, inventory, rule-work, and redirect-hop limits were
  inspected. The model does not perform network or filesystem I/O.

Passing regression tests establish these bounded checks, not universal routing
equivalence, response-byte equivalence, or freedom from all security defects.
