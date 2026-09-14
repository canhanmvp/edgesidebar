/* Real MV3 extension tests in an isolated Chromium profile. No signed-in user data. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "test-results");
fs.mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [path.join(root, "scripts/build.cjs")]);
const extension = path.join(root, "dist", "pinned-sidebar");
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.url.startsWith("/blocked")) {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; frame-ancestors 'none'",
    );
    res.end(
      '<!doctype html><title>Protected fixture</title><h1 id="protected">Protected content</h1>',
    );
  } else if (req.url.startsWith("/host")) {
    res.end(
      '<!doctype html><title>Host fixture</title><h1>Normal website</h1><iframe src="/blocked"></iframe>',
    );
  } else {
    res.end(
      "<!doctype html><title>Test website</title><style>*{font-size:40px!important;background:pink!important}button{display:none!important}</style><h1>CSS isolation fixture</h1>",
    );
  }
});
let context;
const errors = [];
const steps = [];
function passed(name) {
  steps.push(name);
  console.log("PASS " + name);
}
async function waitState(page, count) {
  await page.waitForFunction(
    (n) => document.querySelector("#pin-count")?.textContent === String(n),
    count,
  );
}
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 380, height: 850 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const sw =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/sidebar.html`);
  await waitState(page, 3);
  assert.equal(await page.locator("h1").innerText(), "Mọi thứ, ngay bên cạnh.");
  assert.match(
    await page.locator(".site-favicon").first().getAttribute("src"),
    /^https:\/\/www\.google\.com\/s2\/favicons\?sz=64&domain_url=/,
  );
  passed("real extension installs and initial collection renders");
  const collections = page.locator('.group[data-folder]:not([data-folder=""])');
  assert.equal(await collections.count(), 2);
  const firstCollection = collections.nth(0);
  const secondCollection = collections.nth(1);
  const firstCollectionId = await firstCollection.getAttribute("data-folder");
  assert.equal(
    await firstCollection.locator(".collection-grip").getAttribute("draggable"),
    "true",
  );
  await firstCollection
    .locator(".collection-grip")
    .dragTo(secondCollection.locator(".collection-grip"));
  await page.waitForFunction(async (id) => {
    const data = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return data.state.folders[1]?.id === id;
  }, firstCollectionId);
  passed("collections reorder by dragging their grip");
  const translate = await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: "MUTATE",
      action: {
        type: "SAVE_PIN",
        url: "https://translate.google.com/",
        title: "Google Dịch",
      },
    }),
  );
  assert.equal(translate.ok, true);
  await waitState(page, 4);
  await page.route("https://translate.googleapis.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([[["Xin chào", "Hello"]], null, "en"]),
    }),
  );
  await page.getByRole("link", { name: /^Google Dịch —/ }).click();
  await page.locator("#translator:not([hidden])").waitFor();
  await page.locator("#translator-input").fill("Hello");
  await page.locator("#translator-run").click();
  await page.getByText("Xin chào", { exact: true }).waitFor();
  await page.unroute("https://translate.googleapis.com/**");
  const translateId = translate.state.pins.find(
    (pin) => pin.title === "Google Dịch",
  ).id;
  await page.locator("#viewer-back").click();
  await page.evaluate(
    (id) =>
      chrome.runtime.sendMessage({
        type: "MUTATE",
        action: { type: "DELETE_PIN", id },
      }),
    translateId,
  );
  await waitState(page, 3);
  passed("Google Translate pin uses the built-in sidebar text translator");
  await page.screenshot({
    path: path.join(out, "sidebar-light.png"),
    fullPage: true,
  });
  // Invalid URLs stay in the form and do not write.
  await page
    .getByRole("button", { name: "Thêm website", exact: true })
    .first()
    .click();
  await page.locator("#pin-url").fill("javascript:alert(1)");
  await page.locator("#pin-save").click();
  await page.locator("#pin-error").filter({ hasText: "http" }).waitFor();
  await waitState(page, 3);
  await page.locator("#pin-url").fill(origin + "/blocked");
  await page.locator("#pin-title").fill("Trang thử nghiệm");
  await page.locator("#pin-save").click();
  await waitState(page, 4);
  passed("URL validation and pin creation persist through worker");
  // Untrusted labels render literally in every context.
  await page.locator("#add-folder").click();
  const hostile = "<img src=x onerror=alert(1)>";
  await page.locator("#folder-name").fill(hostile);
  await page.locator("#folder-form button[type=submit]").click();
  await page.getByText(hostile, { exact: true }).waitFor();
  assert.equal(
    await page.locator("#pin-list img:not(.site-favicon)").count(),
    0,
  );
  passed("folder HTML injection is displayed as plain text");
  await page.locator("#search").fill("thu nghiem");
  await page.waitForFunction(
    () => document.querySelectorAll(".pin-row").length === 1,
  );
  await page.locator("#search").fill("");
  await waitState(page, 4);
  passed("Vietnamese accent-insensitive search");
  // Import Escape and outside click both cancel.
  const incoming = {
    pins: [{ url: "https://imported.example/", title: "Imported" }],
  };
  await page.locator("#import-file").setInputFiles({
    name: "pins.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(incoming)),
  });
  await page.locator("#choice-dialog[open]").waitFor();
  await page.keyboard.press("Escape");
  await waitState(page, 4);
  assert.equal(await page.locator("#choice-dialog").getAttribute("open"), null);
  await page.locator("#import-file").setInputFiles([]);
  await page.locator("#import-file").setInputFiles({
    name: "pins.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(incoming)),
  });
  await page.locator("#choice-dialog[open]").waitFor();
  await page.mouse.click(2, 2);
  await page.waitForFunction(
    () => !document.querySelector("#choice-dialog").open,
  );
  await waitState(page, 4);
  passed("Escape and outside click cancel import without mutation");
  // Delete and undo.
  await page
    .getByRole("button", { name: "Tùy chọn Trang thử nghiệm", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Bỏ ghim", exact: true }).click();
  await waitState(page, 3);
  await page
    .getByRole("button", { name: "Hoàn tác", exact: true })
    .last()
    .click();
  await waitState(page, 4);
  passed("delete and undo restore the pin");
  // Concurrent real pages write through one service worker.
  const second = await context.newPage();
  await second.goto(`chrome-extension://${id}/sidebar.html`);
  await waitState(second, 4);
  const save = (p, url) =>
    p.evaluate(
      (url) =>
        chrome.runtime.sendMessage({
          type: "MUTATE",
          action: { type: "SAVE_PIN", url },
        }),
      url,
    );
  const responses = await Promise.all([
    save(page, "https://one.example/"),
    save(second, "https://two.example/"),
  ]);
  assert.ok(responses.every((r) => r.ok));
  await waitState(page, 6);
  await waitState(second, 6);
  await second.close();
  passed("two extension pages preserve concurrent changes");
  // Actual drag/drop changes only at drop.
  const rows = page.locator(".group-pins .pin-row");
  const from = rows.nth(0);
  const to = rows.nth(1);
  const moved = await from.getAttribute("data-pin");
  const target = await to.getAttribute("data-pin");
  await from.dragTo(to);
  const saved = await page.evaluate(
    async () => (await chrome.runtime.sendMessage({ type: "GET_STATE" })).state,
  );
  assert.ok(
    saved.pins.findIndex((p) => p.id === moved) <
      saved.pins.findIndex((p) => p.id === target),
  );
  passed("native drag/drop completes and saves order");
  // Viewport and theme inspection.
  await page.locator("#settings-btn").click();
  await page.locator("#setting-theme").selectOption("black");
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "black",
  );
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg")
        .trim(),
    ),
    "#080808",
  );
  await page.locator("#setting-theme").selectOption("pastel");
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "pastel",
  );
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim(),
    ),
    "#9b5c98",
  );
  await page.locator("#setting-theme").selectOption("dark");
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.locator("#settings-dialog [data-close]").click();
  await page.screenshot({
    path: path.join(out, "sidebar-dark.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 280, height: 700 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(out, "sidebar-narrow.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 380, height: 850 });
  await page.locator("#compact-btn").click();
  await page.waitForFunction(() => document.body.classList.contains("compact"));
  await page.screenshot({
    path: path.join(out, "sidebar-compact.png"),
    fullPage: true,
  });
  await page.locator("#compact-btn").click();
  passed("black, pastel, light/dark/compact layouts and 280px viewport");
  // Native DNR matching is enabled automatically; allowed only for sidebar initiator.
  await page.getByRole("link", { name: /^Trang thử nghiệm —/ }).click();
  await page.locator("#viewer:not([hidden])").waitFor();
  await page
    .frameLocator("#viewer-frame")
    .locator("#protected")
    .waitFor({ timeout: 15000 });
  const rules = await sw.evaluate(() =>
    chrome.declarativeNetRequest.getDynamicRules(),
  );
  assert.deepEqual(rules[0].condition.initiatorDomains, [id]);
  passed("automatic DNR unlock loads protected fixture inside extension");
  const site = await context.newPage();
  await site.goto(origin + "/host");
  await site.waitForFunction(() =>
    document.querySelector("#pinned-sidebar-v2"),
  );
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(
    site.frames().filter((f) => f.url() === origin + "/blocked").length,
    0,
  );
  assert.equal(
    await site.evaluate(
      () => document.querySelector("#pinned-sidebar-v2").shadowRoot,
    ),
    null,
  );
  // Dynamic websites can replace their body after the content script loaded.
  // The rail must restore itself instead of disappearing for that tab.
  await site.evaluate(() => {
    document.body.replaceChildren(document.createElement("main"));
  });
  await site.waitForFunction(() =>
    document.querySelector("#pinned-sidebar-v2"),
  );
  passed(
    "normal website iframe stays blocked; overlay is closed and survives body replacement",
  );
  await site.goto(origin + "/");
  await site.waitForFunction(() =>
    document.querySelector("#pinned-sidebar-v2"),
  );
  const railBox = await site.locator("#pinned-sidebar-v2").boundingBox();
  assert.ok(railBox);
  await site.mouse.move(railBox.x + 24, railBox.y + 4);
  await site.mouse.down();
  await site.mouse.move(180, 360, { steps: 5 });
  await site.mouse.up();
  await page.waitForFunction(async () => {
    const data = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return (
      Number.isFinite(data.state.settings.overlayX) &&
      Number.isFinite(data.state.settings.overlayY)
    );
  });
  const movedRailBox = await site.locator("#pinned-sidebar-v2").boundingBox();
  assert.ok(movedRailBox);
  await site.mouse.move(movedRailBox.x + 24, movedRailBox.y + 4);
  await site.mouse.down();
  await site.mouse.move(370, 360, { steps: 5 });
  await site.mouse.up();
  await page.waitForFunction(async () => {
    const data = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return data.state.settings.overlayX >= 300;
  });
  const rightRailBox = await site.locator("#pinned-sidebar-v2").boundingBox();
  assert.ok(rightRailBox);
  await site.mouse.move(rightRailBox.x + 24, rightRailBox.y + 25);
  await site.waitForFunction(() => {
    const rail = document.querySelector("#pinned-sidebar-v2");
    return rail && rail.getBoundingClientRect().width > 100;
  });
  const expandedRightRailBox = await site
    .locator("#pinned-sidebar-v2")
    .boundingBox();
  assert.ok(expandedRightRailBox.width > 100);
  await site.screenshot({
    path: path.join(out, "overlay-right-hover.png"),
    fullPage: true,
  });
  await site.mouse.move(10, 10);
  await site.waitForFunction(() => {
    const rail = document.querySelector("#pinned-sidebar-v2");
    return rail && rail.getBoundingClientRect().width <= 50;
  });
  // Edge reduces the web page viewport when its native Side Panel opens.
  // The saved right-side position must re-clamp and leave the page scrollbar
  // uncovered in that narrow space.
  await site.setViewportSize({ width: 120, height: 850 });
  await site.waitForFunction(() => {
    const rail = document.querySelector("#pinned-sidebar-v2");
    return rail && rail.getBoundingClientRect().right <= innerWidth - 20;
  });
  await site.setViewportSize({ width: 380, height: 850 });
  await site.waitForFunction(() => {
    const rail = document.querySelector("#pinned-sidebar-v2");
    return (
      rail &&
      Math.abs(rail.getBoundingClientRect().right - (innerWidth - 24)) <= 2
    );
  });
  passed("icon rail can be dragged and remembers its position");
  await site.screenshot({
    path: path.join(out, "overlay.png"),
    fullPage: true,
  });
  // Revoke and ensure dynamic rule is removed.
  await page.locator("#settings-btn").click();
  await page
    .getByRole("button", { name: "Thu hồi " + origin, exact: true })
    .click();
  await page.waitForFunction(
    async () => !(await chrome.declarativeNetRequest.getDynamicRules()).length,
  );
  await page.locator("#settings-dialog [data-close]").click();
  await page.locator("#viewer-back").click();
  await page.reload();
  await waitState(page, 6);
  passed("revoke iframe exception and reload preserve collection");
  // Large collection uses local storage; explicit sync cannot silently lose data.
  const large = await page.evaluate(async () =>
    chrome.runtime.sendMessage({
      type: "MUTATE",
      action: {
        type: "IMPORT",
        mode: "replace",
        data: {
          pins: Array.from({ length: 1000 }, (_, i) => ({
            url: `https://large.example/${i}`,
            title: `Website ${i}`,
          })),
        },
      },
    }),
  );
  assert.equal(large.ok, true);
  await waitState(page, 1000);
  const sync = await page.evaluate(() =>
    chrome.runtime.sendMessage({ type: "SYNC_NOW" }),
  );
  assert.equal(sync.ok, false);
  await page.reload();
  await waitState(page, 1000);
  passed("1000 pins persist and cloud quota failure is surfaced");
  const panelSite = await context.newPage();
  await panelSite.goto(origin + "/");
  await panelSite.waitForFunction(() =>
    document.querySelector("#pinned-sidebar-v2"),
  );
  const panelRail = await panelSite.locator("#pinned-sidebar-v2").boundingBox();
  assert.ok(panelRail);
  await panelSite.mouse.click(panelRail.x + 24, panelRail.y + 25);
  await page.waitForFunction(async () => {
    const window = await chrome.windows.getCurrent();
    const session = await chrome.storage.session.get("viewer." + window.id);
    return session["viewer." + window.id]?.pin === null;
  });
  await panelSite.close();
  passed("clicking the collapsed rail opens the sidebar automatically");
  const closeSite = await context.newPage();
  await closeSite.goto(origin + "/");
  await closeSite.waitForFunction(() =>
    document.querySelector("#pinned-sidebar-v2"),
  );
  const closeRail = await closeSite.locator("#pinned-sidebar-v2").boundingBox();
  assert.ok(closeRail);
  await closeSite.mouse.move(closeRail.x + 24, closeRail.y + 25);
  await closeSite.mouse.click(closeRail.x + 36, closeRail.y + 16);
  await page.waitForFunction(async () => {
    const data = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return data.state.settings.overlay === false;
  });
  await closeSite.waitForFunction(
    () => !document.querySelector("#pinned-sidebar-v2"),
  );
  await closeSite.close();
  passed("small close button hides the floating rail and saves the choice");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, "browser-report.json"),
    JSON.stringify({ passed: steps, errors }, null, 2),
  );
  console.log(`${steps.length} browser checks passed.`);
})()
  .catch(async (error) => {
    console.error(error);
    if (context) {
      const page = context
        .pages()
        .find((p) => p.url().includes("sidebar.html"));
      if (page)
        await page
          .screenshot({ path: path.join(out, "failure.png"), fullPage: true })
          .catch(() => {});
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    if (context) await context.close();
    server.close();
  });
