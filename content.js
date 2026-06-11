// Thanh sidebar nổi chèn vào trang web: hẹp khi rảnh, bung rộng khi hover.
// Chỉ chèn ở khung trên cùng (không chèn trong iframe, kể cả viewer của sidebar).
if (window.top === window.self) {
  let overlay = null;

  function faviconFor(url) {
    try {
      const host = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
    } catch {
      return "";
    }
  }

  const FALLBACK_ICON =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Crect width='24' height='24' rx='5' fill='%23888'/%3E%3C/svg%3E";

  function build(pins, settings) {
    remove();
    if (!settings.overlay) return;
    if (!pins || pins.length === 0) return;

    overlay = document.createElement("div");
    overlay.id = "pinned-sidebar-overlay";
    overlay.className =
      settings.overlaySide === "left" ? "psb-left" : "psb-right";

    const head = document.createElement("div");
    head.className = "psb-head";
    head.textContent = "Ghim";
    overlay.appendChild(head);

    const list = document.createElement("div");
    list.className = "psb-list";

    for (const pin of pins) {
      const item = document.createElement("a");
      item.className = "psb-item";
      item.href = pin.url;
      item.title = pin.title || pin.url;

      const img = document.createElement("img");
      img.src = faviconFor(pin.url);
      img.alt = "";
      img.onerror = () => (img.src = FALLBACK_ICON);

      const label = document.createElement("span");
      label.textContent = pin.title || pin.url;

      item.append(img, label);

      // Bấm thường: mở tab nền. Ctrl/Cmd hoặc chuột giữa: cũng tab mới.
      item.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(pin.url, "_blank");
      });

      list.appendChild(item);
    }

    overlay.appendChild(list);
    (document.body || document.documentElement).appendChild(overlay);
  }

  function remove() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  async function refresh() {
    const { pins = [], settings = {} } = await chrome.storage.sync.get([
      "pins",
      "settings"
    ]);
    build(pins, { overlay: true, overlaySide: "right", ...settings });
  }

  // Cập nhật khi dữ liệu/cài đặt thay đổi.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && (changes.pins || changes.settings)) refresh();
  });

  refresh();
}
