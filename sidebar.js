// ===== Tham chiếu DOM =====
const listEl = document.getElementById("pin-list");
const emptyEl = document.getElementById("empty");
const dialogEl = document.getElementById("dialog");
const dialogTitleEl = document.getElementById("dialog-title");
const fieldTitle = document.getElementById("field-title");
const fieldUrl = document.getElementById("field-url");
const fieldFolder = document.getElementById("field-folder");
const folderOptionsEl = document.getElementById("folder-options");

const searchBarEl = document.getElementById("search-bar");
const searchInputEl = document.getElementById("search-input");
const menuEl = document.getElementById("menu");
const importFileEl = document.getElementById("import-file");

const listViewEl = document.getElementById("list-view");
const viewerEl = document.getElementById("viewer");
const viewerFrame = document.getElementById("viewer-frame");
const viewerTitleEl = document.getElementById("viewer-title");

// ===== Trạng thái =====
let pins = [];
const DEFAULT_SETTINGS = {
  compact: false,
  collapsed: [],
  overlay: true,
  overlaySide: "right",
  overlayWidth: 220,
  theme: "system" // "system" | "light" | "dark"
};
let settings = { ...DEFAULT_SETTINGS };
const THEME_ORDER = ["system", "light", "dark"];
const THEME_LABEL = { system: "Tự động", light: "Sáng", dark: "Tối" };
let editingId = null; // null = thêm mới
let dragId = null;
let currentUrl = ""; // url đang xem trong viewer
let query = ""; // từ khóa tìm kiếm

// ===== Lưu trữ =====
async function loadAll() {
  const data = await chrome.storage.sync.get(["pins", "settings"]);
  pins = data.pins || [];
  settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  applySettings();
  render();
}

async function savePins() {
  await chrome.storage.sync.set({ pins });
}

async function saveSettings() {
  await chrome.storage.sync.set({ settings });
}

// ===== Tiện ích =====
function normalizeUrl(raw) {
  const url = (raw || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return "https://" + url;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconFor(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "";
  }
}

const FALLBACK_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' rx='4' fill='%23bbb'/%3E%3C/svg%3E";

// ===== Thông báo nổi (toast) =====
const toastWrap = document.getElementById("toast-wrap");
function toast(message, type = "", ms = 2600) {
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = message;
  toastWrap.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, ms);
}

// ===== Hộp thoại xác nhận (thay cho confirm() mặc định) =====
function confirmDialog({ message, okText = "Đồng ý", cancelText = "Hủy", danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "dialog";
    overlay.innerHTML = `
      <div class="dialog-box">
        <p class="dialog-msg"></p>
        <div class="dialog-actions">
          <button class="btn" data-act="cancel"></button>
          <button class="btn primary" data-act="ok"></button>
        </div>
      </div>`;
    overlay.querySelector(".dialog-msg").textContent = message;
    const okBtn = overlay.querySelector('[data-act="ok"]');
    const cancelBtn = overlay.querySelector('[data-act="cancel"]');
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;
    if (danger) okBtn.style.background = "var(--danger)";

    function close(result) {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(result);
    }
    function onKey(e) {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    }
    okBtn.addEventListener("click", () => close(true));
    cancelBtn.addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    okBtn.focus();
  });
}

// ===== Render =====
function applySettings() {
  document.body.classList.toggle("compact", settings.compact);
  applyTheme();
}

function applyTheme() {
  const theme = settings.theme || "system";
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  const tag = document.getElementById("theme-tag");
  if (tag) tag.textContent = THEME_LABEL[theme];
}

function matchesQuery(pin) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (pin.title || "").toLowerCase().includes(q) ||
    (pin.url || "").toLowerCase().includes(q)
  );
}

// Gom pin theo thư mục, giữ thứ tự xuất hiện trong mảng.
function groupPins(list) {
  const groups = new Map(); // folder -> pins[]
  for (const pin of list) {
    const key = pin.folder || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pin);
  }
  return groups;
}

function createPinEl(pin) {
  const li = document.createElement("li");
  li.className = "pin";
  li.draggable = true;
  li.dataset.id = pin.id;
  li.title = pin.title || pin.url;

  const img = document.createElement("img");
  img.src = faviconFor(pin.url);
  img.alt = "";
  img.onerror = () => (img.src = FALLBACK_ICON);

  const title = document.createElement("span");
  title.className = "title";
  title.textContent = pin.title || pin.url;

  const actions = document.createElement("span");
  actions.className = "actions";

  const editBtn = document.createElement("button");
  editBtn.className = "mini-btn";
  editBtn.title = "Sửa";
  editBtn.textContent = "✎";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openDialog(pin);
  });

  const delBtn = document.createElement("button");
  delBtn.className = "mini-btn danger";
  delBtn.title = "Xóa";
  delBtn.textContent = "🗑";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removePin(pin.id);
  });

  actions.append(editBtn, delBtn);
  li.append(img, title, actions);

  li.addEventListener("click", () => openViewer(pin));

  // Kéo thả sắp xếp.
  li.addEventListener("dragstart", () => {
    dragId = pin.id;
    li.classList.add("dragging");
  });
  li.addEventListener("dragend", () => {
    dragId = null;
    li.classList.remove("dragging");
  });
  li.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dragId || dragId === pin.id) return;
    reorder(dragId, pin.id);
  });

  return li;
}

function render() {
  listEl.innerHTML = "";
  const visible = pins.filter(matchesQuery);
  emptyEl.classList.toggle("hidden", visible.length > 0);

  const groups = groupPins(visible);

  for (const [folder, items] of groups) {
    if (folder) {
      const collapsed = settings.collapsed.includes(folder) && !query;
      const header = document.createElement("li");
      header.className = "folder-header" + (collapsed ? " collapsed" : "");
      header.innerHTML = `<span class="chevron">▾</span><span>${folder}</span>`;
      header.addEventListener("click", () => toggleFolder(folder));
      listEl.appendChild(header);
      if (collapsed) continue;
    }
    for (const pin of items) listEl.appendChild(createPinEl(pin));
  }

  refreshFolderOptions();
}

function refreshFolderOptions() {
  const names = [...new Set(pins.map((p) => p.folder).filter(Boolean))];
  folderOptionsEl.innerHTML = names
    .map((n) => `<option value="${n}"></option>`)
    .join("");
}

// ===== Thao tác dữ liệu =====
function reorder(fromId, toId) {
  const from = pins.findIndex((p) => p.id === fromId);
  const to = pins.findIndex((p) => p.id === toId);
  if (from < 0 || to < 0) return;
  // Kéo sang pin khác thư mục thì đổi luôn thư mục theo đích.
  const [moved] = pins.splice(from, 1);
  moved.folder = pins[to > from ? to - 1 : to]?.folder ?? moved.folder;
  pins.splice(to, 0, moved);
  render();
  savePins();
}

async function removePin(id) {
  const pin = pins.find((p) => p.id === id);
  if (!pin) return;
  const ok = await confirmDialog({
    message: `Xóa "${pin.title || pin.url}" khỏi danh sách ghim?`,
    okText: "Xóa",
    danger: true
  });
  if (!ok) return;
  pins = pins.filter((p) => p.id !== id);
  render();
  await savePins();
  toast("Đã xóa trang ghim", "success");
}

function toggleFolder(folder) {
  const i = settings.collapsed.indexOf(folder);
  if (i >= 0) settings.collapsed.splice(i, 1);
  else settings.collapsed.push(folder);
  render();
  saveSettings();
}

// ===== Dialog thêm/sửa =====
function openDialog(pin, prefillFolder = "") {
  editingId = pin ? pin.id : null;
  dialogTitleEl.textContent = pin ? "Sửa trang" : "Thêm trang";
  fieldTitle.value = pin ? pin.title : "";
  fieldUrl.value = pin ? pin.url : "";
  fieldFolder.value = pin ? pin.folder || "" : prefillFolder;
  refreshFolderOptions();
  dialogEl.classList.remove("hidden");
  fieldUrl.focus();
}

function closeDialog() {
  dialogEl.classList.add("hidden");
  editingId = null;
}

async function saveDialog() {
  const url = normalizeUrl(fieldUrl.value);
  if (!url) {
    fieldUrl.focus();
    return;
  }
  const title = fieldTitle.value.trim() || hostnameOf(url);
  const folder = fieldFolder.value.trim();

  if (editingId) {
    const pin = pins.find((p) => p.id === editingId);
    if (pin) Object.assign(pin, { title, url, folder });
  } else {
    pins.push({ id: crypto.randomUUID(), title, url, folder });
  }

  render();
  await savePins();
  closeDialog();
}

// ===== Ghim tab hiện tại =====
async function pinCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || /^(chrome|edge|about):/i.test(tab.url)) {
    openDialog(null);
    return;
  }
  pins.push({
    id: crypto.randomUUID(),
    title: tab.title || hostnameOf(tab.url),
    url: tab.url,
    folder: ""
  });
  render();
  await savePins();
}

// ===== Viewer =====
const viewerLoadingEl = document.getElementById("viewer-loading");
let viewerLoadTimer = null;

function showViewerLoading() {
  viewerLoadingEl.classList.remove("hidden");
  clearTimeout(viewerLoadTimer);
  // Phòng khi khung chéo nguồn không bắn sự kiện load — tự ẩn sau 8s.
  viewerLoadTimer = setTimeout(() => viewerLoadingEl.classList.add("hidden"), 8000);
}
viewerFrame.addEventListener("load", () => {
  // Khi src = about:blank (đóng viewer) thì không cần hiện spinner.
  if (viewerFrame.src && viewerFrame.src !== "about:blank") {
    clearTimeout(viewerLoadTimer);
    viewerLoadingEl.classList.add("hidden");
  }
});

function openViewer(pin) {
  currentUrl = pin.url;
  viewerTitleEl.textContent = pin.title || pin.url;
  showViewerLoading();
  viewerFrame.src = pin.url;
  listViewEl.classList.add("hidden");
  viewerEl.classList.remove("hidden");
}

function closeViewer() {
  viewerEl.classList.add("hidden");
  listViewEl.classList.remove("hidden");
  viewerFrame.src = "about:blank";
  currentUrl = "";
}

// ===== Nhập / Xuất =====
function exportPins() {
  const blob = new Blob([JSON.stringify({ pins }, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pinned-sidebar.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importPins() {
  importFileEl.value = "";
  importFileEl.click();
}

importFileEl.addEventListener("change", async () => {
  const file = importFileEl.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.pins;
    if (!Array.isArray(incoming)) throw new Error("Định dạng không hợp lệ");
    const cleaned = incoming
      .filter((p) => p && p.url)
      .map((p) => ({
        id: crypto.randomUUID(),
        title: (p.title || hostnameOf(p.url)).toString(),
        url: normalizeUrl(p.url),
        folder: (p.folder || "").toString()
      }));
    const replace = await confirmDialog({
      message: `Đã đọc ${cleaned.length} trang. Thay thế toàn bộ danh sách hiện tại, hay gộp thêm?`,
      okText: "Thay thế",
      cancelText: "Gộp thêm"
    });
    pins = replace ? cleaned : pins.concat(cleaned);
    render();
    await savePins();
    toast(`Đã nhập ${cleaned.length} trang`, "success");
  } catch (err) {
    toast("Không đọc được file: " + err.message, "error", 3600);
  }
});

// ===== Menu tùy chọn =====
function toggleMenu(force) {
  const show = force ?? menuEl.classList.contains("hidden");
  menuEl.classList.toggle("hidden", !show);
}

function newFolder() {
  const name = (prompt("Tên thư mục mới:") || "").trim();
  if (!name) return;
  openDialog(null, name);
}

async function toggleCompact() {
  settings.compact = !settings.compact;
  applySettings();
  await saveSettings();
}

async function toggleOverlay() {
  settings.overlay = !settings.overlay;
  await saveSettings();
  toast(
    "Thanh nổi trên trang: " +
      (settings.overlay ? "BẬT" : "TẮT") +
      " — tải lại trang để thấy thay đổi"
  );
}

async function toggleOverlaySide() {
  settings.overlaySide = settings.overlaySide === "left" ? "right" : "left";
  await saveSettings();
  toast("Thanh nổi: chuyển sang bên " + (settings.overlaySide === "left" ? "trái" : "phải"));
}

async function cycleTheme() {
  const i = THEME_ORDER.indexOf(settings.theme || "system");
  settings.theme = THEME_ORDER[(i + 1) % THEME_ORDER.length];
  applyTheme();
  await saveSettings();
  toast("Giao diện: " + THEME_LABEL[settings.theme]);
}

// ===== Gắn sự kiện =====
document.getElementById("add-btn").addEventListener("click", () => openDialog(null));
document.getElementById("pin-current-btn").addEventListener("click", pinCurrentTab);
document.getElementById("cancel-btn").addEventListener("click", closeDialog);
document.getElementById("save-btn").addEventListener("click", saveDialog);

document.getElementById("search-btn").addEventListener("click", () => {
  const hidden = searchBarEl.classList.toggle("hidden");
  if (!hidden) searchInputEl.focus();
  else {
    searchInputEl.value = "";
    query = "";
    render();
  }
});
searchInputEl.addEventListener("input", () => {
  query = searchInputEl.value;
  render();
});

document.getElementById("menu-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu();
});
document.getElementById("menu-pin-current").addEventListener("click", () => {
  toggleMenu(false);
  pinCurrentTab();
});
document.getElementById("menu-new-folder").addEventListener("click", () => {
  toggleMenu(false);
  newFolder();
});
document.getElementById("menu-compact").addEventListener("click", () => {
  toggleMenu(false);
  toggleCompact();
});
document.getElementById("menu-theme").addEventListener("click", (e) => {
  // Giữ menu mở để bấm đổi giao diện liên tục.
  e.stopPropagation();
  cycleTheme();
});
document.getElementById("menu-overlay").addEventListener("click", () => {
  toggleMenu(false);
  toggleOverlay();
});
document.getElementById("menu-overlay-side").addEventListener("click", () => {
  toggleMenu(false);
  toggleOverlaySide();
});
document.getElementById("menu-export").addEventListener("click", () => {
  toggleMenu(false);
  exportPins();
});
document.getElementById("menu-import").addEventListener("click", () => {
  toggleMenu(false);
  importPins();
});

// Bấm ra ngoài để đóng menu.
document.addEventListener("click", () => toggleMenu(false));
menuEl.addEventListener("click", (e) => e.stopPropagation());

// Viewer controls.
document.getElementById("back-btn").addEventListener("click", closeViewer);
document.getElementById("reload-btn").addEventListener("click", () => {
  if (currentUrl) {
    showViewerLoading();
    viewerFrame.src = currentUrl;
  }
});
document.getElementById("open-tab-btn").addEventListener("click", () => {
  if (currentUrl) chrome.tabs.create({ url: currentUrl });
});

dialogEl.addEventListener("click", (e) => {
  if (e.target === dialogEl) closeDialog();
});

document.addEventListener("keydown", (e) => {
  if (!dialogEl.classList.contains("hidden")) {
    if (e.key === "Escape") closeDialog();
    if (e.key === "Enter") saveDialog();
    return;
  }
  if (e.key === "Escape") {
    if (!menuEl.classList.contains("hidden")) toggleMenu(false);
    else if (!viewerEl.classList.contains("hidden")) closeViewer();
  }
});

// Đồng bộ khi dữ liệu đổi từ nơi khác (cửa sổ khác, menu chuột phải).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.pins) {
    pins = changes.pins.newValue || [];
    render();
  }
  if (changes.settings) {
    settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
    applySettings();
    render();
  }
});

loadAll();
