# Security and privacy

- App/CLI processing is local. The UI has no analytics, runtime fetch, accounts, external fonts or outbound destination requests. Static hosting still receives the normal app-page/assets request
- A Worker does computation. Editing, canceling or resetting terminates it and invalidates prior results; generation IDs reject stale messages/imports
- Untrusted paths, rule lines and evidence use text nodes in UI. Exported HTML escapes content and forbids scripts/network through CSP. Downloaded JSON can contain the input paths/rules: review it before sharing
- Do not paste credentials or private URLs. URLs with queries, credentials, fragments or encoded characters are outside scope; values may still appear as escaped evidence in your locally generated report
- CLI inputs use bounded regular-file reads, strict UTF-8, O_NOFOLLOW and O_NONBLOCK. Build scans reject symlinks/special files and enforce size/count/depth budgets. Scanner inventory is not an atomic snapshot; use immutable build output
- The CLI writes results to stdout; it does not deploy, alter input configs, crawl destinations, change settings or send messages
- Source contains independent official-local emulator fixtures. Their isolated tools may make development metadata/runtime installation requests when explicitly run; they do not belong to the application runtime. Fixture runs use a temporary home, no account credentials, no bindings and telemetry opt-outs
- UNKNOWN is not safety. SAME covers only initial routing action/status/target in a bounded model, not headers, cache, MIME, access control or deployed security

Report bugs with a minimal synthetic fixture. Do not submit secrets or real customer data. No third-party disclosure workflow or security contact is configured by this project.
