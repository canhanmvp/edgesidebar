// Mở side panel khi bấm vào icon extension (cũng áp dụng cho phím tắt _execute_action).
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("setPanelBehavior:", err));

const SAMPLE_PINS = [
  { title: "Google", url: "https://www.google.com" },
  { title: "YouTube", url: "https://www.youtube.com" },
  { title: "GitHub", url: "https://github.com" }
];

function withId(p) {
  return { id: crypto.randomUUID(), folder: "", ...p };
}

// Tạo mục menu chuột phải để ghim trang đang xem.
function createMenu() {
  chrome.contextMenus.create(
    {
      id: "pin-to-sidebar",
      title: "Ghim trang này vào Pinned Sidebar",
      contexts: ["page", "link"]
    },
    () => void chrome.runtime.lastError // bỏ qua lỗi "đã tồn tại"
  );
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  createMenu();
  if (reason === "install") {
    const { pins } = await chrome.storage.sync.get("pins");
    if (!pins) {
      await chrome.storage.sync.set({ pins: SAMPLE_PINS.map(withId) });
    }
  }
});

chrome.runtime.onStartup.addListener(createMenu);

// Bấm menu chuột phải -> thêm pin.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "pin-to-sidebar") return;
  const url = info.linkUrl || info.pageUrl || (tab && tab.url);
  if (!url) return;
  let title = info.linkUrl ? info.selectionText : tab && tab.title;
  if (!title) {
    try {
      title = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      title = url;
    }
  }
  const { pins = [] } = await chrome.storage.sync.get("pins");
  pins.push(withId({ title, url }));
  await chrome.storage.sync.set({ pins });
});
