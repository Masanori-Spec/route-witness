import { reportHtml, LIMITS } from "../src/engine.ts";

const $ = (id) => document.getElementById(id);
const UI_TEXT_LIMIT = 4 * 1024 * 1024;
const FILE_BYTE_LIMIT = 4 * 1024 * 1024;
const PAGE_SIZE = 100;
const examples = {
  spa: {
    netlify:
      "# Static files may shadow an unforced rule.\n/old /new 301\n/* /fallback.txt 200",
    pages:
      "# Static files may shadow an unforced rule.\n/old /new 301\n/* /fallback.txt 200",
    inventory:
      "/fallback.txt\n/assets/app.js\n/assets/site.css\n/images/logo.svg",
    requests: "/old\n/docs/start\n/missing\n/",
  },
  defaults: {
    netlify: "/old /new",
    pages: "/old /new",
    inventory: "/assets/app.js\n/new.txt",
    requests: "/old\n/assets/app.js\n/unlisted",
  },
  forced: {
    netlify: "/assets/* /fallback.txt 200!",
    pages: "/assets/* /fallback.txt 200!",
    inventory: "/fallback.txt\n/assets/app.js\n/images/logo.svg",
    requests: "/assets/app.js\n/images/logo.svg",
  },
  unknown: {
    netlify: "/private/* /login 302 Role=member\n/* /fallback.txt 200",
    pages: "/private/* /login 302 Role=member\n/* /fallback.txt 200",
    inventory: "/fallback.txt\n/assets/app.js",
    requests: "/private/document\n/public\n/path?query=1",
  },
};
const en = {
  skip: "Skip to comparison",
  local: "LOCAL IN YOUR BROWSER",
  language: "Language",
  hero1: "Same rules.",
  hero2: "Different arrivals.",
  heroDescription:
    "Before you move, compare where your URLs and static files actually route. Find the quiet differences with rule lines and file evidence you can inspect.",
  noUpload: "NO UPLOADS",
  noAccount: "NO ACCOUNT",
  bounded: "BOUNDED MODEL",
  figureLabel:
    "The sample asset request reaches its file on Netlify and a rewrite to fallback.txt on Cloudflare Pages",
  fileWins: "Static file",
  ruleWins: "Rewrite rule",
  assetFirst: "Existing file wins",
  intercepted: "Asset request intercepted",
  figureCaption: "Static sample with /* /fallback.txt 200",
  scopeLabel: "Scope",
  boundary:
    "This is a model, not a deployment test. It compares a bounded subset of _redirects against your static build inventory. Functions, Workers, conditional rules, and unverified behavior remain UNKNOWN.",
  seeLimits: "Model boundaries ↓",
  workspaceEyebrow: "01 / INPUTS",
  workspaceTitle: "Trace your next move",
  exampleLabel: "Choose an example",
  exampleSpa: "Static asset interception",
  exampleDefaults: "Omitted status codes",
  exampleForced: "Forced-rule syntax",
  exampleUnknown: "Unsupported conditions",
  loadExample: "Load example",
  reset: "Clear all",
  sampleNote:
    "Sample inputs. The checked attestations apply only to this static example.",
  configHint: "Separate _redirects files for the two destinations",
  swap: "⇄ Swap configs",
  chooseFile: "Choose file",
  configLimit:
    "Per config: 100,000 characters / 500 lines / 1,000 characters per line. Editing a config clears the static-only attestation.",
  inventoryLabel: "Build file inventory",
  inventoryHelp:
    'One URL-root path per line, or JSON shaped like {"paths":["/index.html"]}.',
  complete: "This inventory includes every file deployed to both services",
  requestsLabel: "Request paths to compare",
  requestsHelp:
    "One path per line, such as /old or /docs/start. Only root-relative request paths are modeled.",
  autoAssets:
    "Include script, image, font, and similar static assets automatically",
  staticOnly:
    "Both deployments are static-only, with no Functions, Workers, or other runtime routing",
  attestationHelp:
    "You can compare without these attestations, but outcomes will be UNKNOWN. Editing or loading an inventory clears completeness. These controls override confirmation values inside JSON.",
  compare: "Compare outcomes",
  cancel: "Cancel",
  emptyTitle: "A place for the differences.",
  emptyDescription:
    "Run the example, or bring your own configs, file inventory, and request paths.",
  resultsEyebrow: "02 / OUTCOMES & EVIDENCE",
  resultsTitle: "Follow the differences",
  total: "REQUESTS COMPARED",
  changed: "Changed",
  unknown: "Unknown",
  same: "Same",
  interceptionHelp:
    "Requests for static assets are intercepted by a routing rule. They could receive different content instead of JavaScript or CSS. MIME types and actual response bodies are not verified.",
  inspect: "Inspect evidence ↗",
  machineNote:
    "Interface labels are bilingual. Engine reasons, evidence, error messages, and exported HTML remain in English.",
  filterLabel: "Filter verdicts",
  all: "All",
  interceptionFilter: "Asset interception",
  search: "Filter by path",
  showMore: "Show 100 more",
  provenanceTitle: "Comparison identity & reproducibility",
  limitsEyebrow: "KNOW THE MODEL",
  limitsTitle: "A clear answer.\nA clear boundary.",
  limitsIntro:
    "SAME means the initial action agrees for this path, these inputs, and this model. It does not guarantee equivalent sites or a successful migration.",
  limit1:
    "Static delivery and supported _redirects only. Incomplete inventory or an unattested runtime produces UNKNOWN.",
  limit2:
    "No claims for Functions, Workers, conditions, URL normalization, HTML canonicalization, or other out-of-scope behavior.",
  limit3:
    "External destinations are never fetched. Redirect traces of up to 8 steps are informational; verdicts compare only the initial action.",
  limit4:
    "Up to 10,000 inventory paths and 2,000 requests including auto-added assets. Each path is capped at 2,048 characters; work is capped at 3,000,000 units.",
  limit5:
    "UI files are capped at 4 MiB each and text at 4,194,304 characters. The engine further caps inventory text and request text at 1,000,000 characters each. Data is processed only in this tab and is not persisted.",
  limitFootnote:
    "Always confirm important routes in a real staging deployment.",
  footer: "Catch the quiet differences. Before the move.",
  notices: "Notices",
  evidenceEyebrow: "ROUTING EVIDENCE",
  closeEvidence: "Close evidence",
  evidenceFootnote:
    "Line numbers are physical lines in each config. Evidence and traces retain the engine’s English wording. No destinations are fetched.",
  ready: "The sample is ready. Compare to inspect its evidence.",
  changedInputs: "Inputs changed. Compare again for current results.",
  cleared: "Inputs cleared. Add your own files and paths.",
  running: "Comparing in a local worker…",
  cancelled: "Comparison cancelled. No result retained.",
  completeStatus: "Comparison complete. Inspect the evidence below.",
  failure: "Comparison could not finish. Check the message below.",
  loading: "Reading a file locally…",
  loaded: "File loaded. Review inputs and confirm the relevant attestations.",
  swapped:
    "Configs swapped. Confirm the static-only attestation, then compare again.",
  fileTooLarge: "File exceeds the UI limit of 4 MiB.",
  textTooLarge: "Text exceeds the UI limit of 4,194,304 characters.",
  workerFailed: "The local comparison worker failed. Try again or use the CLI.",
  workerBadData:
    "The comparison worker returned an invalid response. No report was retained.",
  workerTimeout:
    "Comparison exceeded the 25-second browser time limit. Reduce the input and try again.",
  fileError: "Could not read this file. Choose it again or paste its text.",
  lines: "lines",
  chars: "characters",
  interceptedCount: (n) =>
    `${n} static asset request${n === 1 ? "" : "s"} intercepted`,
  coverage: (c) =>
    `${c.supplied} supplied · ${c.autoAdded} auto-added assets · ${c.total} unique requests. These inputs only; not whole-site coverage.`,
  shown: (a, b) => `Showing ${a} of ${b} matching requests`,
  diagnosticCount: (n) => `${n} configuration diagnostic${n === 1 ? "" : "s"}`,
  noMatches: "No requests match this filter.",
  assetOrigin: "AUTO ASSET",
  suppliedOrigin: "SUPPLIED",
  evidence: "View evidence ↗",
  interception: "ASSET INTERCEPTION",
  kindAsset: "asset",
  kindRewrite: "rewrite",
  kindRedirect: "redirect",
  kindUnknown: "unknown",
  evidenceLabel: "Rule and inventory evidence",
  traceLabel: "Informational redirect trace",
  chainEnd: "Chain end",
  line: "line",
  noEvidence: "No additional evidence.",
  profile: "Profile",
  unknownCheck:
    "UNKNOWN · confirm inventory completeness and static runtime to narrow uncertainty.",
};
const ja = {
  ready: "サンプルの準備ができました。比較して証拠を確認できます。",
  changedInputs: "入力が変わりました。もう一度比較してください。",
  cleared: "入力をクリアしました。設定とパスを入力してください。",
  running: "ブラウザ内で比較しています…",
  cancelled: "比較を中止しました。結果は保持していません。",
  completeStatus: "比較が完了しました。下の証拠を確認できます。",
  failure: "比較を完了できませんでした。下のメッセージを確認してください。",
  loading: "ファイルをこのブラウザで読み込んでいます…",
  loaded: "ファイルを読み込みました。入力と必要な確認事項を確認してください。",
  swapped:
    "設定を入れ替えました。静的サイトの確認後に、もう一度比較してください。",
  fileTooLarge: "UI の読込上限（4 MiB）を超えています。",
  textTooLarge: "UI の文字数上限（4,194,304 文字）を超えています。",
  workerFailed:
    "比較処理が失敗しました。もう一度試すか、CLI を利用してください。",
  workerBadData:
    "比較処理から無効な応答が返されました。結果は保持していません。",
  workerTimeout:
    "ブラウザでの比較が 25 秒を超えました。入力を減らして再試行してください。",
  fileError:
    "ファイルを読み込めませんでした。もう一度選択するか、テキストを貼り付けてください。",
  lines: "行",
  chars: "文字",
  interceptedCount: (n) => `${n} 件の静的アセットへのリクエストを捕捉`,
  coverage: (c) =>
    `入力 ${c.supplied} 件 · 自動追加 ${c.autoAdded} 件 · 重複を除いた ${c.total} 件の比較。サイト全体の網羅性を示すものではありません。`,
  shown: (a, b) => `一致する ${b} 件のうち ${a} 件を表示`,
  diagnosticCount: (n) => `設定に関する ${n} 件の診断`,
  noMatches: "条件に一致するリクエストがありません。",
  assetOrigin: "自動追加",
  suppliedOrigin: "入力済み",
  evidence: "証拠を見る ↗",
  interception: "ファイル捕捉",
  kindAsset: "静的ファイル",
  kindRewrite: "リライト",
  kindRedirect: "リダイレクト",
  kindUnknown: "未確定",
  evidenceLabel: "ルールとファイル一覧の証拠",
  traceLabel: "参考: リダイレクトの追跡",
  chainEnd: "追跡の終端",
  line: "行",
  noEvidence: "追加の証拠はありません。",
  profile: "モデル",
  unknownCheck:
    "UNKNOWN · 一覧の完全性と静的実行環境を確認すると、不確定な範囲を絞れます。",
};
for (const element of document.querySelectorAll("[data-i18n]"))
  ja[element.dataset.i18n] = element.textContent;
for (const element of document.querySelectorAll("[data-i18n-aria]"))
  ja[element.dataset.i18nAria] = element.getAttribute("aria-label");
for (const element of document.querySelectorAll("[data-i18n-placeholder]"))
  ja[element.dataset.i18nPlaceholder] = element.getAttribute("placeholder");
ja.limitsTitle = "確かめられること。\nまだ確かめられないこと。";
ja.figureLabel =
  "サンプルのアセット要求は、Netlify では静的ファイルに、Cloudflare Pages では fallback.txt へのリライトに到達します";
let language = "ja",
  statusKey = "ready",
  report = null,
  active = null,
  requestId = 0,
  timer = null;
let fileRevision = 0,
  fileReading = false,
  filter = "all",
  shownLimit = PAGE_SIZE,
  selectedEvidence = null;
const fileNames = new Map();
function t(key, ...args) {
  const value = (language === "ja" ? ja : en)[key] ?? en[key] ?? key;
  return typeof value === "function" ? value(...args) : value;
}
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = String(text);
  if (className) el.className = className;
  return el;
}
function setStatus(key) {
  statusKey = key;
  $("status").textContent = t(key);
}
function stopWorker() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (active) {
    active.onmessage = null;
    active.onerror = null;
    active.onmessageerror = null;
    active.terminate();
    active = null;
  }
  $("compare").setAttribute("aria-busy", "false");
  $("cancel").disabled = true;
}
function closeEvidence() {
  if ($("evidence-dialog").open) $("evidence-dialog").close();
  selectedEvidence = null;
}
function clearReport() {
  report = null;
  closeEvidence();
  $("results").hidden = true;
  $("empty").hidden = false;
  $("result-cards").replaceChildren();
  $("download-json").disabled = true;
  $("download-html").disabled = true;
}
function invalidate(key = "changedInputs", abortFiles = true) {
  requestId++;
  stopWorker();
  clearReport();
  $("error").hidden = true;
  $("error").textContent = "";
  if (abortFiles) {
    fileRevision++;
    fileReading = false;
    $("compare").disabled = false;
  }
  setStatus(key);
}
function fail(message) {
  invalidate("failure");
  $("error").textContent = String(message);
  $("error").hidden = false;
}
function updateMeta() {
  for (const id of ["netlify", "pages"]) {
    const value = $(id).value;
    $(id + "-meta").textContent =
      `${value ? value.split(/\r?\n/).length : 0} ${t("lines")} · ${value.length.toLocaleString(language)} ${t("chars")}${fileNames.has(id) ? ` · ${fileNames.get(id)}` : ""}`;
  }
}
function changed(id) {
  invalidate();
  $("sample-note").hidden = true;
  fileNames.delete(id);
  if (id === "inventory") $("complete").checked = false;
  if (id === "netlify" || id === "pages") $("static-only").checked = false;
  updateMeta();
}
function applyExample() {
  invalidate("ready");
  fileNames.clear();
  for (const id of ["netlify", "pages", "inventory", "requests"])
    $(id).value = examples[$("example").value][id];
  for (const id of ["complete", "static-only", "auto-assets"])
    $(id).checked = true;
  for (const input of document.querySelectorAll('input[type="file"]'))
    input.value = "";
  $("sample-note").hidden = false;
  $("search").value = "";
  filter = "all";
  shownLimit = PAGE_SIZE;
  updateMeta();
}
function validOutcome(o) {
  return (
    o &&
    ["asset", "redirect", "rewrite", "unknown"].includes(o.kind) &&
    (o.status === null || Number.isSafeInteger(o.status)) &&
    (o.target === null || typeof o.target === "string") &&
    typeof o.reason === "string" &&
    ["terminal", "external", "unknown", "loop", "hop-limit"].includes(
      o.chainEnd,
    ) &&
    Array.isArray(o.evidence) &&
    o.evidence.length <= 6 &&
    o.evidence.every(
      (e) =>
        e &&
        ["rule", "asset", "scope", "ordering"].includes(e.type) &&
        typeof e.detail === "string" &&
        (e.line === undefined || Number.isSafeInteger(e.line)),
    ) &&
    Array.isArray(o.trace) &&
    o.trace.length <= 8 &&
    o.trace.every(
      (s) =>
        s &&
        typeof s.path === "string" &&
        typeof s.kind === "string" &&
        (s.status === null || Number.isSafeInteger(s.status)) &&
        (s.target === null || typeof s.target === "string") &&
        (s.line === null || Number.isSafeInteger(s.line)),
    )
  );
}
function validReport(r) {
  if (
    !r ||
    r.schemaVersion !== 1 ||
    !r.profile ||
    !["id", "date", "evidence", "scope"].every(
      (k) => typeof r.profile[k] === "string",
    ) ||
    !r.inputs ||
    !r.inputs.digests ||
    !["netlify", "pages", "inventory", "requests"].every(
      (k) => typeof r.inputs.digests[k] === "string",
    ) ||
    typeof r.inputs.inventoryComplete !== "boolean" ||
    !["static", "unknown"].includes(r.inputs.runtime) ||
    !r.coverage ||
    !Array.isArray(r.results) ||
    r.results.length > LIMITS.requests ||
    !Array.isArray(r.diagnostics)
  )
    return false;
  if (
    ![
      "supplied",
      "autoAdded",
      "total",
      "same",
      "changed",
      "unknown",
      "intercepted",
    ].every((k) => Number.isSafeInteger(r.coverage[k]) && r.coverage[k] >= 0) ||
    r.coverage.total !== r.results.length ||
    r.coverage.same + r.coverage.changed + r.coverage.unknown !==
      r.coverage.total ||
    r.coverage.supplied + r.coverage.autoAdded !== r.coverage.total
  )
    return false;
  return (
    r.diagnostics.every(
      (d) =>
        d &&
        ["netlify", "pages"].includes(d.platform) &&
        Number.isSafeInteger(d.line) &&
        typeof d.code === "string" &&
        typeof d.message === "string",
    ) &&
    r.results.every(
      (x) =>
        x &&
        typeof x.path === "string" &&
        ["supplied", "asset"].includes(x.origin) &&
        ["SAME", "CHANGED", "UNKNOWN"].includes(x.verdict) &&
        typeof x.reason === "string" &&
        typeof x.interception === "boolean" &&
        validOutcome(x.netlify) &&
        validOutcome(x.pages),
    )
  );
}
function compareNow() {
  if (fileReading) return;
  invalidate("running");
  const input = Object.fromEntries(
    ["netlify", "pages", "inventory", "requests"].map((id) => [
      id,
      $(id).value,
    ]),
  );
  for (const [key, value] of Object.entries(input)) {
    if (value.length > UI_TEXT_LIMIT)
      return fail(`${key}: ${t("textTooLarge")}`);
    if (
      (key === "netlify" || key === "pages") &&
      value.length > LIMITS.configChars
    )
      return fail(
        `${key}: configuration exceeds ${LIMITS.configChars} characters.`,
      );
  }
  Object.assign(input, {
    complete: $("complete").checked,
    staticOnly: $("static-only").checked,
    autoAssets: $("auto-assets").checked,
  });
  const ticket = requestId;
  try {
    const worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    active = worker;
    $("compare").setAttribute("aria-busy", "true");
    $("cancel").disabled = false;
    const isCurrent = () => requestId === ticket && active === worker;
    worker.onmessage = ({ data }) => {
      if (!isCurrent()) return;
      if (!data || !Number.isSafeInteger(data.requestId))
        return fail(t("workerBadData"));
      if (data.requestId !== ticket) return;
      if (data.error)
        return fail(
          typeof data.error.message === "string"
            ? data.error.message
            : t("workerFailed"),
        );
      if (!validReport(data.report)) return fail(t("workerBadData"));
      try {
        report = data.report;
        stopWorker();
        filter = "all";
        shownLimit = PAGE_SIZE;
        $("search").value = "";
        renderReport();
        setStatus("completeStatus");
      } catch {
        fail(t("workerBadData"));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (isCurrent()) fail(t("workerFailed"));
    };
    worker.onmessageerror = () => {
      if (isCurrent()) fail(t("workerBadData"));
    };
    timer = setTimeout(() => {
      if (isCurrent()) fail(t("workerTimeout"));
    }, 25000);
    worker.postMessage({ requestId: ticket, input });
  } catch (error) {
    fail(`${t("workerFailed")} ${error instanceof Error ? error.message : ""}`);
  }
}
function outcomeText(o) {
  return `${t("kind" + o.kind[0].toUpperCase() + o.kind.slice(1))}${o.status !== null ? ` · ${o.status}` : ""}${o.target !== null ? ` → ${o.target}` : ""}`;
}
function renderReport() {
  if (!report) return;
  $("results").hidden = false;
  $("empty").hidden = true;
  $("download-json").disabled = false;
  $("download-html").disabled = false;
  for (const key of ["total", "same", "changed", "unknown"])
    document.querySelector(`[data-metric="${key}"] strong`).textContent =
      String(report.coverage[key]);
  $("interception-banner").hidden = report.coverage.intercepted === 0;
  $("interception-title").textContent = t(
    "interceptedCount",
    report.coverage.intercepted,
  );
  $("coverage-note").textContent =
    t("coverage", report.coverage) +
    (!report.inputs.inventoryComplete || report.inputs.runtime !== "static"
      ? ` ${t("unknownCheck")}`
      : "");
  $("diagnostics").hidden = report.diagnostics.length === 0;
  $("diagnostics-title").textContent = t(
    "diagnosticCount",
    report.diagnostics.length,
  );
  $("diagnostics-list").replaceChildren(
    ...report.diagnostics.map((d) =>
      node(
        "li",
        `${d.platform} · ${t("line")} ${d.line} · ${d.code}: ${d.message}`,
      ),
    ),
  );
  $("provenance").textContent = JSON.stringify(
    { profile: report.profile, inputs: report.inputs },
    null,
    2,
  );
  renderCards();
}
function renderCards() {
  if (!report) return;
  for (const button of document.querySelectorAll("[data-filter]"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.filter === filter),
    );
  const query = $("search").value.toLowerCase();
  const matches = report.results.filter(
    (r) =>
      (filter === "all" ||
        (filter === "intercepted" ? r.interception : r.verdict === filter)) &&
      r.path.toLowerCase().includes(query),
  );
  const visible = matches.slice(0, shownLimit);
  $("visible-count").textContent = t("shown", visible.length, matches.length);
  $("show-more").hidden = visible.length >= matches.length;
  $("result-cards").replaceChildren(
    ...visible.map((r) => {
      const card = node("article", undefined, "result-card");
      card.dataset.verdict = r.verdict;
      card.dataset.interception = String(r.interception);
      const top = node("div", undefined, "result-card-top");
      top.append(
        node("h3", r.path, "result-path"),
        node(
          "span",
          t(r.verdict.toLowerCase()),
          `badge ${r.verdict.toLowerCase()}`,
        ),
        node(
          "span",
          t(r.origin === "asset" ? "assetOrigin" : "suppliedOrigin"),
          "origin-tag",
        ),
      );
      const comparison = node("div", undefined, "outcome-comparison");
      for (const [key, name] of [
        ["netlify", "NETLIFY"],
        ["pages", "PAGES"],
      ]) {
        const mini = node("div", undefined, "outcome-mini");
        mini.append(
          node("span", name, "outcome-platform"),
          node("span", outcomeText(r[key]), "outcome-action"),
        );
        comparison.append(mini);
      }
      const footer = node("div", undefined, "card-footer");
      const reason = node("p");
      if (r.interception)
        reason.append(
          node("span", `${t("interception")} · `, "interception-tag"),
        );
      reason.append(document.createTextNode(r.reason));
      const button = node("button", t("evidence"), "text-button");
      button.type = "button";
      button.setAttribute("aria-label", `${t("evidence")} ${r.path}`);
      button.addEventListener("click", () => showEvidence(r));
      footer.append(reason, button);
      card.append(top, comparison, footer);
      return card;
    }),
  );
  if (!visible.length)
    $("result-cards").append(node("p", t("noMatches"), "no-matches"));
}
function showEvidence(result, open = true) {
  selectedEvidence = result;
  $("evidence-title").textContent = result.path;
  $("evidence-verdict").textContent =
    `${t(result.verdict.toLowerCase())} · ${result.verdict}${result.interception ? ` · ${t("interception")}` : ""}`;
  $("evidence-reason").textContent = result.reason;
  $("evidence-content").replaceChildren(
    ...[
      ["netlify", "Netlify"],
      ["pages", "Cloudflare Pages"],
    ].map(([key, name]) => {
      const o = result[key],
        section = node("section", undefined, "evidence-platform");
      section.append(
        node("h3", name),
        node("pre", outcomeText(o)),
        node("p", o.reason),
        node("h4", t("evidenceLabel")),
      );
      const evidence = node("ul");
      for (const e of o.evidence)
        evidence.append(
          node(
            "li",
            `${e.type}${e.line !== undefined ? ` · ${t("line")} ${e.line}` : ""}: ${e.detail}`,
          ),
        );
      if (!o.evidence.length) evidence.append(node("li", t("noEvidence")));
      section.append(evidence, node("h4", t("traceLabel")));
      const trace = node("ol");
      for (const step of o.trace)
        trace.append(
          node(
            "li",
            `${step.path} → ${step.kind}${step.status !== null ? ` ${step.status}` : ""}${step.target !== null ? ` ${step.target}` : ""}${step.line !== null ? ` (${t("line")} ${step.line})` : ""}`,
          ),
        );
      section.append(trace, node("p", `${t("chainEnd")}: ${o.chainEnd}`));
      return section;
    }),
  );
  if (open) $("evidence-dialog").showModal();
}
function setLanguage() {
  language = $("language").value;
  document.documentElement.lang = language;
  document.title =
    language === "ja"
      ? "Route Witness — ルート移行を、証拠で確かめる"
      : "Route Witness — Evidence before the move";
  for (const el of document.querySelectorAll("[data-i18n]"))
    el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-aria]"))
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  for (const el of document.querySelectorAll("[data-i18n-placeholder]"))
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  setStatus(statusKey);
  updateMeta();
  if (report) renderReport();
  if (selectedEvidence) showEvidence(selectedEvidence, false);
}
function download(format) {
  if (!report) return;
  try {
    const content =
      format === "json"
        ? JSON.stringify(report, null, 2) + "\n"
        : reportHtml(report);
    const url = URL.createObjectURL(
      new Blob([content], {
        type:
          format === "json"
            ? "application/json;charset=utf-8"
            : "text/html;charset=utf-8",
      }),
    );
    const anchor = node("a");
    anchor.href = url;
    anchor.download = `route-witness-report.${format}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    $("error").textContent = String(
      error instanceof Error ? error.message : error,
    );
    $("error").hidden = false;
  }
}
async function readFile(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const target = input.dataset.target;
  invalidate("loading");
  $("sample-note").hidden = true;
  if (target === "inventory") $("complete").checked = false;
  if (target === "netlify" || target === "pages")
    $("static-only").checked = false;
  // One pending read at a time. Any newer edit, file selection, reset, or swap
  // invalidates this token; an old read can never restore prior inputs.
  const token = fileRevision;
  if (file.size > FILE_BYTE_LIMIT) return fail(t("fileTooLarge"));
  fileReading = true;
  $("compare").disabled = true;
  try {
    const bytes = await file.arrayBuffer();
    if (token !== fileRevision) return;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.length > UI_TEXT_LIMIT) return fail(t("textTooLarge"));
    if (
      (target === "netlify" || target === "pages") &&
      text.length > LIMITS.configChars
    )
      return fail(
        `${target}: configuration exceeds ${LIMITS.configChars} characters.`,
      );
    $(target).value = text;
    fileNames.set(target, file.name);
    setStatus("loaded");
    updateMeta();
  } catch {
    if (token === fileRevision) fail(t("fileError"));
  } finally {
    if (token === fileRevision) {
      fileReading = false;
      $("compare").disabled = false;
    }
  }
}
for (const id of ["netlify", "pages", "inventory", "requests"])
  $(id).addEventListener("input", () => changed(id));
for (const id of ["complete", "static-only", "auto-assets"])
  $(id).addEventListener("change", () => {
    invalidate();
    $("sample-note").hidden = true;
  });
for (const input of document.querySelectorAll('input[type="file"]'))
  input.addEventListener("change", () => readFile(input));
$("language").addEventListener("change", setLanguage);
$("load-example").addEventListener("click", applyExample);
$("compare").addEventListener("click", compareNow);
$("cancel").addEventListener("click", () => invalidate("cancelled"));
$("reset").addEventListener("click", () => {
  invalidate("cleared");
  fileNames.clear();
  for (const id of ["netlify", "pages", "inventory", "requests", "search"])
    $(id).value = "";
  for (const id of ["complete", "static-only"]) $(id).checked = false;
  $("auto-assets").checked = true;
  $("sample-note").hidden = true;
  for (const input of document.querySelectorAll('input[type="file"]'))
    input.value = "";
  updateMeta();
});
$("swap").addEventListener("click", () => {
  invalidate("swapped");
  [$("netlify").value, $("pages").value] = [
    $("pages").value,
    $("netlify").value,
  ];
  const a = fileNames.get("netlify"),
    b = fileNames.get("pages");
  fileNames.clear();
  if (b) fileNames.set("netlify", b);
  if (a) fileNames.set("pages", a);
  $("static-only").checked = false;
  $("sample-note").hidden = true;
  updateMeta();
});
for (const button of document.querySelectorAll("[data-filter]"))
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    shownLimit = PAGE_SIZE;
    renderCards();
  });
$("search").addEventListener("input", () => {
  shownLimit = PAGE_SIZE;
  renderCards();
});
$("show-more").addEventListener("click", () => {
  shownLimit += PAGE_SIZE;
  renderCards();
});
$("filter-interceptions").addEventListener("click", () => {
  filter = "intercepted";
  shownLimit = PAGE_SIZE;
  $("search").value = "";
  renderCards();
  document.querySelector('[data-filter="intercepted"]').focus();
});
$("close-evidence").addEventListener("click", closeEvidence);
$("evidence-dialog").addEventListener("close", () => {
  selectedEvidence = null;
});
$("download-json").addEventListener("click", () => download("json"));
$("download-html").addEventListener("click", () => download("html"));
window.addEventListener("pagehide", () => {
  requestId++;
  fileRevision++;
  stopWorker();
});
applyExample();
setLanguage();
