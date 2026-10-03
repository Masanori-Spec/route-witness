import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import {
  compare,
  parseInventoryText,
  parseRequestsText,
  reportHtml,
} from "../../build/engine.js";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const artifactDir =
  process.env.BROWSER_ARTIFACT_DIR || "tests/browser/artifacts";
await mkdir(artifactDir, { recursive: true });
const results = [],
  pageErrors = [];
const defaults = {
  netlify:
    "# Static files may shadow an unforced rule.\n/old /new 301\n/* /fallback.txt 200",
  pages:
    "# Static files may shadow an unforced rule.\n/old /new 301\n/* /fallback.txt 200",
  inventory:
    "/fallback.txt\n/assets/app.js\n/assets/site.css\n/images/logo.svg",
  requests: "/old\n/docs/start\n/missing\n/",
  complete: true,
  staticOnly: true,
  autoAssets: true,
};
const expectedFor = (input) =>
  compare({
    netlify: input.netlify,
    pages: input.pages,
    inventory: parseInventoryText(
      input.inventory,
      input.complete,
      input.staticOnly ? "static" : "unknown",
    ),
    requests: parseRequestsText(input.requests),
    autoAssets: input.autoAssets,
  });
const defaultReport = expectedFor(defaults);
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
} catch (error) {
  await writeFile(
    `${artifactDir}/results.json`,
    JSON.stringify(
      {
        status: "blocked",
        stage: "launch",
        testsRun: 0,
        sandbox: true,
        error: error.message,
        results,
      },
      null,
      2,
    ),
  );
  console.error(
    "Browser launch blocked; no scenarios ran. The Chromium sandbox remains enabled.",
  );
  throw error;
}
async function setup(page, language = "en") {
  await page.goto(baseURL);
  await page.locator("#language").selectOption(language);
}
async function ready(page) {
  await page.locator("#results").waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      document.querySelector("#compare").getAttribute("aria-busy") === "false",
  );
  assert.equal(await page.locator("#error").isVisible(), false);
  assert.equal(await page.locator("#download-json").isDisabled(), false);
}
async function run(page) {
  await page.locator("#compare").click();
  await ready(page);
}
async function fill(page, input = defaults) {
  for (const id of ["netlify", "pages", "inventory", "requests"])
    await page.locator(`#${id}`).fill(input[id]);
  await page.locator("#complete").setChecked(input.complete);
  await page.locator("#static-only").setChecked(input.staticOnly);
  await page.locator("#auto-assets").setChecked(input.autoAssets);
}
async function download(page, format = "json") {
  const pending = page.waitForEvent("download");
  await page.locator(`#download-${format}`).click();
  const item = await pending;
  assert.equal(item.suggestedFilename(), `route-witness-report.${format}`);
  let bytes = Buffer.alloc(0);
  for await (const chunk of await item.createReadStream())
    bytes = Buffer.concat([bytes, chunk]);
  return bytes.toString("utf8");
}
async function parity(page, expected) {
  for (const key of ["total", "changed", "unknown", "same"])
    assert.equal(
      await page.locator(`[data-metric="${key}"] strong`).textContent(),
      String(expected.coverage[key]),
      key,
    );
  assert.deepEqual(
    JSON.parse(await download(page)),
    expected,
    "JSON is the actual deterministic engine report",
  );
}
async function fakeWorker(page, mode) {
  await page.addInitScript(
    ({ report, mode }) => {
      window.__workers = { created: 0, terminated: 0, posted: 0 };
      window.Worker = class {
        constructor() {
          this.id = ++window.__workers.created;
          if (mode === "constructor" && this.id === 1)
            throw new Error("Simulated constructor failure");
        }
        terminate() {
          window.__workers.terminated++;
        }
        postMessage(message) {
          window.__workers.posted++;
          if (mode === "post" && this.id === 1)
            throw new Error("Simulated postMessage failure");
          // Keep captured callbacks even after termination. A stale-closure test
          // must not pass merely because the app clears a worker's handlers.
          const deliver = this.onmessage,
            fail = this.onerror,
            bad = this.onmessageerror;
          if (this.id === 1 && mode === "error")
            return setTimeout(() => fail?.({ preventDefault() {} }), 15);
          if (this.id === 1 && mode === "messageerror")
            return setTimeout(() => bad?.({}), 15);
          if (
            this.id === 1 &&
            [
              "invalid",
              "invalid-nested",
              "missing-id",
              "undefined",
              "thrown",
            ].includes(mode)
          ) {
            let data = { requestId: message.requestId, report: {} };
            if (mode === "invalid-nested") {
              data.report = structuredClone(report);
              data.report.results[0].netlify.evidence = null;
            }
            if (mode === "missing-id") data = { report };
            if (mode === "undefined") data = undefined;
            if (mode === "thrown")
              data = {
                requestId: message.requestId,
                error: { message: "Simulated engine failure" },
              };
            return setTimeout(() => deliver?.({ data }), 15);
          }
          if (mode === "id")
            setTimeout(
              () =>
                deliver?.({
                  data: {
                    requestId: message.requestId + 100,
                    error: { message: "Stale wrong request ID" },
                  },
                }),
              5,
            );
          const output = structuredClone(report);
          if (this.id === 1 && mode === "late")
            output.results[0].path = "/STALE-RESULT";
          setTimeout(
            () =>
              deliver?.({
                data: { requestId: message.requestId, report: output },
              }),
            this.id === 1 && mode === "late" ? 500 : 35,
          );
          if (mode === "after-complete")
            setTimeout(() => fail?.({ preventDefault() {} }), 200);
        }
      };
    },
    { report: defaultReport, mode },
  );
}
async function fileDelays(page) {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    window.__fileReads = 0;
    File.prototype.arrayBuffer = async function (...args) {
      window.__fileReads++;
      if (this.name.startsWith("bad")) throw new Error("Simulated read error");
      const bytes = await original.apply(this, args);
      if (this.name.startsWith("slow"))
        await new Promise((resolve) => setTimeout(resolve, 500));
      return bytes;
    };
  });
}
const file = (name, content) => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.isBuffer(content) ? content : Buffer.from(content),
});
async function test(name, fn, viewport = { width: 1440, height: 1100 }) {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await fn(page);
    assert.deepEqual(errors, [], "No uncaught browser errors");
    results.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: "failed", error: error.stack });
    await page
      .screenshot({
        path: `${artifactDir}/${name.replace(/[^a-z0-9]+/gi, "-")}-failure.png`,
        fullPage: true,
      })
      .catch(() => {});
    console.error(`FAIL ${name}\n${error.stack}`);
  } finally {
    pageErrors.push(...errors);
    await page.close();
  }
}

await test("initial Japanese sample keyboard skip and bilingual controls", async (page) => {
  await page.goto(baseURL);
  assert.equal(await page.locator("html").getAttribute("lang"), "ja");
  await page.keyboard.press("Tab");
  assert.match(
    await page.evaluate(() => document.activeElement.textContent),
    /比較ツールへ/,
  );
  await page.keyboard.press("Enter");
  assert.match(page.url(), /#workspace$/);
  assert.equal(await page.locator("#empty").isVisible(), true);
  assert.equal(await page.locator("#results").isVisible(), false);
  assert.equal(await page.locator("#complete").isChecked(), true);
  assert.equal(await page.locator("#static-only").isChecked(), true);
  assert.equal(await page.locator("#download-json").isDisabled(), true);
  await page.locator("#language").selectOption("en");
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(
    await page.getByLabel("Build file inventory", { exact: true }).count(),
    1,
  );
  assert.equal(
    await page.getByLabel("Request paths to compare", { exact: true }).count(),
    1,
  );
  assert.match(await page.title(), /Route Witness/);
  await page.screenshot({
    path: `${artifactDir}/desktop-inputs-en.png`,
    fullPage: true,
  });
});
await test("skip link stays clipped when scrolled and reveals on keyboard focus", async (page) => {
  for (const viewport of [
    { width: 1440, height: 1100 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await setup(page);
    await page.evaluate(() =>
      window.scrollTo({ top: 1200, behavior: "instant" }),
    );
    const inspect = () =>
      page.locator(".skip-link").evaluate((el) => {
        const style = getComputedStyle(el),
          rect = el.getBoundingClientRect();
        return {
          focused: el === document.activeElement,
          clipPath: style.clipPath,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          scrollY: window.scrollY,
        };
      });
    let state = await inspect();
    assert.ok(
      state.scrollY > 0,
      "The nonfocused clipping check must run after scrolling",
    );
    assert.equal(state.focused, false);
    assert.equal(state.clipPath, "inset(50%)");
    assert.equal(state.width, 1);
    assert.equal(state.height, 1);
    // Programmatic focus uses the same CSS :focus state as keyboard Tab; the
    // existing first-Tab test independently checks keyboard reachability.
    await page.locator(".skip-link").focus();
    state = await inspect();
    assert.equal(state.focused, true);
    assert.equal(state.clipPath, "none");
    assert.ok(state.width > 1 && state.height > 1);
    assert.ok(state.left >= 0 && state.top >= 0);
    assert.ok(state.right <= viewport.width && state.bottom <= viewport.height);
    await page.keyboard.press("Enter");
    assert.match(page.url(), /#workspace$/);
    await page.locator("#netlify").focus();
    state = await inspect();
    assert.equal(state.focused, false);
    assert.equal(state.clipPath, "inset(50%)");
    assert.equal(state.width, 1);
    assert.equal(state.height, 1);
  }
});
await test("real sample asset interception report export evidence and repeat", async (page) => {
  await setup(page);
  await run(page);
  await parity(page, defaultReport);
  assert.ok(defaultReport.coverage.intercepted > 0);
  assert.ok(defaultReport.coverage.unknown > 0);
  assert.equal(await page.locator("#interception-banner").isVisible(), true);
  assert.equal(
    await page.locator(".result-card").count(),
    defaultReport.coverage.total,
  );
  const card = page.locator('.result-card[data-interception="true"]').first();
  await card.locator("button").click();
  assert.equal(await page.locator("#evidence-dialog").isVisible(), true);
  assert.match(await page.locator("#evidence-content").textContent(), /line 3/);
  assert.match(
    await page.locator("#evidence-content").textContent(),
    /\/assets\//,
  );
  await page.screenshot({
    path: `${artifactDir}/desktop-evidence-en.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#evidence-dialog").isVisible(), false);
  assert.equal(
    await card
      .locator("button")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  assert.equal(await download(page, "html"), reportHtml(defaultReport));
  for (let i = 0; i < 2; i++) {
    await run(page);
    await parity(page, defaultReport);
  }
  await page.screenshot({
    path: `${artifactDir}/desktop-report-en.png`,
    fullPage: true,
  });
});
await test("filters search and banner show only matching witnesses", async (page) => {
  await setup(page);
  await run(page);
  for (const verdict of ["CHANGED", "UNKNOWN", "SAME"]) {
    await page.locator(`[data-filter="${verdict}"]`).click();
    assert.equal(
      await page.locator(".result-card").count(),
      defaultReport.coverage[verdict.toLowerCase()],
    );
  }
  await page.locator("#filter-interceptions").click();
  assert.equal(
    await page.locator(".result-card").count(),
    defaultReport.coverage.intercepted,
  );
  assert.equal(
    await page
      .locator('[data-filter="intercepted"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#search").fill("/does-not-exist");
  assert.equal(await page.locator(".result-card").count(), 0);
  assert.match(
    await page.locator("#result-cards").textContent(),
    /No requests match/,
  );
  await page.locator("#search").fill("app.js");
  assert.equal(await page.locator(".result-card").count(), 1);
});
await test("all examples match engine and preserve explicit unknown cases", async (page) => {
  await setup(page);
  for (const example of ["defaults", "forced", "unknown", "spa"]) {
    await page.locator("#example").selectOption(example);
    await page.locator("#load-example").click();
    const input = { ...defaults };
    for (const key of ["netlify", "pages", "inventory", "requests"])
      input[key] = await page.locator(`#${key}`).inputValue();
    await run(page);
    await parity(page, expectedFor(input));
    if (["forced", "unknown"].includes(example))
      assert.ok(expectedFor(input).coverage.unknown > 0);
  }
});
await test("language retains input report filters and machine evidence", async (page) => {
  await setup(page);
  await run(page);
  await page.locator('[data-filter="CHANGED"]').click();
  const input = await page.locator("#netlify").inputValue();
  await page.locator("#language").selectOption("ja");
  assert.match(await page.locator("#status").textContent(), /比較が完了/);
  assert.equal(await page.locator("#netlify").inputValue(), input);
  assert.equal(
    await page.locator('[data-filter="CHANGED"]').getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page.locator(".result-card").count(),
    defaultReport.coverage.changed,
  );
  assert.match(
    await page.locator(".card-footer").first().textContent(),
    /Initial action/,
  );
  await page.screenshot({
    path: `${artifactDir}/desktop-report-ja.png`,
    fullPage: true,
  });
  await page.locator("#language").selectOption("en");
  await parity(page, defaultReport);
});
await test("every input edit removes stale report and correct attestation", async (page) => {
  await setup(page);
  for (const id of ["netlify", "pages", "inventory", "requests"]) {
    await page.locator("#load-example").click();
    await run(page);
    await page
      .locator(`#${id}`)
      .fill((await page.locator(`#${id}`).inputValue()) + "\n");
    assert.equal(await page.locator("#results").isVisible(), false, id);
    assert.equal(await page.locator("#download-json").isDisabled(), true, id);
    assert.match(await page.locator("#status").textContent(), /Inputs changed/);
    if (id === "inventory")
      assert.equal(await page.locator("#complete").isChecked(), false);
    if (["netlify", "pages"].includes(id))
      assert.equal(await page.locator("#static-only").isChecked(), false);
  }
  for (const id of ["complete", "static-only", "auto-assets"]) {
    await page.locator("#load-example").click();
    await run(page);
    await page.locator(`#${id}`).uncheck();
    assert.equal(await page.locator("#results").isVisible(), false, id);
  }
});
await test("unattested incomplete and JSON flags cannot imply certainty", async (page) => {
  await setup(page);
  for (const changes of [{ complete: false }, { staticOnly: false }]) {
    const input = { ...defaults, ...changes };
    await fill(page, input);
    await run(page);
    await parity(page, expectedFor(input));
    assert.equal(
      expectedFor(input).coverage.unknown,
      expectedFor(input).coverage.total,
    );
  }
  await page.locator("#load-example").click();
  await page.locator("#inventory").fill(
    JSON.stringify({
      complete: true,
      runtime: "static",
      paths: ["/fallback.txt", "/assets/app.js"],
    }),
  );
  assert.equal(await page.locator("#complete").isChecked(), false);
  await run(page);
  const output = JSON.parse(await download(page));
  assert.equal(output.inputs.inventoryComplete, false);
  assert.equal(output.coverage.unknown, output.coverage.total);
});
await test("swap configs invalidates results and requires runtime reattestation", async (page) => {
  await setup(page);
  const input = {
    ...defaults,
    netlify: "/old /new 301",
    pages: "/old /new 302",
  };
  await fill(page, input);
  await run(page);
  await page.locator("#swap").click();
  assert.equal(await page.locator("#netlify").inputValue(), input.pages);
  assert.equal(await page.locator("#pages").inputValue(), input.netlify);
  assert.equal(await page.locator("#results").isVisible(), false);
  assert.equal(await page.locator("#static-only").isChecked(), false);
  await page.locator("#static-only").check();
  await run(page);
  await parity(
    page,
    expectedFor({ ...input, netlify: input.pages, pages: input.netlify }),
  );
});
await test("auto assets toggle changes only auto-added corpus coverage", async (page) => {
  await setup(page);
  await page.locator("#auto-assets").uncheck();
  await run(page);
  const expected = expectedFor({ ...defaults, autoAssets: false });
  await parity(page, expected);
  assert.equal(expected.coverage.autoAdded, 0);
});
await test("malformed inventory oversized config errors and recovery", async (page) => {
  await setup(page);
  await page.locator("#inventory").fill('{"paths":');
  await page.locator("#compare").click();
  await page.locator("#error").waitFor({ state: "visible" });
  assert.equal(await page.locator("#results").isVisible(), false);
  await page.locator("#load-example").click();
  await page.locator("#netlify").fill("x".repeat(100001));
  await page.locator("#compare").click();
  assert.match(await page.locator("#error").textContent(), /100000/);
  await page.locator("#load-example").click();
  await run(page);
  await parity(page, defaultReport);
});
await test("reset clears values files attestations and downloadable output", async (page) => {
  await setup(page);
  await run(page);
  await page.locator("#reset").click();
  for (const id of ["netlify", "pages", "inventory", "requests"])
    assert.equal(await page.locator(`#${id}`).inputValue(), "");
  assert.equal(await page.locator("#complete").isChecked(), false);
  assert.equal(await page.locator("#static-only").isChecked(), false);
  assert.equal(await page.locator("#download-html").isDisabled(), true);
  assert.equal(await page.locator("#results").isVisible(), false);
  for (const id of ["netlify", "pages", "inventory", "requests"])
    assert.equal(await page.locator(`#${id}-file`).inputValue(), "");
  await page.locator("#load-example").click();
  await run(page);
});
await test("literal hostile text stays inert and comparison has no network egress", async (page) => {
  const requests = [],
    dialogs = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await setup(page);
  const hostile =
    "/<img src=https://untrusted.invalid/tracker onerror=alert(1)>";
  const input = {
    ...defaults,
    requests: `${hostile}\n/old\nhttps://untrusted.invalid/api`,
  };
  await fill(page, input);
  await run(page);
  await parity(page, expectedFor(input));
  assert.match(
    await page.locator("#result-cards").textContent(),
    /<img src=https:\/\/untrusted.invalid/,
  );
  assert.equal(
    await page
      .locator("#results img, #results script, #results iframe")
      .count(),
    0,
  );
  assert.deepEqual(dialogs, []);
  assert.ok(
    requests.every((url) => new URL(url).origin === new URL(baseURL).origin),
    requests.join("\n"),
  );
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /worker-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https:/);
  const html = await download(page, "html");
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=https:\/\/untrusted/);
});
await test("cancel terminates worker and captured late result cannot return", async (page) => {
  await fakeWorker(page, "late");
  await setup(page);
  await page.locator("#compare").click();
  await page.locator("#cancel").click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#results").isVisible(), false);
  assert.match(await page.locator("#status").textContent(), /cancelled/);
  assert.equal(await page.evaluate(() => window.__workers.terminated), 1);
  await run(page);
  await parity(page, defaultReport);
});
await test("repeated compare replaces worker and rejects captured stale callback", async (page) => {
  await fakeWorker(page, "late");
  await setup(page);
  await page.locator("#compare").click();
  await page.locator("#compare").click();
  await ready(page);
  await page.waitForTimeout(600);
  assert.doesNotMatch(
    await page.locator("#result-cards").textContent(),
    /STALE-RESULT/,
  );
  assert.equal(await page.evaluate(() => window.__workers.created), 2);
  await parity(page, defaultReport);
});
await test("input edits while running terminate worker and ignore late results", async (page) => {
  await fakeWorker(page, "late");
  await setup(page);
  await page.locator("#compare").click();
  await page.locator("#requests").fill("/first-edit");
  await page.locator("#requests").fill("/second-edit");
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#results").isVisible(), false);
  assert.match(await page.locator("#status").textContent(), /Inputs changed/);
  assert.equal(await page.locator("#download-json").isDisabled(), true);
});
await test("reset and example loading cancel running work", async (page) => {
  await fakeWorker(page, "late");
  await setup(page);
  await page.locator("#compare").click();
  await page.locator("#reset").click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#results").isVisible(), false);
  assert.equal(await page.locator("#requests").inputValue(), "");
  await page.locator("#load-example").click();
  await run(page);
});
for (const mode of [
  "constructor",
  "post",
  "error",
  "messageerror",
  "invalid",
  "invalid-nested",
  "missing-id",
  "undefined",
  "thrown",
]) {
  await test(`worker ${mode} failure disables exports and recovers`, async (page) => {
    await fakeWorker(page, mode);
    await setup(page);
    await page.locator("#compare").click();
    await page.locator("#error").waitFor({ state: "visible" });
    assert.equal(await page.locator("#results").isVisible(), false);
    assert.equal(await page.locator("#download-json").isDisabled(), true);
    assert.equal(await page.locator("#cancel").isDisabled(), true);
    assert.equal(
      await page.locator("#compare").getAttribute("aria-busy"),
      "false",
    );
    await run(page);
    await parity(page, defaultReport);
  });
}
for (const mode of ["id", "after-complete"]) {
  await test(`worker ${mode} callback does not corrupt current output`, async (page) => {
    await fakeWorker(page, mode);
    await setup(page);
    await run(page);
    await page.waitForTimeout(250);
    await parity(page, defaultReport);
  });
}
await test("same file can be selected repeatedly and after reset", async (page) => {
  await fileDelays(page);
  await setup(page);
  for (let index = 0; index < 2; index++) {
    await page
      .locator("#inventory-file")
      .setInputFiles(
        file("build.json", '{"paths":["/fallback.txt","/assets/app.js"]}'),
      );
    await page.waitForFunction(
      () => document.querySelector("#compare").disabled === false,
    );
    assert.equal(await page.locator("#inventory-file").inputValue(), "");
    assert.equal(await page.locator("#complete").isChecked(), false);
  }
  assert.equal(await page.evaluate(() => window.__fileReads), 2);
  await page.locator("#reset").click();
  await page
    .locator("#inventory-file")
    .setInputFiles(
      file("build.json", '{"paths":["/fallback.txt","/assets/app.js"]}'),
    );
  await page.waitForFunction(
    () => document.querySelector("#compare").disabled === false,
  );
  assert.match(await page.locator("#inventory").inputValue(), /app.js/);
  assert.equal(await page.evaluate(() => window.__fileReads), 3);
});
await test("slow file read cannot overwrite newer paste reset or file", async (page) => {
  await fileDelays(page);
  await setup(page);
  await page
    .locator("#requests-file")
    .setInputFiles(file("slow-first.txt", "/stale"));
  await page.locator("#requests").fill("/new-paste");
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#requests").inputValue(), "/new-paste");
  await page
    .locator("#requests-file")
    .setInputFiles(file("slow-reset.txt", "/stale"));
  await page.locator("#reset").click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#requests").inputValue(), "");
  await page
    .locator("#requests-file")
    .setInputFiles(file("slow-old.txt", "/stale"));
  await page
    .locator("#requests-file")
    .setInputFiles(file("new.txt", "/new-file"));
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#requests").inputValue(), "/new-file");
  assert.equal(await page.locator("#compare").isDisabled(), false);
});
await test("file errors invalid UTF8 size caps and recovery", async (page) => {
  await fileDelays(page);
  await setup(page);
  for (const source of [
    file("bad-read.txt", "/x"),
    file("utf8.txt", Buffer.from([0xff, 0xfe, 0xff])),
    file("oversized.txt", Buffer.alloc(4 * 1024 * 1024 + 1, 65)),
  ]) {
    await page.locator("#inventory-file").setInputFiles(source);
    await page.locator("#error").waitFor({ state: "visible" });
    assert.equal(await page.locator("#results").isVisible(), false);
    assert.equal(await page.locator("#compare").isDisabled(), false);
  }
  await page.locator("#load-example").click();
  await run(page);
});
await test("configuration file loads revoke static attestation and retain separate sides", async (page) => {
  await setup(page);
  await page
    .locator("#netlify-file")
    .setInputFiles(file("netlify.txt", "/old /new 301"));
  await page.waitForFunction(
    () => document.querySelector("#compare").disabled === false,
  );
  assert.equal(await page.locator("#netlify").inputValue(), "/old /new 301");
  assert.equal(await page.locator("#pages").inputValue(), defaults.pages);
  assert.equal(await page.locator("#static-only").isChecked(), false);
  assert.match(
    await page.locator("#netlify-meta").textContent(),
    /netlify.txt/,
  );
});
await test("large corpus paginates witnesses without losing full export", async (page) => {
  await setup(page);
  const input = {
    ...defaults,
    netlify: "/* /fallback.txt 200",
    pages: "/* /fallback.txt 200",
    requests: Array.from({ length: 215 }, (_, i) => `/path-${i}`).join("\n"),
    autoAssets: false,
  };
  await fill(page, input);
  await run(page);
  assert.equal(await page.locator(".result-card").count(), 100);
  assert.equal(await page.locator("#show-more").isVisible(), true);
  await page.locator("#show-more").click();
  assert.equal(await page.locator(".result-card").count(), 200);
  await page.locator("#show-more").click();
  assert.equal(await page.locator(".result-card").count(), 215);
  assert.equal(await page.locator("#show-more").isVisible(), false);
  await parity(page, expectedFor(input));
});
await test(
  "mobile Japanese inputs report evidence and no horizontal overflow",
  async (page) => {
    await setup(page, "ja");
    await page.screenshot({
      path: `${artifactDir}/mobile-inputs-ja.png`,
      fullPage: true,
    });
    await run(page);
    await parity(page, defaultReport);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: `${artifactDir}/mobile-report-ja.png`,
      fullPage: true,
    });
    await page
      .locator('.result-card[data-interception="true"] button')
      .first()
      .click();
    assert.equal(await page.locator("#evidence-dialog").isVisible(), true);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector("#evidence-dialog").scrollWidth <=
          window.innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: `${artifactDir}/mobile-evidence-ja.png`,
      fullPage: true,
    });
    await page.locator("#close-evidence").click();
  },
  { width: 390, height: 844 },
);

await browser.close();
const summary = {
  status: results.some((result) => result.status !== "passed")
    ? "failed"
    : "passed",
  sandbox: true,
  testsRun: results.length,
  passed: results.filter((result) => result.status === "passed").length,
  failed: results.filter((result) => result.status === "failed").length,
  pageErrors,
  results,
};
await writeFile(
  `${artifactDir}/results.json`,
  JSON.stringify(summary, null, 2),
);
console.log(
  JSON.stringify({
    status: summary.status,
    passed: summary.passed,
    failed: summary.failed,
  }),
);
if (summary.failed || pageErrors.length) process.exitCode = 1;
