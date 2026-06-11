const listEl = document.getElementById("pin-list");
const emptyEl = document.getElementById("empty");
const dialogEl = document.getElementById("dialog");
const dialogTitleEl = document.getElementById("dialog-title");
const fieldTitle = document.getElementById("field-title");
const fieldUrl = document.getElementById("field-url");

let pins = [];
let editingId = null; // null = đang thêm mới
let dragId = null;

// --- Lưu trữ ---------------------------------------------------------------

async function loadPins() {
  const data = await chrome.storage.sync.get("pins");
  pins = data.pins || [];
  render();
}

async function savePins() {
  await chrome.storage.sync.set({ pins });
}

// --- Tiện ích --------------------------------------------------------------

// Chuẩn hóa URL: tự thêm https:// nếu thiếu giao thức.
function normalizeUrl(raw) {
  const url = raw.trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return "https://" + url;
}

// Lấy favicon qua dịch vụ của Google (ổn định, không cần permission thêm).
function faviconFor(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "";
  }
}

// --- Render ----------------------------------------------------------------

function render() {
  listEl.innerHTML = "";
  emptyEl.classList.toggle("hidden", pins.length > 0);

  for (const pin of pins) {
    const li = document.createElement("li");
    li.className = "pin";
    li.draggable = true;
    li.dataset.id = pin.id;

    const img = document.createElement("img");
    img.src = faviconFor(pin.url);
    img.alt = "";
    img.onerror = () => {
      img.src =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' rx='4' fill='%23bbb'/%3E%3C/svg%3E";
    };

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
    delBtn.className = "mini-btn";
    delBtn.title = "Xóa";
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePin(pin.id);
    });

    actions.append(editBtn, delBtn);
    li.append(img, title, actions);

    // Mở link trong tab mới khi bấm.
    li.addEventListener("click", () => {
      chrome.tabs.create({ url: pin.url });
    });

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

    listEl.appendChild(li);
  }
}

// --- Thao tác dữ liệu ------------------------------------------------------

function reorder(fromId, toId) {
  const from = pins.findIndex((p) => p.id === fromId);
  const to = pins.findIndex((p) => p.id === toId);
  if (from < 0 || to < 0) return;
  const [moved] = pins.splice(from, 1);
  pins.splice(to, 0, moved);
  render();
  savePins();
}

async function removePin(id) {
  pins = pins.filter((p) => p.id !== id);
  render();
  await savePins();
}

// --- Dialog ----------------------------------------------------------------

function openDialog(pin) {
  editingId = pin ? pin.id : null;
  dialogTitleEl.textContent = pin ? "Sửa trang" : "Thêm trang";
  fieldTitle.value = pin ? pin.title : "";
  fieldUrl.value = pin ? pin.url : "";
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
  let title = fieldTitle.value.trim();
  if (!title) {
    try {
      title = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      title = url;
    }
  }

  if (editingId) {
    const pin = pins.find((p) => p.id === editingId);
    if (pin) {
      pin.title = title;
      pin.url = url;
    }
  } else {
    pins.push({ id: crypto.randomUUID(), title, url });
  }

  render();
  await savePins();
  closeDialog();
}

// --- Sự kiện ---------------------------------------------------------------

document.getElementById("add-btn").addEventListener("click", () => openDialog(null));
document.getElementById("cancel-btn").addEventListener("click", closeDialog);
document.getElementById("save-btn").addEventListener("click", saveDialog);

dialogEl.addEventListener("click", (e) => {
  if (e.target === dialogEl) closeDialog();
});

document.addEventListener("keydown", (e) => {
  if (dialogEl.classList.contains("hidden")) return;
  if (e.key === "Escape") closeDialog();
  if (e.key === "Enter") saveDialog();
});

// Tự cập nhật khi dữ liệu đổi (vd: đồng bộ giữa các cửa sổ).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.pins) {
    pins = changes.pins.newValue || [];
    render();
  }
});

loadPins();
