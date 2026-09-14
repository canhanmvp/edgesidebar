"use strict";
const $ = (id) => document.getElementById(id);
const C = Pinned;
let state = null,
  syncStatus = {},
  embedOrigins = [],
  windowId,
  activeWorkspaceId = null,
  savedSessions = [];
const SESSIONS_KEY = "savedSessions";
let editingPin = null,
  editingFolder = null,
  editingWorkspace = null,
  currentPin = null,
  drag = null,
  viewerTimer;
let viewerLoadRequest = 0;
let viewerBlankRequest = 0;
let menuTrigger = null,
  queryTimer,
  latestViewNonce = "";
const initialFocus = new WeakMap();
const palettes = [
  ["#e5eee5", "#436b48"],
  ["#f6e9df", "#966042"],
  ["#e5eaf4", "#566e99"],
  ["#eee7f3", "#816095"],
  ["#f1eddc", "#867339"],
  ["#e0efed", "#397d76"],
];
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
function iconButton(icon, title, className = "icon-button") {
  const button = element("button", className);
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.append(makeIcon(icon));
  return button;
}
function isGoogleTranslate(pin) {
  return new URL(pin.url).origin === "https://translate.google.com";
}
function isFacebook(pin) {
  return [
    "facebook.com",
    "www.facebook.com",
    "m.facebook.com",
    "mbasic.facebook.com",
  ].includes(new URL(pin.url).hostname);
}
document
  .querySelectorAll("[data-icon]")
  .forEach((el) => el.append(makeIcon(el.dataset.icon)));
async function request(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...extra });
  if (!response?.ok)
    throw new Error(
      response?.error || "Không kết nối được extension. Hãy tải lại sidebar.",
    );
  return response;
}
function toast(message, { error = false, undo } = {}) {
  const item = element("div", "toast" + (error ? " error" : ""));
  item.append(element("span", "", message));
  if (undo) {
    const button = element("button", "", "Hoàn tác");
    button.onclick = () =>
      run(button, async () => {
        await undo();
        item.remove();
      });
    item.append(button);
  }
  $("toasts").append(item);
  setTimeout(() => item.remove(), undo ? 10000 : error ? 6500 : 3500);
}
async function run(button, work, errorEl) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  if (errorEl) errorEl.textContent = "";
  try {
    return await work();
  } catch (error) {
    if (errorEl) errorEl.textContent = error.message;
    else toast(error.message, { error: true });
  } finally {
    if (button) button.disabled = false;
  }
}
function accept(next) {
  if (!state || next.revision >= state.revision) {
    state = next;
    if (!state.workspaces?.length)
      state.workspaces = [
        { id: "workspace-default", name: "Mặc định", color: "#b5ef55" },
      ];
    if (!state.workspaces.some((item) => item.id === activeWorkspaceId))
      activeWorkspaceId =
        state.workspaces.find((item) => item.id === state.settings.workspaceId)
          ?.id || state.workspaces[0].id;
    applySettings();
    renderWorkspaces();
    renderSessions();
    render();
  }
}
async function mutate(action) {
  const data = await request("MUTATE", { action });
  accept(data.state);
  return data.state;
}
function showDialog(dialog) {
  closeMenu();
  initialFocus.set(dialog, document.activeElement);
  if (!dialog.open) dialog.showModal();
}
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog
    .querySelectorAll("[data-close]")
    .forEach((button) =>
      button.addEventListener("click", () => dialog.close("cancel")),
    );
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close("cancel");
  });
  dialog.addEventListener("close", () => {
    const prior = initialFocus.get(dialog);
    if (prior?.isConnected) prior.focus();
  });
});
function choose(title, message, options) {
  return new Promise((resolve) => {
    const dialog = $("choice-dialog");
    $("choice-title").textContent = title;
    $("choice-copy").textContent = message;
    $("choice-actions").replaceChildren();
    const cancel = element("button", "button", "Hủy");
    cancel.onclick = () => dialog.close("cancel");
    $("choice-actions").append(cancel);
    for (const option of options) {
      const button = element(
        "button",
        "button " + (option.danger ? "danger" : "primary"),
        option.label,
      );
      button.onclick = () => dialog.close(option.value);
      $("choice-actions").append(button);
    }
    dialog.returnValue = "cancel";
    const onCancel = () => {
      dialog.returnValue = "cancel";
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener(
      "close",
      () => {
        dialog.removeEventListener("cancel", onCancel);
        resolve(dialog.returnValue || "cancel");
      },
      { once: true },
    );
    showDialog(dialog);
    cancel.focus();
  });
}
function folded(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi");
}
function applySettings() {
  const s = state.settings;
  document.documentElement.dataset.theme = s.theme;
  document.body.classList.toggle("compact", s.compact);
  $("compact-btn").setAttribute("aria-pressed", String(s.compact));
  for (const key of [
    "theme",
    "openMode",
    "overlaySide",
    "compact",
    "overlay",
    "sync",
  ]) {
    const input = $("setting-" + key);
    if (input.type === "checkbox") input.checked = s[key];
    else input.value = s[key];
  }
  renderStatus();
}
function renderWorkspaces() {
  if (!state) return;
  const select = $("workspace-select");
  select.replaceChildren(
    ...state.workspaces.map((workspace) => {
      const option = new Option(workspace.name, workspace.id);
      option.style.color = workspace.color;
      return option;
    }),
  );
  select.value = activeWorkspaceId || state.workspaces[0]?.id || "";
  select.style.borderColor =
    state.workspaces.find((item) => item.id === select.value)?.color || "";
}
function cleanSessions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : C.uid(),
      name:
        typeof item.name === "string" && item.name.trim()
          ? item.name.trim().slice(0, 100)
          : "Phiên làm việc",
      workspaceId: typeof item.workspaceId === "string" ? item.workspaceId : "",
      createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      tabs: Array.isArray(item.tabs)
        ? item.tabs
            .filter((tab) => tab && typeof tab.url === "string")
            .map((tab) => {
              try {
                return {
                  title:
                    typeof tab.title === "string" && tab.title.trim()
                      ? tab.title.trim().slice(0, 180)
                      : C.host(C.url(tab.url)),
                  url: C.url(tab.url),
                  faviconUrl:
                    typeof tab.faviconUrl === "string"
                      ? tab.faviconUrl.slice(0, 2048)
                      : "",
                };
              } catch {
                return null;
              }
            })
            .filter(Boolean)
            .slice(0, 100)
        : [],
    }))
    .filter((item) => item.tabs.length)
    .slice(0, 20);
}
function renderSessions() {
  const list = $("session-list");
  if (!list) return;
  list.replaceChildren();
  const workspaceSessions = savedSessions.filter(
    (item) => !item.workspaceId || item.workspaceId === activeWorkspaceId,
  );
  if (!workspaceSessions.length) {
    list.append(
      element("p", "session-empty", "Lưu các tab đang mở để quay lại sau."),
    );
    return;
  }
  for (const session of workspaceSessions.slice(0, 4)) {
    const chip = element("div", "session-chip");
    const open = element("button", "session-open");
    open.type = "button";
    open.title = "Mở lại phiên này";
    open.setAttribute("aria-label", `Mở lại ${session.name}`);
    open.append(
      element("span", "session-chip-name", session.name),
      element("span", "session-chip-meta", `${session.tabs.length} tab`),
    );
    open.onclick = () =>
      run(open, async () => {
        for (const [index, tab] of session.tabs.entries())
          await chrome.tabs.create({
            url: tab.url,
            windowId,
            active: index === 0,
          });
        toast(`Đã mở ${session.tabs.length} tab từ phiên “${session.name}”.`);
      });
    const remove = iconButton(
      "close",
      `Xóa phiên ${session.name}`,
      "session-remove",
    );
    remove.onclick = () =>
      run(remove, async () => {
        savedSessions = savedSessions.filter((item) => item.id !== session.id);
        await chrome.storage.local.set({ [SESSIONS_KEY]: savedSessions });
        renderSessions();
        toast("Đã xóa phiên làm việc.");
      });
    chip.append(open, remove);
    list.append(chip);
  }
}
async function loadSessions() {
  const local = await chrome.storage.local.get(SESSIONS_KEY);
  savedSessions = cleanSessions(local[SESSIONS_KEY]);
  renderSessions();
}
async function saveCurrentSession() {
  const data = await request("GET_TABS", { windowId });
  const tabs = cleanSessions([{ tabs: data.tabs }])[0]?.tabs || [];
  if (!tabs.length) throw new Error("Không có tab website nào để lưu.");
  const workspace = state.workspaces.find(
    (item) => item.id === activeWorkspaceId,
  );
  const time = new Date().toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const session = {
    id: C.uid(),
    name: `${workspace?.name || "Mặc định"} · ${time}`,
    workspaceId: activeWorkspaceId,
    createdAt: Date.now(),
    tabs,
  };
  savedSessions = [session, ...savedSessions].slice(0, 20);
  await chrome.storage.local.set({ [SESSIONS_KEY]: savedSessions });
  renderSessions();
  toast(`Đã lưu ${tabs.length} tab thành một phiên.`);
}
function renderStatus() {
  if (!state) return;
  const warning = !!(syncStatus.message || syncStatus.conflict);
  $("storage-status").classList.toggle("warning", warning);
  $("storage-label").textContent = warning
    ? "Đã lưu trên máy · Kiểm tra đồng bộ"
    : !state.settings.sync
      ? "Đã lưu trên thiết bị"
      : syncStatus.dirty
        ? "Đã lưu · Chờ đồng bộ"
        : "Đã lưu · Đã gửi tới trình duyệt";
  $("sync-detail").textContent =
    syncStatus.message ||
    (syncStatus.conflict
      ? "Có thay đổi trên thiết bị khác."
      : !state.settings.sync
        ? "Đồng bộ tự động đang tắt."
        : syncStatus.dirty
          ? "Đã lưu trên máy. Gửi tới trình duyệt sau khoảng 30 giây ngừng chỉnh sửa."
          : syncStatus.syncedAt
            ? "Đã gửi tới bộ nhớ đồng bộ lúc " +
              new Date(syncStatus.syncedAt).toLocaleString("vi-VN") +
              ". Trình duyệt sẽ chuyển dữ liệu giữa các thiết bị."
            : "Chưa có bản đồng bộ.");
  $("sync-conflict").hidden = !syncStatus.conflict;
  $("sync-now").hidden = !!syncStatus.conflict;
}
function tile(pin) {
  const icon = element("span", "site-icon");
  const fallback = element(
    "span",
    "site-icon-fallback",
    Array.from(pin.title || C.host(pin.url))[0].toLocaleUpperCase("vi"),
  );
  const favicon = document.createElement("img");
  favicon.className = "site-favicon";
  favicon.alt = "";
  favicon.width = 24;
  favicon.height = 24;
  favicon.loading = "eager";
  favicon.referrerPolicy = "no-referrer";
  favicon.src =
    "https://www.google.com/s2/favicons?sz=64&domain_url=" +
    encodeURIComponent(new URL(C.url(pin.url)).origin);
  favicon.addEventListener("load", () => icon.classList.add("has-favicon"));
  favicon.addEventListener("error", () => favicon.remove());
  const number = Array.from(C.host(pin.url)).reduce(
    (n, char) => n + char.codePointAt(0),
    0,
  );
  const [bg, fg] = palettes[number % palettes.length];
  icon.style.setProperty("--tile-bg", bg);
  icon.style.setProperty("--tile-fg", fg);
  icon.setAttribute("aria-hidden", "true");
  icon.append(fallback, favicon);
  return icon;
}
function render() {
  if (!state) return;
  const activeId = document.activeElement?.closest("[data-pin]")?.dataset.pin;
  const focusPart = document.activeElement?.classList.contains("row-more")
    ? ".row-more"
    : ".pin-link";
  const query = folded($("search").value.trim());
  const fragment = document.createDocumentFragment();
  let visibleCount = 0;
  const workspaceId = activeWorkspaceId || state.workspaces[0]?.id;
  const groups = [
    { id: "", name: "Chưa phân nhóm" },
    ...state.folders.filter((folder) => folder.workspaceId === workspaceId),
  ];
  for (const folder of groups) {
    const all = state.pins.filter(
      (p) => p.workspaceId === workspaceId && p.folderId === folder.id,
    );
    const matching = all.filter(
      (p) =>
        !query ||
        folded(
          p.title +
            " " +
            p.url +
            " " +
            folder.name +
            " " +
            (p.tags || []).join(" ") +
            " " +
            (p.note || ""),
        ).includes(query),
    );
    if ((!folder.id && !all.length) || (query && !matching.length)) continue;
    visibleCount += matching.length;
    const group = element("section", "group");
    group.dataset.folder = folder.id;
    const heading = element("div", "group-heading");
    const collapsed = !query && state.settings.collapsed.includes(folder.id);
    const toggle = element("button", "folder-toggle");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute(
      "aria-label",
      (collapsed ? "Mở " : "Thu gọn ") + folder.name,
    );
    const chevron = makeIcon("chevron");
    chevron.classList.add("chevron");
    toggle.append(
      chevron,
      makeIcon("folder"),
      element("span", "folder-name", folder.name),
      element("span", "group-count", matching.length),
    );
    toggle.onclick = () =>
      run(toggle, () => mutate({ type: "TOGGLE_FOLDER", id: folder.id }));
    if (folder.id) {
      const grip = element("span", "collection-grip");
      // Chromium only guarantees native dragstart on the element that is
      // marked draggable. Keeping it on the grip prevents the folder header
      // and its website links from swallowing the gesture in Edge.
      grip.draggable = !query;
      grip.title = "Kéo để sắp xếp bộ sưu tập";
      grip.setAttribute("role", "img");
      grip.setAttribute("aria-label", "Kéo để sắp xếp bộ sưu tập");
      grip.append(makeIcon("grip"));
      heading.append(grip);
    }
    heading.append(toggle);
    if (folder.id) {
      const more = iconButton("more", "Quản lý thư mục " + folder.name);
      more.setAttribute("aria-haspopup", "menu");
      more.onclick = (event) => {
        event.stopPropagation();
        folderMenu(folder, more);
      };
      heading.append(more);
    }
    group.append(heading);
    if (!collapsed) {
      if (!matching.length)
        group.append(
          element(
            "p",
            "group-empty",
            "Thả website vào đây hoặc thêm trang mới",
          ),
        );
      else {
        const ul = element("ul", "group-pins");
        for (const pin of matching) {
          const row = element("li", "pin-row");
          row.dataset.pin = pin.id;
          row.draggable = !query;
          const link = element("a", "pin-link");
          link.href = pin.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.title = pin.title + "\n" + pin.url;
          link.setAttribute(
            "aria-label",
            pin.title +
              " — " +
              (state.settings.openMode === "sidebar"
                ? "Mở trong sidebar"
                : "Mở tab mới"),
          );
          const copy = element("span", "site-copy");
          copy.append(
            element("span", "site-title", pin.title),
            element("span", "site-domain", C.host(pin.url)),
          );
          if (pin.favorite) copy.append(element("span", "favorite-mark", "★"));
          link.append(tile(pin), copy);
          link.onclick = (event) => {
            event.preventDefault();
            run(null, () =>
              openPin(
                pin,
                event.ctrlKey || event.metaKey || event.shiftKey
                  ? "tab"
                  : state.settings.openMode,
                event.ctrlKey || event.metaKey,
              ),
            );
          };
          link.addEventListener("auxclick", (event) => {
            if (event.button === 1) {
              event.preventDefault();
              run(null, () => openPin(pin, "tab", true));
            }
          });
          link.addEventListener("keydown", (event) => {
            if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
              event.preventDefault();
              run(null, () => movePin(pin, event.key === "ArrowUp" ? -1 : 1));
            }
          });
          const more = iconButton(
            "more",
            "Tùy chọn " + pin.title,
            "icon-button row-more",
          );
          more.setAttribute("aria-haspopup", "menu");
          more.onclick = (event) => {
            event.stopPropagation();
            pinMenu(pin, more);
          };
          row.append(link, more);
          ul.append(row);
        }
        group.append(ul);
      }
    }
    fragment.append(group);
  }
  $("pin-list").replaceChildren(fragment);
  const workspacePins = state.pins.filter(
    (pin) => pin.workspaceId === workspaceId,
  );
  $("pin-count").textContent = query
    ? `${visibleCount}/${workspacePins.length}`
    : workspacePins.length;
  $("empty-state").hidden = query
    ? visibleCount > 0
    : workspacePins.length > 0 ||
      state.folders.some((folder) => folder.workspaceId === workspaceId);
  $("empty-title").textContent = query
    ? "Chưa tìm thấy trang phù hợp"
    : "Một góc mới cho bạn";
  $("empty-copy").textContent = query
    ? "Thử tên website, tên miền hoặc tên thư mục khác."
    : "Ghim trang đang xem hoặc thêm website đầu tiên.";
  $("empty-action").textContent = query ? "Xóa tìm kiếm" : "Thêm website";
  $("list-hint").hidden = !workspacePins.length || !!query;
  if (activeId)
    [...document.querySelectorAll("[data-pin]")]
      .find((el) => el.dataset.pin === activeId)
      ?.querySelector(focusPart)
      ?.focus();
}
function closeMenu(restore = false) {
  $("item-menu").hidden = true;
  if (restore && menuTrigger?.isConnected) menuTrigger.focus();
}
function showMenu(trigger, entries) {
  const menu = $("item-menu");
  menu.replaceChildren();
  menuTrigger = trigger;
  for (const entry of entries) {
    if (!entry) {
      menu.append(element("hr"));
      continue;
    }
    const button = element("button", entry.danger ? "danger" : "", entry.label);
    button.prepend(makeIcon(entry.icon));
    button.setAttribute("role", "menuitem");
    button.onclick = () => {
      closeMenu(true);
      run(null, entry.action);
    };
    menu.append(button);
  }
  menu.hidden = false;
  const rect = trigger.getBoundingClientRect();
  menu.style.left =
    Math.max(
      8,
      Math.min(
        innerWidth - menu.offsetWidth - 8,
        rect.right - menu.offsetWidth,
      ),
    ) + "px";
  menu.style.top =
    Math.max(
      8,
      Math.min(innerHeight - menu.offsetHeight - 8, rect.bottom + 5),
    ) + "px";
  menu.querySelector("button")?.focus();
}
function pinMenu(pin, trigger) {
  showMenu(trigger, [
    {
      label: "Mở trong sidebar",
      icon: "panel",
      action: () => openPin(pin, "sidebar"),
    },
    {
      label: "Mở tab mới",
      icon: "external",
      action: () => openPin(pin, "tab"),
    },
    null,
    {
      label: "Sửa / chuyển thư mục",
      icon: "edit",
      action: () => pinDialog(pin),
    },
    {
      label: pin.favorite ? "Bỏ yêu thích" : "Đánh dấu yêu thích",
      icon: "star",
      action: () => toggleFavorite(pin),
    },
    { label: "Đưa lên trên", icon: "up", action: () => movePin(pin, -1) },
    { label: "Đưa xuống dưới", icon: "down", action: () => movePin(pin, 1) },
    null,
    {
      label: "Bỏ ghim",
      icon: "trash",
      danger: true,
      action: () => deletePin(pin),
    },
  ]);
}
function folderMenu(folder, trigger) {
  showMenu(trigger, [
    {
      label: "Thêm website vào đây",
      icon: "plus",
      action: () => pinDialog(null, folder.id),
    },
    {
      label: "Đổi tên thư mục",
      icon: "edit",
      action: () => folderDialog(folder),
    },
    {
      label: "Đưa bộ sưu tập lên trên",
      icon: "up",
      action: () => moveFolder(folder, -1),
    },
    {
      label: "Đưa bộ sưu tập xuống dưới",
      icon: "down",
      action: () => moveFolder(folder, 1),
    },
    null,
    {
      label: "Xóa thư mục",
      icon: "trash",
      danger: true,
      action: async () => {
        const result = await choose(
          "Xóa thư mục?",
          `Các website trong “${folder.name}” sẽ chuyển về Chưa phân nhóm.`,
          [{ label: "Xóa thư mục", value: "delete", danger: true }],
        );
        if (result === "delete") {
          await mutate({ type: "DELETE_FOLDER", id: folder.id });
          toast("Đã xóa thư mục, giữ lại các website.");
        }
      },
    },
  ]);
}
async function movePin(pin, direction) {
  const peers = state.pins.filter((p) => p.folderId === pin.folderId);
  const index = peers.findIndex((p) => p.id === pin.id);
  if (index + direction < 0 || index + direction >= peers.length) return;
  await mutate({
    type: "REORDER",
    id: pin.id,
    folderId: pin.folderId,
    beforeId: direction < 0 ? peers[index - 1].id : peers[index + 2]?.id || "",
  });
}
async function toggleFavorite(pin) {
  await mutate({
    type: "SAVE_PIN",
    id: pin.id,
    url: pin.url,
    title: pin.title,
    folderId: pin.folderId,
    workspaceId: pin.workspaceId,
    tags: pin.tags,
    note: pin.note,
    favorite: !pin.favorite,
  });
  toast(pin.favorite ? "Đã bỏ yêu thích." : "Đã thêm vào yêu thích.");
}
async function moveFolder(folder, direction) {
  const peers = state.folders.filter(
    (item) => item.workspaceId === folder.workspaceId,
  );
  const index = peers.findIndex((item) => item.id === folder.id);
  if (index < 0 || index + direction < 0 || index + direction >= peers.length)
    return;
  const previousOrder = state.folders.map((item) => item.id);
  await mutate({
    type: "REORDER_FOLDER",
    id: folder.id,
    beforeId: direction < 0 ? peers[index - 1].id : peers[index + 2]?.id || "",
    workspaceId: folder.workspaceId,
  });
  toast(`Đã sắp xếp bộ sưu tập “${folder.name}”.`, {
    undo: () => mutate({ type: "SET_FOLDER_ORDER", ids: previousOrder }),
  });
}
async function deletePin(pin) {
  const index = state.pins.findIndex((p) => p.id === pin.id);
  await mutate({ type: "DELETE_PIN", id: pin.id });
  toast(`Đã bỏ ghim ${pin.title}`, {
    undo: () => mutate({ type: "RESTORE_PIN", pin, index }),
  });
}
function pinDialog(pin = null, folderId = "") {
  if (!state) return;
  editingPin = pin?.id || null;
  $("pin-dialog-title").textContent = pin ? "Sửa website" : "Thêm website";
  $("pin-url").value = pin?.url || "";
  $("pin-title").value = pin?.title || "";
  $("pin-tags").value = (pin?.tags || []).join(", ");
  $("pin-note").value = pin?.note || "";
  $("pin-favorite").checked = pin?.favorite === true;
  $("pin-folder").replaceChildren(
    new Option("Chưa phân nhóm", ""),
    ...state.folders
      .filter(
        (f) => f.workspaceId === (activeWorkspaceId || state.workspaces[0]?.id),
      )
      .map((f) => new Option(f.name, f.id)),
  );
  $("pin-folder").value = pin?.folderId || folderId;
  $("pin-error").textContent = "";
  showDialog($("pin-dialog"));
  $("pin-url").focus();
}
function folderDialog(folder = null) {
  editingFolder = folder?.id || null;
  $("folder-name").value = folder?.name || "";
  $("folder-dialog-title").textContent = folder
    ? "Đổi tên thư mục"
    : "Thư mục mới";
  $("folder-error").textContent = "";
  showDialog($("folder-dialog"));
  $("folder-name").focus();
}
function workspaceDialog(workspace = null) {
  editingWorkspace = workspace?.id || null;
  $("workspace-dialog-title").textContent = workspace
    ? "Đổi tên không gian"
    : "Không gian mới";
  $("workspace-name").value = workspace?.name || "";
  $("workspace-color").value = workspace?.color || "#b5ef55";
  $("workspace-error").textContent = "";
  showDialog($("workspace-dialog"));
  $("workspace-name").focus();
}
$("pin-form").onsubmit = (event) => {
  event.preventDefault();
  run(
    $("pin-save"),
    async () => {
      await mutate({
        type: "SAVE_PIN",
        id: editingPin,
        url: $("pin-url").value,
        title: $("pin-title").value,
        folderId: $("pin-folder").value,
        workspaceId: editingPin
          ? state.pins.find((pin) => pin.id === editingPin)?.workspaceId
          : activeWorkspaceId,
        tags: $("pin-tags").value.split(","),
        note: $("pin-note").value,
        favorite: $("pin-favorite").checked,
      });
      $("pin-dialog").close();
      toast("Đã lưu website.");
    },
    $("pin-error"),
  );
};
$("folder-form").onsubmit = (event) => {
  event.preventDefault();
  run(
    event.submitter,
    async () => {
      await mutate({
        type: "SAVE_FOLDER",
        id: editingFolder,
        name: $("folder-name").value,
        workspaceId: activeWorkspaceId,
      });
      $("folder-dialog").close();
      toast("Đã lưu thư mục.");
    },
    $("folder-error"),
  );
};
$("workspace-form").onsubmit = (event) => {
  event.preventDefault();
  run(
    event.submitter,
    async () => {
      const workspaceId = C.uid();
      await mutate({
        type: "SAVE_WORKSPACE",
        id: editingWorkspace,
        workspaceId: editingWorkspace || workspaceId,
        name: $("workspace-name").value,
        color: $("workspace-color").value,
      });
      if (!editingWorkspace) activeWorkspaceId = workspaceId;
      await chrome.storage.local.set({ activeWorkspaceId });
      $("workspace-dialog").close();
      renderWorkspaces();
      renderSessions();
      render();
      toast(
        editingWorkspace ? "Đã cập nhật không gian." : "Đã tạo không gian mới.",
      );
    },
    $("workspace-error"),
  );
};
function clearDrop() {
  document
    .querySelectorAll(
      ".drop-before,.drop-target,.collection-drop-before,.collection-drop-after",
    )
    .forEach((el) =>
      el.classList.remove(
        "drop-before",
        "drop-target",
        "collection-drop-before",
        "collection-drop-after",
      ),
    );
}
$("pin-list").addEventListener("dragstart", (event) => {
  const row = event.target.closest("[data-pin]");
  if (row && !$("search").value.trim()) {
    drag = { type: "pin", id: row.dataset.pin };
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "pin:" + drag.id);
    closeMenu();
    return;
  }
  const group = event.target.closest(".group[data-folder]");
  if (
    !group?.dataset.folder ||
    $("search").value.trim() ||
    !event.target.closest(".collection-grip")
  ) {
    event.preventDefault();
    return;
  }
  drag = { type: "folder", id: group.dataset.folder };
  group.classList.add("collection-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", "folder:" + drag.id);
  closeMenu();
});
$("pin-list").addEventListener("dragover", (event) => {
  if (!drag) return;
  const group = event.target.closest("[data-folder]");
  if (!group) return;
  if (drag.type === "folder") {
    if (!group.dataset.folder || group.dataset.folder === drag.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    clearDrop();
    const bounds = group.getBoundingClientRect();
    group.classList.add(
      event.clientY < bounds.top + bounds.height / 2
        ? "collection-drop-before"
        : "collection-drop-after",
    );
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  clearDrop();
  const row = event.target.closest("[data-pin]");
  if (row && row.dataset.pin !== drag.id) row.classList.add("drop-before");
  else group.classList.add("drop-target");
});
$("pin-list").addEventListener("drop", (event) => {
  if (!drag) return;
  event.preventDefault();
  const group = event.target.closest("[data-folder]");
  const currentDrag = drag;
  drag = null;
  clearDrop();
  if (currentDrag.type === "folder") {
    if (!group?.dataset.folder || group.dataset.folder === currentDrag.id)
      return;
    const bounds = group.getBoundingClientRect();
    const peers = state.folders.filter(
      (item) => item.workspaceId === activeWorkspaceId,
    );
    const targetIndex = peers.findIndex(
      (item) => item.id === group.dataset.folder,
    );
    const beforeId =
      event.clientY < bounds.top + bounds.height / 2
        ? group.dataset.folder
        : peers[targetIndex + 1]?.id || "";
    const folder = state.folders.find((item) => item.id === currentDrag.id);
    const previousOrder = state.folders.map((item) => item.id);
    if (!folder) return;
    run(null, async () => {
      await mutate({
        type: "REORDER_FOLDER",
        id: currentDrag.id,
        beforeId,
        workspaceId: activeWorkspaceId,
      });
      toast(`Đã sắp xếp bộ sưu tập “${folder.name}”.`, {
        undo: () => mutate({ type: "SET_FOLDER_ORDER", ids: previousOrder }),
      });
    });
  } else if (group)
    run(null, () =>
      mutate({
        type: "REORDER",
        id: currentDrag.id,
        folderId: group.dataset.folder,
        beforeId: event.target.closest("[data-pin]")?.dataset.pin || "",
      }),
    );
});
$("pin-list").addEventListener("dragend", () => {
  drag = null;
  clearDrop();
  document
    .querySelectorAll(".dragging,.collection-dragging")
    .forEach((el) => el.classList.remove("dragging", "collection-dragging"));
});
async function openPin(pin, mode, background = false) {
  if (mode === "tab") {
    await chrome.tabs.create({
      url: C.url(pin.url),
      active: !background,
      windowId,
    });
    return;
  }
  closeMenu();
  currentPin = pin;
  $("viewer-title").textContent = pin.title;
  $("viewer-host").textContent = C.host(pin.url);
  $("viewer-frame").title = pin.title;
  $("list-view").hidden = true;
  $("viewer").hidden = false;
  document.body.classList.add("viewing");
  if (isGoogleTranslate(pin)) {
    openTranslator();
    $("viewer-back").focus();
    return;
  }
  closeTranslator();
  $("load-line").hidden = false;
  $("viewer-status").textContent = "Đang tự mở khóa website…";
  $("viewer-back").focus();
  const origin = new URL(pin.url).origin;
  if (!isFacebook(pin) && !embedOrigins.includes(origin)) {
    await request("EMBED", { origin, enabled: true });
    embedOrigins = [...new Set([...embedOrigins, origin])];
    renderEmbeds();
  }
  if (currentPin?.id === pin.id) resetFrame();
}
function openTranslator() {
  clearTimeout(viewerTimer);
  $("viewer-frame").hidden = true;
  $("translator").hidden = false;
  $("load-line").hidden = true;
  $("viewer-reset").hidden = true;
  $("viewer-status").textContent = "Dịch nhanh trong sidebar.";
  $("translator-input").focus();
}
function closeTranslator() {
  $("translator").hidden = true;
  $("viewer-frame").hidden = false;
  $("viewer-reset").hidden = false;
}
async function translateText() {
  const text = $("translator-input").value.trim();
  if (!text) throw new Error("Hãy nhập văn bản cần dịch.");
  const target = $("translator-target").value;
  const source = $("translator-source").value;
  $("translator-status").textContent = "Đang dịch…";
  $("translator-output").hidden = true;
  const query = new URLSearchParams({
    client: "gtx",
    sl: source,
    tl: target,
    dt: "t",
    q: text,
  });
  const response = await fetch(
    "https://translate.googleapis.com/translate_a/single?" + query,
  );
  if (!response.ok) throw new Error("Không thể dịch lúc này. Hãy thử lại.");
  const data = await response.json();
  const output = data?.[0]
    ?.map((part) => part?.[0])
    .filter(Boolean)
    .join("");
  if (!output) throw new Error("Không nhận được bản dịch. Hãy thử lại.");
  $("translator-output").textContent = output;
  $("translator-output").hidden = false;
  $("translator-status").textContent =
    source === "auto" && data?.[2]
      ? "Đã nhận diện: " + data[2] + "."
      : "Đã dịch xong.";
}
function resetFrame() {
  if (!currentPin) return;
  const loadRequest = ++viewerLoadRequest;
  const origin = new URL(currentPin.url).origin;
  const embedEnabled = embedOrigins.includes(origin);
  $("load-line").hidden = false;
  $("viewer-status").textContent = embedEnabled
    ? "Đang mở với quyền nhúng riêng cho website này…"
    : "Đang tải lại website…";
  clearTimeout(viewerTimer);
  // Reassigning the same URL after adding a DNR rule can leave Chromium on its
  // cached iframe error page. A srcdoc page always creates a new document,
  // unlike about:blank, then we navigate from that clean document to the pin.
  const frame = $("viewer-frame");
  if (isFacebook(currentPin)) {
    frame.removeAttribute("src");
    frame.srcdoc =
      "<!doctype html><meta charset=utf-8><style>body{margin:0;padding:32px;font:16px/1.6 system-ui,sans-serif;color:#223;background:#fff}strong{display:block;font-size:20px;margin-bottom:10px}</style><strong>Facebook không cho hiển thị trong sidebar.</strong>Facebook trả lỗi từ máy chủ khi phát hiện khung nhúng. Bấm biểu tượng mở tab ở góc trên bên phải để dùng Facebook bình thường.";
    $("load-line").hidden = true;
    $("viewer-status").textContent =
      "Facebook chỉ mở được trong tab chính của trình duyệt.";
    return;
  }
  viewerBlankRequest = loadRequest;
  frame.addEventListener(
    "load",
    () => {
      if (loadRequest !== viewerLoadRequest || !currentPin) return;
      viewerBlankRequest = 0;
      frame.removeAttribute("srcdoc");
      frame.src = C.url(currentPin.url);
      viewerTimer = setTimeout(() => {
        $("load-line").hidden = true;
        $("viewer-status").textContent = embedEnabled
          ? "Nếu vẫn bị chặn, website này cần mở trong tab mới."
          : "Website này cần mở trong tab mới.";
      }, 5000);
    },
    { once: true },
  );
  frame.srcdoc = "<!doctype html><title>Loading</title>";
}
$("viewer-frame").addEventListener("load", () => {
  if (!currentPin) return;
  if (viewerBlankRequest === viewerLoadRequest) return;
  clearTimeout(viewerTimer);
  $("load-line").hidden = true;
  // A cross-origin iframe loads for its browser error page too, so this is not
  // proof that the website actually rendered.
  const embedEnabled = embedOrigins.includes(new URL(currentPin.url).origin);
  $("viewer-status").textContent = embedEnabled
    ? "Đang hiển thị trong sidebar…"
    : "Website này cần mở trong tab mới.";
});
function closeViewer() {
  currentPin = null;
  viewerLoadRequest++;
  viewerBlankRequest = 0;
  clearTimeout(viewerTimer);
  closeTranslator();
  $("viewer-frame").src = "about:blank";
  if (windowId != null)
    chrome.storage.session.remove("viewer." + windowId).catch(() => {});
  $("viewer").hidden = true;
  $("list-view").hidden = false;
  document.body.classList.remove("viewing");
  $("search").focus();
}
$("viewer-back").onclick = closeViewer;
$("home-btn").onclick = (event) => {
  event.preventDefault();
  closeViewer();
};
$("viewer-reset").onclick = resetFrame;
$("viewer-tab").onclick = () =>
  run($("viewer-tab"), () => currentPin && openPin(currentPin, "tab"));
$("translator-run").onclick = () =>
  run($("translator-run"), translateText, $("translator-status"));
$("translator-input").addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    run($("translator-run"), translateText, $("translator-status"));
  }
});
function renderEmbeds() {
  $("embed-list").replaceChildren();
  if (!embedOrigins.length) {
    $("embed-list").append(
      element("p", "subtle", "Chưa cho phép website nào."),
    );
    return;
  }
  for (const origin of embedOrigins) {
    const row = element("div", "embed-row");
    row.append(element("span", "", origin));
    const button = iconButton("close", "Thu hồi " + origin);
    button.onclick = () =>
      run(button, async () => {
        await request("EMBED", { origin, enabled: false });
        embedOrigins = embedOrigins.filter((o) => o !== origin);
        renderEmbeds();
        if (currentPin && new URL(currentPin.url).origin === origin)
          resetFrame();
        toast("Đã thu hồi quyền nhúng.");
      });
    row.append(button);
    $("embed-list").append(row);
  }
}
function settingsDialog() {
  if (!state) return;
  applySettings();
  renderEmbeds();
  showDialog($("settings-dialog"));
}
$("settings-btn").onclick = settingsDialog;
$("storage-status").onclick = settingsDialog;
for (const key of [
  "theme",
  "openMode",
  "overlaySide",
  "compact",
  "overlay",
  "sync",
]) {
  const input = $("setting-" + key);
  input.onchange = () =>
    run(input, async () => {
      const value = input.type === "checkbox" ? input.checked : input.value;
      try {
        await mutate({
          type: "SETTINGS",
          patch:
            key === "overlaySide"
              ? { overlaySide: value, overlayX: null }
              : { [key]: value },
        });
      } finally {
        applySettings();
      }
    });
}
$("workspace-select").onchange = async () => {
  activeWorkspaceId = $("workspace-select").value;
  await chrome.storage.local.set({ activeWorkspaceId });
  renderWorkspaces();
  renderSessions();
  render();
};
$("add-workspace").onclick = () => workspaceDialog();
$("workspace-more").onclick = (event) => {
  event.stopPropagation();
  const workspace = state?.workspaces.find(
    (item) => item.id === activeWorkspaceId,
  );
  if (!workspace) return;
  showMenu(event.currentTarget, [
    {
      label: "Đổi tên không gian",
      icon: "edit",
      action: () => workspaceDialog(workspace),
    },
    {
      label: "Xóa không gian",
      icon: "trash",
      danger: true,
      action: async () => {
        const result = await choose(
          "Xóa không gian?",
          `Xóa “${workspace.name}” sẽ xóa các thư mục và website bên trong. Hãy xuất bản sao trước nếu cần.`,
          [{ label: "Xóa không gian", value: "delete", danger: true }],
        );
        if (result !== "delete") return;
        await mutate({ type: "DELETE_WORKSPACE", id: workspace.id });
        activeWorkspaceId = state.settings.workspaceId;
        await chrome.storage.local.set({ activeWorkspaceId });
        renderWorkspaces();
        renderSessions();
        render();
        toast("Đã xóa không gian và dữ liệu bên trong.");
      },
    },
  ]);
};
$("save-session").onclick = () => run($("save-session"), saveCurrentSession);
$("compact-btn").onclick = () =>
  state &&
  run($("compact-btn"), () =>
    mutate({ type: "SETTINGS", patch: { compact: !state.settings.compact } }),
  );
$("sync-now").onclick = () =>
  run($("sync-now"), async () => {
    await request("SYNC_NOW");
    toast("Đã gửi dữ liệu tới bộ nhớ đồng bộ của trình duyệt.");
  });
for (const choice of ["local", "remote"])
  $("sync-" + choice).onclick = () =>
    run($("sync-" + choice), async () => {
      const result = await choose(
        "Chọn bản dữ liệu",
        choice === "local"
          ? "Gửi danh sách trên máy này lên tài khoản? Bản tài khoản hiện tại sẽ được lưu dự phòng."
          : "Thay danh sách trên máy bằng bản tài khoản? Danh sách hiện tại sẽ được lưu dự phòng.",
        [{ label: "Tiếp tục", value: "confirm" }],
      );
      if (result === "confirm") {
        await request("RESOLVE_SYNC", { choice });
        await reloadState();
        toast("Đã xử lý xung đột đồng bộ.");
      }
    });
function download(data, name = "pinned-sidebar") {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = element("a");
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export-btn").onclick = () => {
  if (state)
    download({
      schema: 3,
      exportedAt: new Date().toISOString(),
      workspaces: state.workspaces,
      pins: state.pins,
      folders: state.folders,
    });
};
$("export-sessions-btn").onclick = () => {
  if (savedSessions.length)
    download(
      {
        schema: 1,
        type: "pinned-sidebar-sessions",
        exportedAt: new Date().toISOString(),
        sessions: savedSessions,
      },
      "pinned-sessions",
    );
  else toast("Chưa có phiên tab để xuất.", { error: true });
};
$("recovery-export").onclick = () =>
  run($("recovery-export"), async () => {
    const data = await chrome.storage.local.get([
      "recoveryBackup",
      "importBackup",
      "conflictBackup",
      "legacyBackup",
      "workspaceBackup",
    ]);
    const candidates = [
      data.importBackup,
      data.conflictBackup,
      data.workspaceBackup,
    ]
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const backup =
      data.recoveryBackup?.data || candidates[0] || data.legacyBackup;
    if (!backup)
      throw new Error(
        "Chưa có bản dự phòng. Bạn có thể xuất danh sách hiện tại.",
      );
    download(backup, "pinned-recovery");
  });
$("import-btn").onclick = () => {
  $("settings-dialog").close();
  $("import-file").value = "";
  $("import-file").click();
};
$("import-sessions-btn").onclick = () => {
  $("settings-dialog").close();
  $("import-sessions-file").value = "";
  $("import-sessions-file").click();
};
$("import-sessions-file").onchange = () =>
  run(null, async () => {
    const file = $("import-sessions-file").files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024)
      throw new Error("File quá lớn. Giới hạn 20 MB.");
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error("File không phải JSON hợp lệ.");
    }
    const incoming = cleanSessions(Array.isArray(data) ? data : data?.sessions);
    if (!incoming.length) throw new Error("File chưa có phiên tab hợp lệ.");
    const mapped = incoming.map((session) => ({
      ...session,
      workspaceId: state.workspaces.some(
        (workspace) => workspace.id === session.workspaceId,
      )
        ? session.workspaceId
        : activeWorkspaceId,
    }));
    const result = await choose(
      "Nhập phiên tab",
      `Đã đọc ${mapped.length} phiên. Gộp thêm sẽ giữ phiên đang có; thay thế sẽ xóa danh sách phiên local hiện tại.`,
      [
        { label: "Thay thế", value: "replace", danger: true },
        { label: "Gộp thêm", value: "merge" },
      ],
    );
    if (result !== "merge" && result !== "replace") return;
    if (result === "replace") savedSessions = mapped.slice(0, 20);
    else {
      const ids = new Set(savedSessions.map((session) => session.id));
      const unique = mapped.map((session) => {
        if (!ids.has(session.id)) {
          ids.add(session.id);
          return session;
        }
        return { ...session, id: C.uid() };
      });
      savedSessions = [...unique, ...savedSessions].slice(0, 20);
    }
    await chrome.storage.local.set({ [SESSIONS_KEY]: savedSessions });
    renderSessions();
    toast(`Đã nhập ${mapped.length} phiên tab.`);
  });
$("import-file").onchange = () =>
  run(null, async () => {
    const file = $("import-file").files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024)
      throw new Error("File quá lớn. Giới hạn 5 MB.");
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error("File không phải JSON hợp lệ.");
    }
    const checked = C.parse(data);
    const result = await choose(
      "Nhập bộ sưu tập",
      `Đã đọc ${checked.state.pins.length} website và ${checked.state.folders.length} thư mục.${checked.skipped ? ` Bỏ qua ${checked.skipped} mục trùng.` : ""}\n\nGộp thêm sẽ bỏ qua website đã có. Thay thế sẽ lưu danh sách hiện tại thành bản dự phòng trước khi nhập.`,
      [
        { label: "Thay thế", value: "replace", danger: true },
        { label: "Gộp thêm", value: "merge" },
      ],
    );
    if (result !== "merge" && result !== "replace") return;
    await mutate({ type: "IMPORT", mode: result, data });
    toast("Đã nhập bộ sưu tập.");
  });
$("add-pin").onclick = () => pinDialog();
$("add-folder").onclick = () => state && folderDialog();
$("empty-action").onclick = () => {
  if ($("search").value) {
    $("search").value = "";
    render();
    $("search").focus();
  } else pinDialog();
};
$("pin-current").onclick = () =>
  run($("pin-current"), async () => {
    const data = await request("PIN_CURRENT", {
      windowId,
      workspaceId: activeWorkspaceId,
    });
    accept(data.state);
    toast("Đã ghim tab hiện tại.");
  });
$("search").oninput = () => {
  clearTimeout(queryTimer);
  queryTimer = setTimeout(render, 80);
};
document.addEventListener("click", (event) => {
  if (!$("item-menu").contains(event.target)) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (document.querySelector("dialog[open]")) return;
  const menu = $("item-menu");
  if (!menu.hidden) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = [...menu.querySelectorAll("button")];
      const i = items.indexOf(document.activeElement);
      items[
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (i + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length
      ].focus();
      return;
    }
    if (event.key === "Tab") closeMenu();
  }
  if (event.key === "Escape" && currentPin) {
    closeViewer();
    return;
  }
  if (
    event.key === "/" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
  ) {
    event.preventDefault();
    if (currentPin) closeViewer();
    $("search").focus();
  }
});
addEventListener("resize", () => closeMenu());
async function viewRequest(value) {
  if (!value || value.nonce === latestViewNonce) return;
  latestViewNonce = value.nonce;
  if (value.pin) {
    const pin = state?.pins.find((p) => p.id === value.pin.id);
    if (pin) await openPin(pin, "sidebar");
  } else if (currentPin) closeViewer();
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes["pinned.v2"]?.newValue) accept(changes["pinned.v2"].newValue);
    if (changes.syncStatus) {
      syncStatus = changes.syncStatus.newValue || {};
      renderStatus();
    }
    if (changes.embedOrigins) {
      embedOrigins = changes.embedOrigins.newValue || [];
      renderEmbeds();
    }
    if (changes[SESSIONS_KEY]) {
      savedSessions = cleanSessions(changes[SESSIONS_KEY].newValue);
      renderSessions();
    }
  }
  if (area === "session" && windowId != null && changes["viewer." + windowId])
    run(null, () => viewRequest(changes["viewer." + windowId].newValue));
});
async function reloadState() {
  const data = await request("GET_STATE");
  syncStatus = data.syncStatus || {};
  embedOrigins = data.embedOrigins || [];
  const local = await chrome.storage.local.get("activeWorkspaceId");
  activeWorkspaceId =
    local.activeWorkspaceId || data.state.settings.workspaceId;
  accept(data.state);
  await loadSessions();
  return data;
}
(async () => {
  try {
    windowId = (await chrome.windows.getCurrent()).id;
    const data = await reloadState();
    $("loading-state").hidden = true;
    if (data.migration && !sessionStorage.getItem("migrationSeen")) {
      toast(data.migration);
      sessionStorage.setItem("migrationSeen", "1");
    }
    const session = await chrome.storage.session.get("viewer." + windowId);
    await viewRequest(session["viewer." + windowId]);
  } catch (error) {
    $("loading-state").textContent = error.message;
    $("loading-state").setAttribute("role", "alert");
  }
})();
