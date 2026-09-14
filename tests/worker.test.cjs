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
function worker(initial = {}) {
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
    sidePanel: { async open() {}, async setPanelBehavior() {} },
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
  });
  context.importScripts = (file) =>
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
      context,
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
  const text = JSON.stringify(C.parse({ pins }).state);
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
