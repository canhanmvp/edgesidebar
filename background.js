/* Single writer: mutations and cloud deliveries share the same durable queue. */
"use strict";
importScripts("core.js");
const C = Pinned;
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
  return { state: C.parse(JSON.parse(text)).state, manifest };
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
async function commit(action) {
  const state = await readState();
  const next = C.reduce(state, action);
  const { syncStatus = {} } = await chrome.storage.local.get("syncStatus");
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
    syncStatus: { ...syncStatus, dirty: true, message: "" },
  });
  if (next.settings.sync) await scheduleSync();
  else await chrome.alarms.clear("pinned-sync");
  return next;
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
async function handle(message, sender) {
  if (message.type === "OVERLAY_STATE") {
    const state = await readState();
    return {
      pins: state.settings.overlay
        ? state.pins.map(({ id, title, url }) => ({ id, title, url }))
        : [],
      settings: state.settings,
    };
  }
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
chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area === "sync" &&
    Object.keys(changes).some(
      (k) => k === SYNC_KEY || k.startsWith(CHUNK_PREFIX),
    )
  )
    serial(receiveCloud).catch(syncError);
  if (area === "local" && changes[STATE_KEY]) {
    chrome.tabs
      .query({ url: ["http://*/*", "https://*/*"] })
      .then((tabs) => {
        for (const tab of tabs)
          chrome.tabs
            .sendMessage(tab.id, { type: "REFRESH_OVERLAY" })
            .catch(() => {});
      })
      .catch(() => {});
  }
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
}
chrome.runtime.onInstalled.addListener(() =>
  serial(setup).catch(console.error),
);
chrome.runtime.onStartup.addListener(() => serial(setup).catch(console.error));
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "pin-to-sidebar") return;
  serial(() =>
    commit({
      type: "SAVE_PIN",
      url: info.linkUrl || info.pageUrl,
      title: info.linkUrl ? "" : tab?.title,
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
