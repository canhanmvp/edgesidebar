// Mở side panel khi bấm vào icon extension trên thanh công cụ.
// Cho phép side panel mở mỗi khi click action.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("setPanelBehavior:", err));

// Khởi tạo dữ liệu mẫu lần đầu cài đặt.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install") return;
  const { pins } = await chrome.storage.sync.get("pins");
  if (!pins) {
    await chrome.storage.sync.set({
      pins: [
        { id: crypto.randomUUID(), title: "Google", url: "https://www.google.com" },
        { id: crypto.randomUUID(), title: "YouTube", url: "https://www.youtube.com" },
        { id: crypto.randomUUID(), title: "GitHub", url: "https://github.com" }
      ]
    });
  }
});
