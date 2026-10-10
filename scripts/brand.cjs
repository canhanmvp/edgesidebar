/* Renders the logo to extension icons (icons/) and the store logo (store/assets/). */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const { logoSvg } = require("./logo.cjs");
const root = path.resolve(__dirname, "..");
const assets = path.join(root, "store", "assets");
fs.mkdirSync(assets, { recursive: true });

// Chrome store guidance: the 128px icon holds 96px artwork with 16px transparent padding.
const jobs = [
  [path.join(root, "icons", "icon16.png"), 16, 0],
  [path.join(root, "icons", "icon32.png"), 32, 0],
  [path.join(root, "icons", "icon48.png"), 48, 0],
  [path.join(root, "icons", "icon128.png"), 128, 0.125],
  [path.join(assets, "logo-300x300.png"), 300, 0.06],
  [path.join(assets, "logo-512x512.png"), 512, 0],
];
(async () => {
  fs.writeFileSync(path.join(assets, "logo.svg"), logoSvg(512));
  const browser = await chromium.launch({ channel: "chromium" });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, size, pad] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0;background:transparent">${logoSvg(size, pad)}</body>`,
    );
    await page.screenshot({ path: file, omitBackground: true });
  }
  await browser.close();
  console.log("Rendered " + jobs.length + " logo files");
})();
