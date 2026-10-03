# Positioning and existing work

Checked2026-10-03. This project is not claimed to be first, unique or patentable. These are separate products and their capabilities may evolve.

- [Solva12 Redirect Semantics Preflight](https://solva12.itch.io/redirect-semantics-preflight) describes a bounded offline Vercel↔Netlify converter with rule-level explanations and lossy/unsupported classifications. Its described scope excludes Cloudflare and a GUI. It is an independent competitor, unrelated to this project's author
- [Netlify Redirects Playground](https://redirects-playground.netlify.app/) and its [source](https://github.com/netlify/netlify-playground) already test Netlify redirects and conflicts
- [Nobuf Redirect URL Checker](https://www.nobuf.com/tools/redirect-url-checker) already offers browser-local Cloudflare-style simulation, chains, audits and export

A generic rules linter or converter would duplicate existing tools. Route Witness's bounded contribution is a review workflow: two platform configurations, a concrete complete build-file inventory and request corpus, paired initial outcomes, source/asset evidence and UNKNOWN when the model cannot establish the outcome. Exact asset paths can be automatically added to catch rule interception that a handpicked page-only corpus misses.

Practical uses: review a static migration's asset paths, inspect status-default differences, capture a reproducible JSON/HTML witness for a code review, and identify requests requiring deployment-specific manual validation. It does not write a target configuration or probe a production site. HTML canonicalization makes many SPA patterns UNKNOWN in this release; that boundary is central, not hidden.
