# Supported model and primary sources

Profile `static-path-v1`, reviewed 2026-10-03. Live documentation can change. This is a documentation-derived model constrained by specific official-local observations; it is not a replica of either CDN.

## Evaluation order

1. Validate structural input and limits. Require a complete inventory and static-only attestation for any confident result. Detected runtime markers override the attestation.
2. Reject unsupported request syntax as UNKNOWN. Root, HTML and trailing-slash paths are deliberately excluded; a known `.html`/`index.html` alias also makes that request UNKNOWN.
3. Examine rule source lines in order. An unsupported possibly matching earlier rule blocks resolution; a known nonmatching exact/prefix rule can be skipped. Unknown source syntax taints conservatively across all requests.
4. Netlify's selected unforced rule is shadowed by an exact existing non-HTML file. It does not continue to a later forced duplicate. Pages applies its matching rule despite a same-path asset. A forced Netlify rule and a separately supplied Pages rule can agree.
5. A supported redirect has a literal status/target. External targets must be canonical HTTPS URLs with ASCII fully-qualified hostnames; HTTP, numeric hosts and URLs changed by standard serialization are UNKNOWN. Control/runtime destinations and reserved Netlify prefixes are UNKNOWN. Internal 200 rewrites resolve only one exact inventory target, never re-run the target through the rule list. Missing targets are UNKNOWN. Pages HTML target canonicalization is UNKNOWN.
6. Compare the initial action/status/target. Independently trace up to eight client-redirect hops to show local chains, loops and uncertainty. Never fetch external targets; external chains stop immediately.

The equality relation includes the action (`asset`, `rewrite`, `redirect`). Two different routes reaching the same named file are still CHANGED. A SAME verdict does not validate later chain hops or file bytes. Evidence lines describe selected rules and later possibly matching rules; “later” is not a universal proof of unreachable configuration.

## Limits

- 100,000 characters/config, 500 physical lines/config, 1,000 characters/rule
- Pages: at most 100 dynamic-tail rules, including exact entries following the first dynamic source (a pinned-parser nuance); 500 total line cap keeps static rules below the provider's 2,000 limit
- 10,000 inventory files; 2,000 requests after deduplication and auto asset inclusion; 2,048 characters/path
- 3,000,000 rule/request evaluation work units; eight client redirect hops; short bounded evidence per outcome
- 1,000,000 characters for inventory/request text imports; scan depth32, at most20,000 filesystem entries

The UI and CLI fail with errors on exceeded structural limits, rather than silently truncating coverage. Some uncertain grammar is per-request UNKNOWN. Duplicate inventory paths are errors; duplicate requests are deduplicated while preserving first-seen order. Auto-added asset names are sorted. Input digests cover raw configs, normalized inventory, and original request corpus plus auto-asset setting.

## Source register

- [Netlify redirect options](https://docs.netlify.com/manage/routing/redirects/redirect-options/): status default301, force flag, terminal splats, ordering and normalization. Current docs expressly describe307 as unsupported. The model excludes Netlify303/308 because documentation support is insufficient for this profile
- [Netlify rewrites/proxies](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/): static-file shadowing and forcing
- [Netlify request chain](https://docs.netlify.com/resources/troubleshooting/request-chain/): broader routing influences omitted here
- [Cloudflare Pages redirects](https://developers.cloudflare.com/pages/configuration/redirects/): default302, unconditional asset interception, limited syntax, Functions bypass, redirect limits and first internal rewrite
- [Cloudflare serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/): HTML canonicalization and 404/SPA behavior are reasons to preserve UNKNOWN
- [Netlify migration guide](https://developers.cloudflare.com/pages/migrations/migrating-from-netlify/): migration context; reusing syntax is not a behavioral-equivalence guarantee
- [Netlify local CLI](https://cli.netlify.com/commands/dev/) and [Wrangler Pages development](https://developers.cloudflare.com/pages/functions/local-development/): official local fixture tools

## Observed divergences that changed the product

Pinned Netlify27.10.2 / Wrangler4.147.0 fixtures are documented in [emulator evidence](emulator-evidence.md). Two initially plausible claims failed actual observation: Pages wildcard-to-index was rejected, and `.html` rewrite targets produced a308 canonicalization redirect. These cases now return UNKNOWN. Netlify's local307 response conflicts with its docs, and remains UNKNOWN. The safe asset-interception example therefore targets a literal `.txt` file rather than pretending all SPA rewrites are equivalent.

A deployed CDN can differ from local tools due to versions, routing configuration, HTML handling, caching, functions, custom domains and feature flags. Only the supplied corpus and supported profile are compared.
