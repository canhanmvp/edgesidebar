/* Generates store assets in store/assets from the real built extension (clean profile):
   5 screenshots 1280x800, small promo tile 440x280, marquee promo 1400x560. */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { logoSvg } = require("./logo.cjs");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "store", "assets");
const tmp = path.join(out, "_tmp");
fs.mkdirSync(tmp, { recursive: true });
for (const script of ["brand.cjs", "build.cjs"])
  execFileSync(process.execPath, [path.join(__dirname, script)], {
    stdio: "inherit",
  });
const extension = path.join(root, "dist", "pinned-sidebar");
const uri = (file) =>
  "data:image/png;base64," + fs.readFileSync(file).toString("base64");
const GREEN = "linear-gradient(135deg,#17503e,#3f9d78)";
const PURPLE = "linear-gradient(135deg,#27213b,#4b3f72)";
const NAVY = "linear-gradient(135deg,#0d1424,#1f4f86)";
const base = `*{box-sizing:border-box;margin:0}body{overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif;color:#fff}
img.shot{display:block;border-radius:16px;box-shadow:0 26px 60px rgba(0,0,0,.38)}`;

function frame(title, subtitle, shots, background, height = 700) {
  return `<!doctype html><meta charset="utf-8"><style>${base}
body{width:1280px;height:800px;background:${background};display:flex;align-items:center;padding:0 80px;gap:70px}
h1{font-size:54px;line-height:1.1;font-weight:700;letter-spacing:-.02em}
p{margin-top:20px;font-size:24px;line-height:1.4;opacity:.9;max-width:520px}
.text{flex:1}.shots{display:flex;gap:26px}
img.shot{height:${height}px}</style>
<div class="text"><h1>${title}</h1><p>${subtitle}</p></div>
<div class="shots">${shots.map((s) => `<img class="shot" src="${s}">`).join("")}</div>`;
}
function frameWide(title, subtitle, shots, background) {
  const width = Math.floor((1140 - 22 * (shots.length - 1)) / shots.length);
  return `<!doctype html><meta charset="utf-8"><style>${base}
body{width:1280px;height:800px;background:${background};padding:56px 70px 0}
h1{font-size:48px;font-weight:700;letter-spacing:-.02em}
p{margin-top:12px;font-size:22px;opacity:.9}
.shots{display:flex;gap:22px;margin-top:34px;justify-content:center}
img.shot{width:${width}px}</style>
<h1>${title}</h1><p>${subtitle}</p>
<div class="shots">${shots.map((s) => `<img class="shot" src="${s}">`).join("")}</div>`;
}
function marquee(shotA, shotB) {
  return `<!doctype html><meta charset="utf-8"><style>${base}
body{width:1400px;height:560px;background:${GREEN};position:relative}
.copy{position:absolute;left:90px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;width:660px}
.logo{width:128px;height:128px;margin-bottom:26px;filter:drop-shadow(0 12px 24px rgba(0,0,0,.3))}
h1{font-size:76px;line-height:1;font-weight:750;letter-spacing:-.03em}
p{margin-top:20px;font-size:30px;line-height:1.35;opacity:.92}
.a,.b{position:absolute;width:300px}
.a{left:790px;top:60px}.b{left:1110px;top:100px}</style>
<div class="copy"><div class="logo">${logoSvg(128)}</div><h1>Pinned Sidebar</h1>
<p>Ghim, tìm, sắp xếp website<br>ngay bên cạnh trình duyệt.</p></div>
<img class="shot a" src="${shotA}"><img class="shot b" src="${shotB}">`;
}
function tile(tagline) {
  return `<!doctype html><meta charset="utf-8"><style>${base}
body{width:440px;height:280px;background:${GREEN};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px}
.logo{width:92px;height:92px;filter:drop-shadow(0 8px 16px rgba(0,0,0,.3))}
b{font-size:34px;letter-spacing:-.02em;line-height:1}span{font-size:15px;opacity:.9}</style>
<div class="logo">${logoSvg(92)}</div><b>Pinned Sidebar</b><span>${tagline}</span>`;
}

(async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 380, height: 700 },
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
  await page.goto(`chrome-extension://${id}/sidebar.html`);
  await page.waitForFunction(
    () => document.querySelector("#pin-count")?.textContent === "3",
  );
  // A fuller, realistic collection.
  await page.evaluate(async () => {
    const { state } = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    const workspaceId = state.workspaces[0].id;
    const folder = state.folders.find((f) => f.name === "Công việc");
    for (const [title, url] of [
      ["Notion", "https://www.notion.so"],
      ["Figma", "https://www.figma.com"],
      ["Gmail", "https://mail.google.com"],
      ["Wikipedia", "https://www.wikipedia.org"],
    ])
      await chrome.runtime.sendMessage({
        type: "MUTATE",
        action: {
          type: "SAVE_PIN",
          url,
          title,
          workspaceId,
          folderId: folder?.id,
        },
      });
  });
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#pin-count")?.textContent === "7",
  );
  await page.waitForTimeout(2500);
  const shot = async (name) => {
    const file = path.join(tmp, name + ".png");
    await page.screenshot({ path: file });
    return uri(file);
  };
  const setTheme = async (theme) => {
    await page.evaluate(
      (t) =>
        chrome.runtime.sendMessage({
          type: "MUTATE",
          action: { type: "SETTINGS", patch: { theme: t } },
        }),
      theme,
    );
    await page.waitForFunction(
      (t) => document.documentElement.dataset.theme === t,
      theme,
    );
    await page.waitForTimeout(150);
  };
  const shots = {};
  await setTheme("light");
  shots.light = await shot("light");
  await page.locator("#settings-btn").click();
  await page.waitForTimeout(250);
  shots.settings = await shot("settings");
  await page.locator("#settings-dialog [data-close]").click();
  for (const theme of ["dark", "ocean", "sunset", "midnight", "dracula"]) {
    await setTheme(theme);
    shots[theme] = await shot(theme);
  }
  await setTheme("rose");
  await page.locator("#compact-btn").click();
  await page.waitForFunction(() => document.body.classList.contains("compact"));
  await page.waitForTimeout(200);
  shots.compact = await shot("compact");
  await page.locator("#compact-btn").click();

  const stage = await context.newPage();
  const render = async (name, html, w, h) => {
    await stage.setViewportSize({ width: w, height: h });
    await stage.setContent(html);
    await stage.waitForTimeout(100);
    await stage.screenshot({ path: path.join(out, name) });
  };
  const S = (n, html) =>
    render(`screenshot-${n}-1280x800.png`, html, 1280, 800);
  await S(
    1,
    frame(
      "Mọi website quen thuộc,<br>ngay bên cạnh.",
      "Ghim, tìm kiếm và sắp xếp website vào bộ sưu tập trong thanh bên.",
      [shots.light],
      GREEN,
    ),
  );
  await S(
    2,
    frame(
      "Sáng hoặc tối,<br>tùy bạn chọn.",
      "Tự theo hệ thống, hoặc chọn giao diện bạn thích nhất.",
      [shots.light, shots.dark],
      PURPLE,
    ),
  );
  await S(
    3,
    frame(
      "16 giao diện màu",
      "Chọn theme chỉ với một cú chạm trong Cài đặt.",
      [shots.settings],
      NAVY,
    ),
  );
  await S(
    4,
    frameWide(
      "Hợp với phong cách của bạn",
      "Đại dương, Hoàng hôn, Nửa đêm, Dracula và nhiều hơn nữa.",
      [shots.ocean, shots.sunset, shots.midnight, shots.dracula],
      "linear-gradient(135deg,#2a2438,#1b3a5a)",
    ),
  );
  await S(
    5,
    frame(
      "Gọn như một thanh icon",
      "Chế độ chỉ biểu tượng giữ mọi website trong tầm mắt, không cần cuộn.",
      [shots.compact],
      "linear-gradient(135deg,#6b2036,#c2304f)",
    ),
  );
  await render(
    "promo-small-440x280.png",
    tile("Ghim, tìm, sắp xếp website"),
    440,
    280,
  );
  await render(
    "promo-marquee-1400x560.png",
    marquee(shots.light, shots.dark),
    1400,
    560,
  );
  await context.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("Store assets: " + out);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
