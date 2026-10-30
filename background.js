/* Single writer: mutations and cloud deliveries share the same durable queue. */
"use strict";
importScripts("core.js", "bookmarks-core.js");
const C = Pinned;
const B = BookmarkSync;
const STATE_KEY = "pinned.v2";
const SYNC_KEY = "pinned.cloud";
const CHUNK_PREFIX = "pinned.chunk.";
// These sites redirect between their documented bare and www hostnames. Keep
// the exception narrow: do not grant arbitrary subdomains of a trusted site.
const EMBED_ORIGIN_ALIASES = new Map([
  ["https://youtube.com", ["https://www.youtube.com"]],
  ["https://www.youtube.com", ["https://youtube.com"]],
  ["https://google.com", ["https://www.google.com"]],
  ["https://www.google.com", ["https://google.com"]],
  ["https://perplexity.ai", ["https://www.perplexity.ai"]],
  ["https://www.perplexity.ai", ["https://perplexity.ai"]],
]);
let queue = Promise.resolve();
let initialized;
function serial(work) {
  const task = queue.then(work);
  queue = task.catch(() => {});
  return task;
}
async function hash(text) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
async function readCloud() {
  const all = await chrome.storage.sync.get(null);
  const manifest = all[SYNC_KEY];
  if (
    !manifest ||
    manifest.schema !== 2 ||
    !Number.isInteger(manifest.count) ||
    manifest.count < 1 ||
    manifest.count > 12
  )
    return null;
  const parts = Array.from(
    { length: manifest.count },
    (_, i) => all[CHUNK_PREFIX + i],
  );
  if (parts.some((p) => typeof p !== "string")) return null;
  const text = parts.join("");
  if ((await hash(text)) !== manifest.hash) return null;
  // An unreadable snapshot must never block startup on a fresh device; treat
  // it like a missing one so the next upload replaces it with valid data.
  try {
    return { state: C.parse(JSON.parse(text)).state, manifest };
  } catch (error) {
    console.warn("Ignoring invalid cloud snapshot:", error);
    return null;
  }
}
function initialize() {
  if (!initialized)
    initialized = (async () => {
      await chrome.storage.local.setAccessLevel({
        accessLevel: "TRUSTED_CONTEXTS",
      });
      await chrome.storage.sync.setAccessLevel({
        accessLevel: "TRUSTED_CONTEXTS",
      });
      const local = await chrome.storage.local.get(STATE_KEY);
      if (local[STATE_KEY]) {
        // A local-first install can already have durable v2 data when the
        // extension is upgraded. Normalize it once before any new writes so
        // the UI and the sync worker always operate on schema 3.
        if (local[STATE_KEY].schema !== 3) {
          const converted = C.parse(local[STATE_KEY], { migration: true });
          await chrome.storage.local.set({
            [STATE_KEY]: converted.state,
            migration:
              `Đã nâng dữ liệu lên bản mới. Giữ lại ${converted.state.pins.length} trang` +
              (converted.skipped
                ? `; bỏ qua ${converted.skipped} mục trùng hoặc không hợp lệ.`
                : "."),
            recoveryBackup: {
              time: Date.now(),
              data: local[STATE_KEY],
            },
          });
        }
        return;
      }
      const legacy = await chrome.storage.sync.get(["pins", "settings"]);
      let state,
        migration = "";
      const cloud = await readCloud();
      if (cloud) state = cloud.state;
      else if (Array.isArray(legacy.pins)) {
        const converted = C.parse(legacy, { migration: true });
        state = converted.state;
        migration =
          `Đã chuyển ${state.pins.length} trang từ bản cũ.` +
          (converted.skipped
            ? ` Bỏ qua ${converted.skipped} mục trùng hoặc không hợp lệ; bản gốc vẫn được giữ.`
            : "");
        await chrome.storage.local.set({
          legacyBackup: legacy,
          recoveryBackup: { time: Date.now(), data: legacy },
        });
      } else {
        state = C.parse({
          pins: [
            {
              title: "Google",
              url: "https://www.google.com",
              folder: "Hằng ngày",
            },
            {
              title: "YouTube",
              url: "https://www.youtube.com",
              folder: "Hằng ngày",
            },
            { title: "GitHub", url: "https://github.com", folder: "Công việc" },
          ],
        }).state;
      }
      await chrome.storage.local.set({
        [STATE_KEY]: state,
        migration,
        syncStatus: {
          dirty: !cloud,
          hash: cloud?.manifest.hash || "",
          message: "",
          syncedAt: cloud?.manifest.time || 0,
        },
      });
      if (!cloud && state.settings.sync) await scheduleSync();
    })().catch((error) => {
      initialized = null;
      throw error;
    });
  return initialized;
}
async function scheduleSync() {
  await chrome.alarms.create("pinned-sync", { delayInMinutes: 0.5 });
}
async function readState() {
  await initialize();
  return (await chrome.storage.local.get(STATE_KEY))[STATE_KEY];
}
// Settings are per device: receiveCloud keeps local settings, so changing them
// (theme, rail position, collapsed folders…) must not mark the list dirty and
// later raise a false sync conflict.
const DEVICE_ONLY_ACTIONS = new Set(["SETTINGS", "TOGGLE_FOLDER"]);
async function commit(action) {
  const state = await readState();
  const next = C.reduce(state, action);
  const { syncStatus = {} } = await chrome.storage.local.get("syncStatus");
  const deviceOnly = DEVICE_ONLY_ACTIONS.has(action.type);
  await chrome.storage.local.set({
    [STATE_KEY]: next,
    ...(action.type === "IMPORT" && action.mode === "replace"
      ? {
          importBackup: state,
          recoveryBackup: { time: Date.now(), data: state },
        }
      : action.type === "DELETE_WORKSPACE"
        ? {
            workspaceBackup: state,
            recoveryBackup: { time: Date.now(), data: state },
          }
        : {}),
    ...(deviceOnly
      ? {}
      : { syncStatus: { ...syncStatus, dirty: true, message: "" } }),
  });
  if (!next.settings.sync) await chrome.alarms.clear("pinned-sync");
  else if (!deviceOnly || (!state.settings.sync && syncStatus.dirty))
    await scheduleSync();
  if (!deviceOnly && !action.fromBookmarks) await afterStateChange(state, next);
  return next;
}
/* Bookmark links are per device: bookmark IDs differ between computers, so
   they live in storage.local and never travel through sync. Every function
   below runs inside serial(); none may call serial() itself. */
const LINKS_KEY = "bookmarkLinks";
async function getLinks() {
  return (await chrome.storage.local.get(LINKS_KEY))[LINKS_KEY] || [];
}
async function setLinks(links) {
  await chrome.storage.local.set({ [LINKS_KEY]: links });
}
function requireBookmarks() {
  if (!chrome.bookmarks)
    throw new Error("Hãy cho phép truy cập bookmark trước trong tab Bookmark.");
}
async function bookmarkNode(id) {
  const [node] = await chrome.bookmarks.getSubTree(String(id));
  if (!node || node.url != null)
    throw new Error("Hãy chọn một thư mục bookmark.");
  return node;
}
async function bookmarkPath(id) {
  const names = [];
  for (let current = String(id); current && current !== "0";) {
    const [node] = await chrome.bookmarks.get(current);
    names.unshift(node.title || "Bookmark");
    current = node.parentId;
  }
  return names.join(" › ");
}
function workspaceContent(state, workspaceId) {
  return JSON.stringify([
    state.folders.filter((item) => item.workspaceId === workspaceId),
    state.pins.filter((item) => item.workspaceId === workspaceId),
  ]);
}
async function pushLink(link, state) {
  if (link.direction !== "two-way" || link.status !== "ok") return;
  let node;
  try {
    node = await bookmarkNode(link.rootId);
  } catch {
    link.status = "broken";
    return;
  }
  const result = await B.applyOps(
    chrome.bookmarks,
    link.rootId,
    B.planPush(state, link, node),
  );
  link.map = result.map;
  link.message = result.failed
    ? "Một số bookmark chưa cập nhật được; sẽ thử lại ở lần đồng bộ sau."
    : "";
}
// Sidebar edits on a linked workspace are written to its bookmark folder.
async function afterStateChange(prev, next) {
  const links = await getLinks();
  if (!links.length) return;
  let dirty = false;
  for (const link of [...links]) {
    if (!next.workspaces.some((item) => item.id === link.workspaceId)) {
      // Deleting a workspace only drops the link; bookmarks are kept.
      links.splice(links.indexOf(link), 1);
      dirty = true;
      continue;
    }
    if (
      !chrome.bookmarks ||
      workspaceContent(prev, link.workspaceId) ===
        workspaceContent(next, link.workspaceId)
    )
      continue;
    try {
      await pushLink(link, next);
    } catch (error) {
      link.message = error.message;
    }
    dirty = true;
  }
  if (dirty) await setLinks(links);
}
async function pullLink(link) {
  let node;
  try {
    node = await bookmarkNode(link.rootId);
  } catch {
    link.status = "broken";
    link.message = "Thư mục bookmark đã bị xóa hoặc không đọc được.";
    return;
  }
  const state = await readState();
  if (!state.workspaces.some((item) => item.id === link.workspaceId)) return;
  const plan = B.planPull(state, link, node);
  link.map = plan.map;
  link.message = "";
  link.status = "ok";
  if (plan.changed)
    await commit({
      type: "REPLACE_WORKSPACE_ITEMS",
      workspaceId: link.workspaceId,
      folders: plan.folders,
      pins: plan.pins,
      fromBookmarks: true,
    });
  // Sites added in the sidebar while the link was idle get their bookmarks.
  await pushLink(link, await readState());
}
async function pullAll() {
  if (!chrome.bookmarks) return;
  const links = await getLinks();
  if (!links.length) return;
  for (const link of links)
    if (link.status === "ok")
      try {
        await pullLink(link);
      } catch (error) {
        link.message = error.message;
      }
  await setLinks(links);
}
let pullTimer;
let importingBookmarks = false;
function schedulePull() {
  if (importingBookmarks) return;
  clearTimeout(pullTimer);
  pullTimer = setTimeout(
    () => serial(pullAll).catch((error) => console.warn("Bookmarks:", error)),
    800,
  );
}
let bookmarkListeners = false;
function listenBookmarks() {
  if (!chrome.bookmarks || bookmarkListeners) return;
  bookmarkListeners = true;
  for (const name of [
    "onCreated",
    "onChanged",
    "onRemoved",
    "onMoved",
    "onChildrenReordered",
  ])
    chrome.bookmarks[name]?.addListener(schedulePull);
  // Signing in can replay thousands of synced bookmarks: reconcile once.
  chrome.bookmarks.onImportBegan?.addListener(() => {
    importingBookmarks = true;
  });
  chrome.bookmarks.onImportEnded?.addListener(() => {
    importingBookmarks = false;
    schedulePull();
  });
}
listenBookmarks();
chrome.permissions?.onAdded.addListener((permissions) => {
  if (!permissions.permissions?.includes("bookmarks")) return;
  listenBookmarks();
  serial(async () => {
    const links = await getLinks();
    for (const link of links) if (link.status === "paused") link.status = "ok";
    await setLinks(links);
    await pullAll();
  }).catch(console.warn);
});
chrome.permissions?.onRemoved.addListener((permissions) => {
  if (!permissions.permissions?.includes("bookmarks")) return;
  serial(async () => {
    const links = await getLinks();
    for (const link of links)
      if (link.status === "ok") {
        link.status = "paused";
        link.message = "Đã mất quyền truy cập bookmark.";
      }
    await setLinks(links);
  }).catch(console.warn);
});
async function targetWorkspace(message) {
  if (!message.newWorkspaceName) return message.workspaceId;
  const workspaceId = C.uid();
  await commit({
    type: "SAVE_WORKSPACE",
    workspaceId,
    name: message.newWorkspaceName,
    color: message.color,
  });
  return workspaceId;
}
async function linkBookmarks(message) {
  requireBookmarks();
  const direction = message.direction === "pull-only" ? "pull-only" : "two-way";
  const node = await bookmarkNode(message.rootId);
  if (node.unmodifiable && direction === "two-way")
    throw new Error(
      "Thư mục này do tổ chức quản lý nên chỉ có thể sao chép hoặc chỉ kéo về.",
    );
  const links = await getLinks();
  if (links.some((link) => link.rootId === node.id))
    throw new Error(
      "Thư mục bookmark này đã liên kết với một không gian khác.",
    );
  if (
    !message.newWorkspaceName &&
    links.some((link) => link.workspaceId === message.workspaceId)
  )
    throw new Error(
      "Không gian này đã có liên kết. Hãy hủy liên kết cũ trước.",
    );
  let state = await readState();
  const draft = {
    workspaceId: message.workspaceId,
    rootId: node.id,
    direction,
    map: B.emptyMap(),
    status: "ok",
  };
  if (message.dryRun) {
    if (message.newWorkspaceName) {
      draft.workspaceId = C.uid();
      state = C.reduce(state, {
        type: "SAVE_WORKSPACE",
        workspaceId: draft.workspaceId,
        name: message.newWorkspaceName,
      });
    }
    const plan = B.planPull(state, draft, node);
    const mapped = new Set(Object.values(plan.map.pins));
    return {
      stats: {
        ...plan.stats,
        pushed:
          direction === "two-way"
            ? plan.pins.filter((pin) => !mapped.has(pin.id)).length
            : 0,
      },
    };
  }
  // Validate (size limits) before creating a workspace for the link.
  B.planPull(state, draft, node);
  draft.workspaceId = await targetWorkspace(message);
  state = await readState();
  const link = {
    ...draft,
    rootPath: await bookmarkPath(node.id),
    linkedAt: Date.now(),
    message: "",
  };
  await chrome.storage.local.set({
    recoveryBackup: { time: Date.now(), data: state },
    bookmarkLinkBackup: { time: Date.now(), rootId: node.id, tree: node },
  });
  // Re-read: creating the workspace above may have updated the stored links.
  const current = await getLinks();
  current.push(link);
  await pullLink(link);
  await setLinks(current);
  return { workspaceId: link.workspaceId, state: await readState() };
}
async function copyBookmarks(message) {
  requireBookmarks();
  const node = await bookmarkNode(message.rootId);
  const temp = { workspaceId: "", map: B.emptyMap() };
  B.planPull(await readState(), temp, node, { mode: "copy" });
  temp.workspaceId = await targetWorkspace(message);
  const plan = B.planPull(await readState(), temp, node, { mode: "copy" });
  if (plan.changed)
    await commit({
      type: "REPLACE_WORKSPACE_ITEMS",
      workspaceId: temp.workspaceId,
      folders: plan.folders,
      pins: plan.pins,
    });
  return {
    workspaceId: temp.workspaceId,
    stats: plan.stats,
    state: await readState(),
  };
}
async function exportBookmarks(message) {
  requireBookmarks();
  const state = await readState();
  const workspace = state.workspaces.find(
    (item) => item.id === message.workspaceId,
  );
  if (!workspace) throw new Error("Không gian không còn tồn tại.");
  if (
    message.link &&
    (await getLinks()).some((link) => link.workspaceId === workspace.id)
  )
    throw new Error(
      "Không gian này đã có liên kết. Hãy hủy liên kết cũ trước.",
    );
  const parent = await bookmarkNode(message.parentId || "2");
  const folder = await chrome.bookmarks.create({
    parentId: parent.id,
    title: "Pinned · " + workspace.name,
  });
  if (message.link)
    return linkBookmarks({
      rootId: folder.id,
      workspaceId: workspace.id,
      direction: "two-way",
    });
  const temp = {
    workspaceId: workspace.id,
    rootId: folder.id,
    map: B.emptyMap(),
  };
  await B.applyOps(
    chrome.bookmarks,
    folder.id,
    B.planPush(state, temp, await bookmarkNode(folder.id)),
  );
  return { rootId: folder.id };
}
async function upload(force = false) {
  const state = await readState();
  if (!state.settings.sync && !force) return;
  const { syncStatus = {} } = await chrome.storage.local.get("syncStatus");
  if (syncStatus.conflict)
    throw new Error(
      "Có thay đổi trên thiết bị khác. Chọn bản cần giữ trong cài đặt.",
    );
  // Check the latest remote manifest before writing after a worker restart.
  const remote = await readCloud();
  if (remote && remote.manifest.hash !== syncStatus.hash && syncStatus.hash) {
    await chrome.storage.local.set({
      syncStatus: { ...syncStatus, conflict: true },
    });
    throw new Error(
      "Có thay đổi trên thiết bị khác. Chọn bản cần giữ trong cài đặt.",
    );
  }
  const text = JSON.stringify(state);
  const parts = C.chunks(text);
  if (parts.length > 12)
    throw new Error(
      "Danh sách vượt dung lượng đồng bộ. Dữ liệu vẫn an toàn trên máy; hãy xuất file để sao lưu.",
    );
  const digest = await hash(text);
  const values = Object.fromEntries(
    parts.map((part, i) => [CHUNK_PREFIX + i, part]),
  );
  values[SYNC_KEY] = {
    schema: 2,
    count: parts.length,
    hash: digest,
    time: Date.now(),
  };
  const old = await chrome.storage.sync.get(null);
  const total = { ...old, ...values };
  if (
    Object.entries(total).reduce(
      (n, [key, value]) =>
        n + new TextEncoder().encode(key + JSON.stringify(value)).length,
      0,
    ) > 100000
  ) {
    throw new Error(
      "Tài khoản không còn đủ dung lượng đồng bộ. Dữ liệu trên máy vẫn được giữ.",
    );
  }
  await chrome.storage.sync.set(values);
  const obsolete = Object.keys(old).filter(
    (k) => k.startsWith(CHUNK_PREFIX) && !Object.hasOwn(values, k),
  );
  if (obsolete.length) await chrome.storage.sync.remove(obsolete);
  await chrome.storage.local.set({
    syncStatus: {
      dirty: false,
      hash: digest,
      syncedAt: Date.now(),
      message: "",
      conflict: false,
    },
  });
}
async function receiveCloud() {
  const state = await readState();
  if (!state.settings.sync) return;
  const cloud = await readCloud();
  if (!cloud) return;
  const { syncStatus = {} } = await chrome.storage.local.get("syncStatus");
  if (cloud.manifest.hash === syncStatus.hash) return;
  if (syncStatus.dirty) {
    await chrome.storage.local.set({
      syncStatus: {
        ...syncStatus,
        conflict: true,
        message: "Có thay đổi trên thiết bị khác. Chọn bản cần giữ.",
      },
    });
    return;
  }
  cloud.state.settings = { ...state.settings, collapsed: [] };
  cloud.state.revision = state.revision + 1;
  cloud.state.updatedAt = Date.now();
  await chrome.storage.local.set({
    [STATE_KEY]: cloud.state,
    syncStatus: {
      dirty: false,
      hash: cloud.manifest.hash,
      syncedAt: Date.now(),
      message: "",
      conflict: false,
    },
  });
  // Cloud edits from a device without the link still reach the bookmarks.
  await afterStateChange(state, cloud.state);
}
async function syncError(error) {
  const { syncStatus = {} } = await chrome.storage.local.get("syncStatus");
  await chrome.storage.local.set({
    syncStatus: { ...syncStatus, message: error.message },
  });
}
function trusted(sender) {
  return (
    sender.id === chrome.runtime.id &&
    sender.url?.split("?")[0] === chrome.runtime.getURL("sidebar.html")
  );
}
async function setEmbed(origin, enabled) {
  const parsed = new URL(C.url(origin));
  const { embedOrigins = [] } = await chrome.storage.local.get("embedOrigins");
  const origins = new Set(embedOrigins);
  enabled ? origins.add(parsed.origin) : origins.delete(parsed.origin);
  if (origins.size > 100)
    throw new Error("Tối đa 100 website được cho phép nhúng.");
  await applyEmbedRules([...origins]);
  await chrome.storage.local.set({ embedOrigins: [...origins] });
}
async function applyEmbedRules(origins) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const requestOrigins = [
    ...new Set(
      origins.flatMap((origin) => [
        origin,
        ...(EMBED_ORIGIN_ALIASES.get(origin) || []),
      ]),
    ),
  ];
  const addRules = requestOrigins.map((origin, index) => ({
    id: 2000 + index,
    priority: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "x-frame-options", operation: "remove" },
        { header: "content-security-policy", operation: "remove" },
      ],
    },
    condition: {
      initiatorDomains: [chrome.runtime.id],
      regexFilter: "^" + escape(origin) + "/",
      resourceTypes: ["sub_frame"],
    },
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });
}
// The only settings content.js reads.
const OVERLAY_SETTINGS = [
  "theme",
  "openMode",
  "overlay",
  "overlaySide",
  "overlayX",
  "overlayY",
  "overlayWidth",
];
async function activeWorkspace(state) {
  const local = await chrome.storage.local.get("activeWorkspaceId");
  return state.workspaces.some(
    (workspace) => workspace.id === local.activeWorkspaceId,
  )
    ? local.activeWorkspaceId
    : state.settings.workspaceId;
}
function overlayView(state, workspaceId) {
  return {
    pins: state.settings.overlay
      ? state.pins
          .filter((pin) => pin.workspaceId === workspaceId)
          .map(({ id, title, url }) => ({ id, title, url }))
      : [],
    settings: Object.fromEntries(
      OVERLAY_SETTINGS.map((key) => [key, state.settings[key]]),
    ),
  };
}
async function overlayState() {
  const state = await readState();
  return overlayView(state, await activeWorkspace(state));
}
async function handle(message, sender) {
  if (message.type === "OVERLAY_WIDTH") {
    if (!sender.tab) throw new Error("Nguồn yêu cầu không hợp lệ.");
    await commit({ type: "SETTINGS", patch: { overlayWidth: message.width } });
    return {};
  }
  if (message.type === "OVERLAY_ENABLED") {
    if (!sender.tab || typeof message.enabled !== "boolean")
      throw new Error("Trạng thái thanh icon không hợp lệ.");
    await commit({
      type: "SETTINGS",
      patch: { overlay: message.enabled },
    });
    return {};
  }
  if (message.type === "OVERLAY_POSITION") {
    if (
      !sender.tab ||
      !Number.isFinite(message.x) ||
      !Number.isFinite(message.y) ||
      !["left", "right"].includes(message.side)
    )
      throw new Error("Vị trí thanh icon không hợp lệ.");
    await commit({
      type: "SETTINGS",
      patch: {
        overlayX: message.x,
        overlayY: message.y,
        overlaySide: message.side,
      },
    });
    return {};
  }
  if (!trusted(sender))
    throw new Error("Thao tác chỉ được thực hiện từ sidebar.");
  if (message.type === "GET_STATE") {
    const state = await readState();
    return {
      state,
      ...(await chrome.storage.local.get([
        "syncStatus",
        "migration",
        "embedOrigins",
      ])),
    };
  }
  if (message.type === "GET_TABS") {
    const targetWindowId = Number.isInteger(message.windowId)
      ? message.windowId
      : sender.tab?.windowId;
    if (!Number.isInteger(targetWindowId))
      throw new Error("Không đọc được cửa sổ hiện tại.");
    const tabs = await chrome.tabs.query({ windowId: targetWindowId });
    return {
      tabs: tabs
        .filter((tab) => /^https?:\/\//i.test(tab.url || ""))
        .map((tab) => ({
          title: tab.title || C.host(tab.url),
          url: tab.url,
          faviconUrl: tab.favIconUrl || "",
          groupId: tab.groupId ?? -1,
        })),
    };
  }
  if (message.type === "MUTATE") return { state: await commit(message.action) };
  if (message.type === "PIN_CURRENT") {
    const [tab] = await chrome.tabs.query({
      active: true,
      windowId: message.windowId,
    });
    if (!tab?.url) throw new Error("Không đọc được tab hiện tại.");
    return {
      state: await commit({
        type: "SAVE_PIN",
        url: tab.url,
        title: tab.title,
        workspaceId: message.workspaceId,
      }),
    };
  }
  if (message.type === "BOOKMARK_LINK") return linkBookmarks(message);
  if (message.type === "BOOKMARK_COPY") return copyBookmarks(message);
  if (message.type === "BOOKMARK_EXPORT") return exportBookmarks(message);
  if (message.type === "BOOKMARK_UNLINK") {
    await setLinks(
      (await getLinks()).filter(
        (link) => link.workspaceId !== message.workspaceId,
      ),
    );
    return {};
  }
  if (message.type === "BOOKMARK_RESYNC") {
    requireBookmarks();
    const links = await getLinks();
    const link = links.find((item) => item.workspaceId === message.workspaceId);
    if (!link) throw new Error("Không gian này chưa liên kết bookmark.");
    link.status = "ok";
    await pullLink(link);
    await setLinks(links);
    if (link.status !== "ok") throw new Error(link.message);
    return { state: await readState() };
  }
  if (message.type === "EMBED") {
    await setEmbed(message.origin, message.enabled);
    return {};
  }
  if (message.type === "SYNC_NOW") {
    try {
      await upload(true);
    } catch (e) {
      await syncError(e);
      throw e;
    }
    return {};
  }
  if (message.type === "RESOLVE_SYNC") {
    if (message.choice === "remote") {
      const cloud = await readCloud();
      if (!cloud) throw new Error("Bản đồng bộ chưa đầy đủ. Hãy thử lại sau.");
      const state = await readState();
      await chrome.storage.local.set({
        conflictBackup: state,
        recoveryBackup: { time: Date.now(), data: state },
        [STATE_KEY]: {
          ...cloud.state,
          settings: { ...state.settings, collapsed: [] },
          revision: state.revision + 1,
        },
        syncStatus: {
          dirty: false,
          conflict: false,
          message: "",
          hash: cloud.manifest.hash,
          syncedAt: Date.now(),
        },
      });
      await afterStateChange(state, await readState());
    } else if (message.choice === "local") {
      const { syncStatus = {} } = await chrome.storage.local.get("syncStatus");
      const cloud = await readCloud();
      if (cloud)
        await chrome.storage.local.set({
          conflictBackup: cloud.state,
          recoveryBackup: { time: Date.now(), data: cloud.state },
        });
      await chrome.storage.local.set({
        syncStatus: {
          ...syncStatus,
          hash: cloud?.manifest.hash || "",
          conflict: false,
        },
      });
      await upload(true);
    } else throw new Error("Lựa chọn không hợp lệ.");
    return {};
  }
  throw new Error("Yêu cầu không được hỗ trợ.");
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    !message ||
    typeof message.type !== "string"
  )
    return false;
  if (message.type === "OVERLAY_STATE") {
    // Read-only and requested by every tab after each change: keep it out of
    // the write queue so it never delays the user's own edits. A storage.local
    // write is atomic, so reads always see a complete state.
    overlayState().then(
      (data) => reply({ ok: true, ...data }),
      (error) => reply({ ok: false, error: error.message }),
    );
    return true;
  }
  if (message.type === "OPEN_PANEL" && sender.tab) {
    // Preserve user activation: open before awaiting storage or the mutation queue.
    const opening = chrome.sidePanel.open({ windowId: sender.tab.windowId });
    opening.catch(() => {});
    serial(async () => {
      const state = await readState();
      const pin = message.id
        ? state.pins.find((p) => p.id === message.id)
        : null;
      if (message.id && !pin) throw new Error("Trang ghim không còn tồn tại.");
      await chrome.storage.session.set({
        ["viewer." + sender.tab.windowId]: { pin: pin || null, nonce: C.uid() },
      });
      await opening;
      return {};
    }).then(
      (data) => reply({ ok: true, ...data }),
      (error) => reply({ ok: false, error: error.message }),
    );
    return true;
  }
  if (message.type === "OPEN_PIN" && sender.tab) {
    serial(async () => {
      const state = await readState();
      const pin = state.pins.find((p) => p.id === message.id);
      if (!pin) throw new Error("Trang ghim không còn tồn tại.");
      await chrome.tabs.create({
        url: C.url(pin.url),
        active: !message.background,
        windowId: sender.tab.windowId,
      });
    }).then(
      () => reply({ ok: true }),
      (error) => reply({ ok: false, error: error.message }),
    );
    return true;
  }
  serial(() => handle(message, sender)).then(
    (data) => reply({ ok: true, ...data }),
    (error) => reply({ ok: false, error: error.message }),
  );
  return true;
});
chrome.commands?.onCommand?.addListener((command, tab) => {
  if (command !== "open-sidebar") return;
  // sidePanel.open() needs the shortcut's user gesture, which is lost after
  // any await. Open synchronously with the tab Chrome passes to the listener.
  if (Number.isInteger(tab?.windowId)) {
    chrome.sidePanel
      .open({ windowId: tab.windowId })
      .catch((error) => console.warn("Cannot open side panel:", error));
    return;
  }
  chrome.windows
    .getLastFocused()
    .then((window) => chrome.sidePanel.open({ windowId: window.id }))
    .catch((error) => console.warn("Cannot open side panel:", error));
});
// Only overlay-visible data should wake every open tab: notes, tags, folders
// and other workspaces never reach the rail.
async function overlaySignature(state) {
  return state
    ? JSON.stringify(overlayView(state, await activeWorkspace(state)))
    : "";
}
async function refreshOverlays(changes) {
  const change = changes[STATE_KEY];
  if (
    !changes.activeWorkspaceId &&
    change?.oldValue &&
    (await overlaySignature(change.oldValue)) ===
      (await overlaySignature(change.newValue))
  )
    return;
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs)
    if (!tab.discarded)
      chrome.tabs
        .sendMessage(tab.id, { type: "REFRESH_OVERLAY" })
        .catch(() => {});
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area === "sync" &&
    Object.keys(changes).some(
      (k) => k === SYNC_KEY || k.startsWith(CHUNK_PREFIX),
    )
  )
    serial(receiveCloud).catch(syncError);
  if (area === "local" && (changes[STATE_KEY] || changes.activeWorkspaceId))
    refreshOverlays(changes).catch(() => {});
});
// Omnibox: "p <text>" searches pins of every workspace, active one first.
function escapeXml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );
}
async function omniboxResults(text, limit = 8) {
  const state = await readState();
  return C.search(state, text, {
    workspaceId: await activeWorkspace(state),
    limit,
  });
}
async function openFromOmnibox(url, disposition) {
  const address = C.url(url);
  if (disposition === "currentTab") {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (tab) return chrome.tabs.update(tab.id, { url: address });
  }
  await chrome.tabs.create({
    url: address,
    active: disposition !== "newBackgroundTab",
  });
}
chrome.omnibox?.onInputStarted.addListener(() => {
  chrome.omnibox.setDefaultSuggestion({
    description:
      "Tìm trong Pinned Sidebar: gõ tên, tên miền hoặc nhãn · gõ + để ghim tab hiện tại",
  });
});
chrome.omnibox?.onInputChanged.addListener((text, suggest) => {
  if (text.trim() === "+") {
    chrome.omnibox.setDefaultSuggestion({
      description: "Ghim tab hiện tại vào không gian đang chọn",
    });
    suggest([]);
    return;
  }
  omniboxResults(text)
    .then((results) => {
      chrome.omnibox.setDefaultSuggestion({
        description: results.length
          ? `Mở <match>${escapeXml(results[0].pin.title)}</match> <dim>· ${escapeXml(results[0].workspace?.name || "")}</dim>`
          : `Không có trang ghim khớp “${escapeXml(text)}”`,
      });
      suggest(
        results.slice(1).map(({ pin, workspace, folder }) => ({
          content: pin.url,
          description: `<match>${escapeXml(pin.title)}</match> <dim>· ${escapeXml(
            [workspace?.name, folder?.name].filter(Boolean).join(" › "),
          )}</dim> <url>${escapeXml(C.host(pin.url))}</url>`,
        })),
      );
    })
    .catch(() => suggest([]));
});
chrome.omnibox?.onInputEntered.addListener((text, disposition) => {
  serial(async () => {
    if (text.trim() === "+") {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (!tab?.url) throw new Error("Không đọc được tab hiện tại.");
      await commit({
        type: "SAVE_PIN",
        url: tab.url,
        title: tab.title,
        workspaceId: await activeWorkspace(await readState()),
      });
      return;
    }
    // A picked suggestion sends its pin URL; typed text opens the best match.
    const state = await readState();
    let target = state.pins.find((pin) => pin.url === text)?.url;
    if (!target) target = (await omniboxResults(text, 1))[0]?.pin.url;
    if (target) await openFromOmnibox(target, disposition);
  }).catch((error) => console.warn("Omnibox:", error));
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "pinned-sync") serial(() => upload()).catch(syncError);
});
async function setup() {
  await initialize();
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "pin-to-sidebar",
    title: "Ghim vào Pinned Sidebar",
    contexts: ["page", "link"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  });
  const { embedOrigins = [], syncStatus = {} } = await chrome.storage.local.get(
    ["embedOrigins", "syncStatus"],
  );
  await applyEmbedRules(embedOrigins);
  if (syncStatus.dirty) await scheduleSync();
  // Bookmarks may have changed while the extension was not running.
  await pullAll().catch((error) => console.warn("Bookmarks:", error));
}
chrome.runtime.onInstalled.addListener(() =>
  serial(setup).catch(console.error),
);
chrome.runtime.onStartup.addListener(() => serial(setup).catch(console.error));
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "pin-to-sidebar") return;
  serial(async () =>
    commit({
      type: "SAVE_PIN",
      url: info.linkUrl || info.pageUrl,
      title: info.linkUrl ? "" : tab?.title,
      workspaceId: await activeWorkspace(await readState()),
    }),
  )
    .then(async () => {
      await chrome.action.setBadgeText({ text: "", tabId: tab?.id });
      await chrome.action.setTitle({
        title: "Mở Pinned Sidebar",
        tabId: tab?.id,
      });
    })
    .catch(async (error) => {
      await chrome.action.setBadgeText({ text: "!", tabId: tab?.id });
      await chrome.action.setTitle({ title: error.message, tabId: tab?.id });
    });
});
