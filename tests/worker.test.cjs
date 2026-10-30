const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const crypto = require("node:crypto").webcrypto;

function event() {
  const listeners = [];
  return {
    listeners,
    addListener(fn) {
      listeners.push(fn);
    },
    emit(...args) {
      for (const fn of listeners) fn(...args);
    },
  };
}
function worker(initial = {}, { bookmarks } = {}) {
  const changed = event();
  let failLocal = false;
  function storage(area, initialData = {}) {
    const data = structuredClone(initialData);
    return {
      data,
      async get(keys) {
        if (keys == null) return structuredClone(data);
        return Object.fromEntries(
          (typeof keys === "string" ? [keys] : keys)
            .filter((k) => Object.hasOwn(data, k))
            .map((k) => [k, structuredClone(data[k])]),
        );
      },
      async set(values) {
        if (area === "local" && failLocal) throw new Error("LOCAL_QUOTA");
        if (area === "sync")
          for (const [k, v] of Object.entries(values))
            assert.ok(Buffer.byteLength(k + JSON.stringify(v)) <= 8192);
        const delta = {};
        for (const [k, v] of Object.entries(values)) {
          delta[k] = { oldValue: data[k], newValue: structuredClone(v) };
          data[k] = structuredClone(v);
        }
        queueMicrotask(() => changed.emit(delta, area));
      },
      async remove(keys) {
        for (const k of typeof keys === "string" ? [keys] : keys)
          delete data[k];
      },
      async setAccessLevel() {},
    };
  }
  const chrome = {
    runtime: {
      id: "a".repeat(32),
      getURL: (p) => "chrome-extension://" + "a".repeat(32) + "/" + p,
      onMessage: event(),
      onInstalled: event(),
      onStartup: event(),
    },
    storage: {
      local: storage("local"),
      sync: storage("sync", initial),
      session: storage("session"),
      onChanged: changed,
    },
    tabs: {
      async query() {
        return [];
      },
      async sendMessage() {},
      async create() {},
    },
    alarms: { onAlarm: event(), async create() {}, async clear() {} },
    omnibox: {
      onInputStarted: event(),
      onInputChanged: event(),
      onInputEntered: event(),
      defaultSuggestion: null,
      setDefaultSuggestion(value) {
        this.defaultSuggestion = value;
      },
    },
    permissions: { onAdded: event(), onRemoved: event() },
    ...(bookmarks ? { bookmarks } : {}),
    sidePanel: {
      opened: [],
      open(options) {
        this.opened.push(options);
        return Promise.resolve();
      },
      async setPanelBehavior() {},
    },
    commands: { onCommand: event() },
    windows: {
      async getLastFocused() {
        return { id: 9 };
      },
    },
    contextMenus: { onClicked: event(), async removeAll() {}, create() {} },
    action: { async setBadgeText() {}, async setTitle() {} },
    declarativeNetRequest: {
      rules: [],
      async getDynamicRules() {
        return this.rules;
      },
      async updateDynamicRules({ addRules }) {
        this.rules = addRules;
      },
    },
  };
  const context = vm.createContext({
    chrome,
    crypto,
    URL,
    TextEncoder,
    structuredClone,
    console,
    setTimeout,
    clearTimeout,
  });
  context.importScripts = (...files) =>
    files.forEach((file) =>
      vm.runInContext(
        fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
        context,
      ),
    );
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../background.js"), "utf8"),
    context,
  );
  const sender = {
    id: chrome.runtime.id,
    url: chrome.runtime.getURL("sidebar.html"),
  };
  async function send(message, customSender = sender) {
    return new Promise((resolve) =>
      chrome.runtime.onMessage.listeners[0](message, customSender, resolve),
    );
  }
  return {
    chrome,
    send,
    failWrites() {
      failLocal = true;
    },
    async idle() {
      await vm.runInContext("queue", context);
    },
    // Runs the debounced bookmark pull now and waits for it.
    async pullNow() {
      await vm.runInContext(
        "clearTimeout(pullTimer); serial(pullAll)",
        context,
      );
    },
  };
}
test("simultaneous UI writes preserve every pin", async () => {
  const w = worker({ pins: [] });
  await w.send({ type: "GET_STATE" });
  const results = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      w.send({
        type: "MUTATE",
        action: { type: "SAVE_PIN", url: `https://example.com/${i}` },
      }),
    ),
  );
  assert.ok(results.every((r) => r.ok));
  const state = (await w.send({ type: "GET_STATE" })).state;
  assert.equal(state.pins.length, 30);
  assert.equal(state.revision, 30);
});
test("failed local write leaves durable state unchanged", async () => {
  const w = worker({ pins: [] });
  await w.send({ type: "GET_STATE" });
  w.failWrites();
  const result = await w.send({
    type: "MUTATE",
    action: { type: "SAVE_PIN", url: "example.com" },
  });
  assert.equal(result.ok, false);
  assert.equal(w.chrome.storage.local.data["pinned.v2"].pins.length, 0);
});
test("content scripts cannot import, delete or change embed rules", async () => {
  const w = worker({ pins: [] });
  const sender = {
    id: w.chrome.runtime.id,
    url: "https://example.com",
    tab: { id: 1, windowId: 1 },
  };
  for (const message of [
    {
      type: "MUTATE",
      action: { type: "IMPORT", mode: "replace", data: { pins: [] } },
    },
    { type: "EMBED", origin: "https://example.com", enabled: true },
  ]) {
    assert.equal((await w.send(message, sender)).ok, false);
  }
});
test("content script can hide its own icon rail with a boolean setting", async () => {
  const w = worker({ pins: [] });
  const sender = {
    id: w.chrome.runtime.id,
    url: "https://example.com",
    tab: { id: 1, windowId: 1 },
  };
  assert.equal(
    (await w.send({ type: "OVERLAY_ENABLED", enabled: false }, sender)).ok,
    true,
  );
  assert.equal(
    (await w.send({ type: "GET_STATE" })).state.settings.overlay,
    false,
  );
  assert.equal(
    (await w.send({ type: "OVERLAY_ENABLED", enabled: "false" }, sender)).ok,
    false,
  );
});
test("floating rail follows the active workspace without exposing other workspaces", async () => {
  const w = worker({ pins: [{ url: "default.example" }] });
  await w.send({ type: "GET_STATE" });
  assert.equal(
    (
      await w.send({
        type: "MUTATE",
        action: {
          type: "SAVE_WORKSPACE",
          workspaceId: "private-work",
          name: "Cá nhân",
        },
      })
    ).ok,
    true,
  );
  await w.send({
    type: "MUTATE",
    action: {
      type: "SAVE_PIN",
      url: "private.example",
      workspaceId: "private-work",
    },
  });
  await w.chrome.storage.local.set({ activeWorkspaceId: "private-work" });
  const result = await w.send({
    type: "OVERLAY_STATE",
  });
  assert.deepEqual(
    result.pins.map((pin) => pin.url),
    ["https://private.example/"],
  );
});
test("replace import stores recovery copy and invalid import never commits", async () => {
  const w = worker({ pins: [{ url: "old.example" }] });
  await w.send({ type: "GET_STATE" });
  assert.equal(
    (
      await w.send({
        type: "MUTATE",
        action: {
          type: "IMPORT",
          mode: "replace",
          data: { pins: [{ url: "new.example" }] },
        },
      })
    ).ok,
    true,
  );
  assert.equal(
    w.chrome.storage.local.data.importBackup.pins[0].url,
    "https://old.example/",
  );
  assert.equal(
    (
      await w.send({
        type: "MUTATE",
        action: {
          type: "IMPORT",
          mode: "replace",
          data: { pins: [{ url: "javascript:alert(1)" }] },
        },
      })
    ).ok,
    false,
  );
  assert.equal(
    w.chrome.storage.local.data["pinned.v2"].pins[0].url,
    "https://new.example/",
  );
});
test("deleting a workspace keeps a recovery copy before destructive change", async () => {
  const w = worker({ pins: [{ url: "kept.example" }] });
  const initial = await w.send({ type: "GET_STATE" });
  const created = await w.send({
    type: "MUTATE",
    action: {
      type: "SAVE_WORKSPACE",
      workspaceId: "temporary-work",
      name: "Tạm thời",
    },
  });
  assert.equal(created.ok, true);
  const deleted = await w.send({
    type: "MUTATE",
    action: { type: "DELETE_WORKSPACE", id: "temporary-work" },
  });
  assert.equal(deleted.ok, true);
  assert.equal(
    w.chrome.storage.local.data.workspaceBackup.pins[0].url,
    initial.state.pins[0].url,
  );
});
test("80-pin sync exceeds old key quota but uploads in safe chunks", async () => {
  const w = worker({ pins: [] });
  await w.send({ type: "GET_STATE" });
  await w.send({
    type: "MUTATE",
    action: {
      type: "IMPORT",
      mode: "replace",
      data: {
        pins: Array.from({ length: 80 }, (_, i) => ({
          url: `https://example.com/${i}`,
          title: `Website ${i}`,
        })),
      },
    },
  });
  const response = await w.send({ type: "SYNC_NOW" });
  assert.equal(response.ok, true, response.error);
  await w.idle();
  assert.ok(w.chrome.storage.sync.data["pinned.cloud"].count > 1);
  assert.equal(w.chrome.storage.local.data.syncStatus.dirty, false);
  assert.equal(w.chrome.storage.local.data.syncStatus.conflict, false);
});
test("oversized sync reports failure while preserving local collection", async () => {
  const w = worker({ pins: [] });
  await w.send({ type: "GET_STATE" });
  await w.send({
    type: "MUTATE",
    action: {
      type: "IMPORT",
      mode: "replace",
      data: {
        pins: Array.from({ length: 1200 }, (_, i) => ({
          url: `https://example.com/${i}`,
        })),
      },
    },
  });
  const response = await w.send({ type: "SYNC_NOW" });
  assert.equal(response.ok, false);
  assert.equal(w.chrome.storage.local.data["pinned.v2"].pins.length, 1200);
  assert.ok(w.chrome.storage.local.data.syncStatus.message);
});
test("iframe exception is restricted to extension initiator and exact origin; can revoke", async () => {
  const w = worker({ pins: [] });
  await w.send({ type: "GET_STATE" });
  const response = await w.send({
    type: "EMBED",
    origin: "https://example.com:8443/path",
    enabled: true,
  });
  assert.equal(response.ok, true, response.error);
  const rule = w.chrome.declarativeNetRequest.rules[0];
  assert.deepEqual(Array.from(rule.condition.initiatorDomains), [
    w.chrome.runtime.id,
  ]);
  const regex = new RegExp(rule.condition.regexFilter);
  assert.ok(regex.test("https://example.com:8443/page"));
  assert.ok(!regex.test("https://exampleXcom:8443/page"));
  assert.ok(!regex.test("https://example.com:8443.evil.com/page"));
  assert.ok(!regex.test("https://example.com/page"));
  await w.send({
    type: "EMBED",
    origin: "https://example.com:8443",
    enabled: false,
  });
  assert.equal(w.chrome.declarativeNetRequest.rules.length, 0);
});
test("YouTube's documented www redirect receives the same narrow embed exception", async () => {
  const w = worker({ pins: [] });
  await w.send({ type: "GET_STATE" });
  const response = await w.send({
    type: "EMBED",
    origin: "https://youtube.com",
    enabled: true,
  });
  assert.equal(response.ok, true, response.error);
  assert.equal(w.chrome.storage.local.data.embedOrigins.length, 1);
  assert.equal(
    w.chrome.storage.local.data.embedOrigins[0],
    "https://youtube.com",
  );
  assert.equal(w.chrome.declarativeNetRequest.rules.length, 2);
  const patterns = w.chrome.declarativeNetRequest.rules.map(
    (rule) => new RegExp(rule.condition.regexFilter),
  );
  assert.ok(patterns.some((pattern) => pattern.test("https://youtube.com/")));
  assert.ok(
    patterns.some((pattern) => pattern.test("https://www.youtube.com/")),
  );
  assert.ok(
    patterns.every(
      (pattern) =>
        !pattern.test("https://music.youtube.com/") &&
        !pattern.test("https://youtube.com.evil.example/"),
    ),
  );
  assert.ok(
    w.chrome.declarativeNetRequest.rules.every(
      (rule) => rule.condition.initiatorDomains[0] === w.chrome.runtime.id,
    ),
  );
});
test("Perplexity's documented www redirect receives the same narrow embed exception", async () => {
  const w = worker({ pins: [] });
  await w.send({ type: "GET_STATE" });
  const response = await w.send({
    type: "EMBED",
    origin: "https://perplexity.ai",
    enabled: true,
  });
  assert.equal(response.ok, true, response.error);
  assert.deepEqual(w.chrome.storage.local.data.embedOrigins, [
    "https://perplexity.ai",
  ]);
  assert.equal(w.chrome.declarativeNetRequest.rules.length, 2);
  const patterns = w.chrome.declarativeNetRequest.rules.map(
    (rule) => new RegExp(rule.condition.regexFilter),
  );
  assert.ok(patterns.some((pattern) => pattern.test("https://perplexity.ai/")));
  assert.ok(
    patterns.some((pattern) => pattern.test("https://www.perplexity.ai/")),
  );
  assert.ok(
    patterns.every(
      (pattern) =>
        !pattern.test("https://labs.perplexity.ai/") &&
        !pattern.test("https://perplexity.ai.evil.example/"),
    ),
  );
});

async function cloudSnapshot(pins) {
  const C = require("../core.js");
  return cloudSnapshotOf(C.parse({ pins }).state);
}
// Writes `data` verbatim, so tests can deliver snapshots parse() rejects.
async function cloudSnapshotOf(data) {
  const C = require("../core.js");
  const text = JSON.stringify(data);
  const parts = C.chunks(text);
  const digest = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  ).toString("hex");
  return {
    ...Object.fromEntries(parts.map((part, i) => ["pinned.chunk." + i, part])),
    "pinned.cloud": {
      schema: 2,
      count: parts.length,
      hash: digest,
      time: Date.now(),
    },
  };
}
test("clean device accepts verified cloud snapshot and ignores partial delivery", async () => {
  const w = worker({ pins: [{ url: "local.example" }] });
  await w.send({ type: "GET_STATE" });
  await w.send({ type: "SYNC_NOW" });
  await w.idle();
  const values = await cloudSnapshot([{ url: "remote.example" }]);
  await w.chrome.storage.sync.set({ "pinned.cloud": values["pinned.cloud"] });
  await w.idle();
  assert.equal(
    w.chrome.storage.local.data["pinned.v2"].pins[0].url,
    "https://local.example/",
  );
  await w.chrome.storage.sync.set(values);
  await w.idle();
  assert.equal(
    w.chrome.storage.local.data["pinned.v2"].pins[0].url,
    "https://remote.example/",
  );
});
test("dirty device retains local work on cloud conflict and backs up resolved version", async () => {
  const w = worker({ pins: [{ url: "local.example" }] });
  await w.send({ type: "GET_STATE" });
  await w.send({ type: "SYNC_NOW" });
  await w.idle();
  await w.send({
    type: "MUTATE",
    action: { type: "SAVE_PIN", url: "unsynced.example" },
  });
  await w.chrome.storage.sync.set(
    await cloudSnapshot([{ url: "remote.example" }]),
  );
  await w.idle();
  assert.equal(w.chrome.storage.local.data.syncStatus.conflict, true);
  assert.equal(w.chrome.storage.local.data["pinned.v2"].pins.length, 2);
  assert.equal(
    (await w.send({ type: "RESOLVE_SYNC", choice: "remote" })).ok,
    true,
  );
  assert.equal(
    w.chrome.storage.local.data["pinned.v2"].pins[0].url,
    "https://remote.example/",
  );
  assert.equal(w.chrome.storage.local.data.recoveryBackup.data.pins.length, 2);
});
test("keeping local data on cloud conflict writes the chosen list", async () => {
  const w = worker({ pins: [{ url: "local.example" }] });
  await w.send({ type: "GET_STATE" });
  await w.send({ type: "SYNC_NOW" });
  await w.idle();
  await w.send({
    type: "MUTATE",
    action: { type: "SAVE_PIN", url: "unsynced.example" },
  });
  await w.chrome.storage.sync.set(
    await cloudSnapshot([{ url: "remote.example" }]),
  );
  await w.idle();
  const result = await w.send({ type: "RESOLVE_SYNC", choice: "local" });
  assert.equal(result.ok, true, result.error);
  await w.idle();
  assert.equal(w.chrome.storage.local.data["pinned.v2"].pins.length, 2);
  assert.equal(w.chrome.storage.local.data.syncStatus.conflict, false);
  assert.equal(
    w.chrome.storage.local.data.recoveryBackup.data.pins[0].url,
    "https://remote.example/",
  );
});
test("an unreadable cloud snapshot never blocks a fresh device", async () => {
  // A valid hash over data that parse() rejects (too many workspaces).
  const w = worker(
    await cloudSnapshotOf({
      workspaces: Array.from({ length: 25 }, (_, i) => ({ name: "W" + i })),
      pins: [{ url: "remote.example" }],
    }),
  );
  const result = await w.send({ type: "GET_STATE" });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.state.workspaces.length, 1);
});
test("moving the rail is device-local and does not raise a sync conflict", async () => {
  const w = worker({ pins: [{ url: "local.example" }] });
  await w.send({ type: "GET_STATE" });
  await w.send({ type: "SYNC_NOW" });
  await w.idle();
  let scheduled = 0;
  w.chrome.alarms.create = async () => scheduled++;
  const tab = {
    id: w.chrome.runtime.id,
    url: "https://example.com",
    tab: { id: 1, windowId: 1 },
  };
  const moved = await w.send(
    { type: "OVERLAY_POSITION", x: 10, y: 20, side: "left" },
    tab,
  );
  assert.equal(moved.ok, true, moved.error);
  await w.send({ type: "OVERLAY_WIDTH", width: 300 }, tab);
  await w.send({ type: "MUTATE", action: { type: "TOGGLE_FOLDER", id: "" } });
  assert.equal(w.chrome.storage.local.data.syncStatus.dirty, false);
  assert.equal(scheduled, 0);
  await w.chrome.storage.sync.set(
    await cloudSnapshot([{ url: "remote.example" }]),
  );
  await w.idle();
  const local = w.chrome.storage.local.data;
  assert.notEqual(local.syncStatus.conflict, true);
  assert.equal(local["pinned.v2"].pins[0].url, "https://remote.example/");
  assert.equal(local["pinned.v2"].settings.overlayX, 10);
});
test("context menu pins into the active workspace", async () => {
  const w = worker({ pins: [] });
  await w.send({ type: "GET_STATE" });
  await w.send({
    type: "MUTATE",
    action: { type: "SAVE_WORKSPACE", workspaceId: "second", name: "Hai" },
  });
  await w.chrome.storage.local.set({ activeWorkspaceId: "second" });
  w.chrome.contextMenus.onClicked.listeners[0](
    { menuItemId: "pin-to-sidebar", pageUrl: "https://menu.example/" },
    { id: 3, title: "Menu" },
  );
  await w.idle();
  const pin = w.chrome.storage.local.data["pinned.v2"].pins.find(
    (item) => item.url === "https://menu.example/",
  );
  assert.equal(pin.workspaceId, "second");
});
test("Ctrl+M opens the side panel synchronously to keep the user gesture", async () => {
  const w = worker({ pins: [] });
  w.chrome.commands.onCommand.emit("open-sidebar", { id: 4, windowId: 7 });
  assert.equal(JSON.stringify(w.chrome.sidePanel.opened), '[{"windowId":7}]');
});
test("only overlay-visible changes refresh every open tab", async () => {
  const w = worker({ pins: [{ url: "rail.example" }] });
  await w.send({ type: "GET_STATE" });
  await w.idle();
  const sent = [];
  w.chrome.tabs.query = async () => [
    { id: 1, url: "https://a.example/" },
    { id: 2, url: "https://b.example/", discarded: true },
  ];
  w.chrome.tabs.sendMessage = async (id) => sent.push(id);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  const pin = (await w.send({ type: "GET_STATE" })).state.pins[0];
  await w.send({
    type: "MUTATE",
    action: { type: "SAVE_PIN", id: pin.id, url: pin.url, note: "riêng tư" },
  });
  await settle();
  assert.deepEqual(sent, []);
  await w.send({
    type: "MUTATE",
    action: { type: "SAVE_PIN", id: pin.id, url: pin.url, title: "Mới" },
  });
  await settle();
  assert.deepEqual(sent, [1]);
  const overlay = await w.send({ type: "OVERLAY_STATE" });
  assert.equal(overlay.settings.sync, undefined);
  assert.equal(overlay.settings.theme, "system");
});
const { bookmarks: bookmarkMock } = require("./bookmark-mock.cjs");
async function linkedWorker() {
  const bm = bookmarkMock();
  const [rootId] = bm.seed("1", [
    {
      title: "Công việc",
      children: [
        { title: "Docs", url: "https://docs.test" },
        {
          title: "Nhóm",
          children: [{ title: "Repo", url: "https://repo.test" }],
        },
      ],
    },
  ]);
  const w = worker({ pins: [] }, { bookmarks: bm });
  await w.send({ type: "GET_STATE" });
  const linked = await w.send({
    type: "BOOKMARK_LINK",
    rootId,
    newWorkspaceName: "Liên kết",
  });
  assert.equal(linked.ok, true, linked.error);
  const state = () => w.chrome.storage.local.data["pinned.v2"];
  const pins = () =>
    state().pins.filter((pin) => pin.workspaceId === linked.workspaceId);
  const link = () => w.chrome.storage.local.data.bookmarkLinks[0];
  return { bm, rootId, w, workspaceId: linked.workspaceId, state, pins, link };
}
test("linking previews counts, mirrors a bookmark folder and refuses doubles", async () => {
  const bm = bookmarkMock();
  const [rootId] = bm.seed("1", [
    { title: "F", children: [{ title: "A", url: "https://a.test" }] },
  ]);
  const w = worker({ pins: [] }, { bookmarks: bm });
  await w.send({ type: "GET_STATE" });
  const preview = await w.send({
    type: "BOOKMARK_LINK",
    rootId,
    newWorkspaceName: "Mới",
    dryRun: true,
  });
  assert.equal(preview.stats.added, 1);
  assert.equal(w.chrome.storage.local.data["pinned.v2"].workspaces.length, 1);
  const first = await w.send({
    type: "BOOKMARK_LINK",
    rootId,
    newWorkspaceName: "Mới",
  });
  assert.equal(first.ok, true);
  assert.equal(
    w.chrome.storage.local.data.bookmarkLinks[0].rootPath,
    "Bookmarks bar › F",
  );
  const again = await w.send({
    type: "BOOKMARK_LINK",
    rootId,
    newWorkspaceName: "Khác",
  });
  assert.match(again.error, /đã liên kết/);
});
test("sidebar edits reach bookmarks and the echo does not commit again", async () => {
  const t = await linkedWorker();
  assert.deepEqual(
    t.pins().map((p) => p.title),
    ["Docs", "Repo"],
  );
  const docs = t.pins()[0];
  await t.w.send({
    type: "MUTATE",
    action: {
      type: "SAVE_PIN",
      id: docs.id,
      url: "https://docs.test/new",
      title: "Tài liệu",
      workspaceId: t.workspaceId,
      tags: ["giữ"],
    },
  });
  await t.w.send({
    type: "MUTATE",
    action: {
      type: "SAVE_PIN",
      url: "https://new.test",
      title: "Mới",
      workspaceId: t.workspaceId,
    },
  });
  assert.deepEqual(t.bm.titles(t.rootId), [
    "Tài liệu",
    ["Nhóm", ["Repo"]],
    "Mới",
  ]);
  const revision = t.state().revision;
  await t.w.pullNow();
  assert.equal(t.state().revision, revision, "echo of our own push is a no-op");
});
test("bookmark edits reach the workspace and keep pin metadata", async () => {
  const t = await linkedWorker();
  const docs = t.pins()[0];
  await t.w.send({
    type: "MUTATE",
    action: {
      type: "SAVE_PIN",
      id: docs.id,
      url: docs.url,
      title: docs.title,
      workspaceId: t.workspaceId,
      note: "ghi chú",
      favorite: true,
    },
  });
  const bmId = Object.keys(t.link().map.pins).find(
    (id) => t.link().map.pins[id] === docs.id,
  );
  await t.bm.update(bmId, { title: "Docs v2" });
  await t.w.pullNow();
  const updated = t.pins().find((p) => p.id === docs.id);
  assert.equal(updated.title, "Docs v2");
  assert.equal(updated.note, "ghi chú");
  assert.equal(updated.favorite, true);
});
test("deleted bookmark folder marks the link broken but keeps the pins", async () => {
  const t = await linkedWorker();
  await t.bm.removeTree(t.rootId);
  await t.w.pullNow();
  assert.equal(t.link().status, "broken");
  assert.equal(t.pins().length, 2);
  const resync = await t.w.send({
    type: "BOOKMARK_RESYNC",
    workspaceId: t.workspaceId,
  });
  assert.equal(resync.ok, false);
});
test("deleting a linked workspace drops the link and keeps the bookmarks", async () => {
  const t = await linkedWorker();
  const result = await t.w.send({
    type: "MUTATE",
    action: { type: "DELETE_WORKSPACE", id: t.workspaceId },
  });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(t.w.chrome.storage.local.data.bookmarkLinks, []);
  assert.deepEqual(t.bm.titles(t.rootId), ["Docs", ["Nhóm", ["Repo"]]]);
});
test("bookmark messages explain a missing permission", async () => {
  const w = worker({ pins: [] });
  const result = await w.send({
    type: "BOOKMARK_LINK",
    rootId: "1",
    workspaceId: "workspace-default",
  });
  assert.match(result.error, /cho phép truy cập bookmark/);
});
test("export creates a bookmark folder; copy adds bookmarks without a link", async () => {
  const bm = bookmarkMock();
  const w = worker({ pins: [] }, { bookmarks: bm });
  const state = (await w.send({ type: "GET_STATE" })).state;
  await w.send({
    type: "MUTATE",
    action: { type: "SAVE_FOLDER", folderId: "f", name: "Đọc sau" },
  });
  await w.send({
    type: "MUTATE",
    action: {
      type: "SAVE_PIN",
      url: "https://one.test",
      title: "Một",
      folderId: "f",
    },
  });
  await w.send({
    type: "MUTATE",
    action: { type: "SAVE_PIN", url: "https://two.test", title: "Hai" },
  });
  const exported = await w.send({
    type: "BOOKMARK_EXPORT",
    workspaceId: state.workspaces[0].id,
    parentId: "2",
  });
  assert.equal(exported.ok, true, exported.error);
  assert.deepEqual(bm.titles("2"), [
    ["Pinned · Mặc định", [["Đọc sau", ["Một"]], "Hai"]],
  ]);
  const [source] = bm.seed("1", [
    { title: "Đọc", children: [{ title: "Blog", url: "https://blog.test" }] },
  ]);
  const copied = await w.send({
    type: "BOOKMARK_COPY",
    rootId: source,
    workspaceId: state.workspaces[0].id,
  });
  assert.equal(copied.stats.added, 1);
  assert.equal(w.chrome.storage.local.data.bookmarkLinks, undefined);
});
test("omnibox suggestions escape user text and open the best match", async () => {
  const w = worker({ pins: [] });
  await w.send({ type: "GET_STATE" });
  await w.send({
    type: "MUTATE",
    action: {
      type: "SAVE_PIN",
      url: "https://a.test",
      title: "<b>Tài & liệu</b>",
    },
  });
  await w.send({
    type: "MUTATE",
    action: { type: "SAVE_PIN", url: "https://b.test", title: "Tài khoản" },
  });
  const suggestions = await new Promise((resolve) =>
    w.chrome.omnibox.onInputChanged.emit("tai", resolve),
  );
  assert.match(
    w.chrome.omnibox.defaultSuggestion.description,
    /<match>Tài khoản<\/match>/,
  );
  const escaped = await new Promise((resolve) =>
    w.chrome.omnibox.onInputChanged.emit("lieu", resolve),
  );
  assert.match(
    w.chrome.omnibox.defaultSuggestion.description,
    /&lt;b&gt;Tài &amp; liệu&lt;\/b&gt;/,
  );
  assert.equal(escaped.length, 0);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].content, "https://a.test/");
  assert.match(suggestions[0].description, /&lt;b&gt;/);
  const created = [];
  w.chrome.tabs.create = async (options) => created.push(options);
  w.chrome.omnibox.onInputEntered.emit("tai", "newBackgroundTab");
  await w.idle();
  assert.equal(
    JSON.stringify(created),
    '[{"url":"https://b.test/","active":false}]',
  );
});
