const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");

test("URL validation rejects executable schemes, credentials and invalid hosts", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<h1>x</h1>",
    "file:///C:/secret",
    "edge://settings",
    "https://",
    "https://not a host",
    "https://user:pass@example.com",
    42,
    null,
  ]) {
    assert.throws(() => C.url(value), String(value));
  }
  assert.equal(C.url(" example.com "), "https://example.com/");
  assert.equal(C.url("localhost:8080/path"), "https://localhost:8080/path");
  assert.equal(C.url("https://EXAMPLE.com:443"), "https://example.com/");
});
test("theme settings accept black and pastel palettes", () => {
  assert.equal(C.settings({ theme: "black" }).theme, "black");
  assert.equal(C.settings({ theme: "pastel" }).theme, "pastel");
  assert.equal(C.settings({ theme: "neon" }).theme, "system");
});
test("icon rail position persists safely and can return to its default edge", () => {
  assert.equal(C.settings({ overlayX: 195, overlayY: 320 }).overlayX, 195);
  assert.equal(C.settings({ overlayX: 195, overlayY: 320 }).overlayY, 320);
  assert.equal(C.settings({ overlayX: null, overlayY: null }).overlayX, null);
  assert.equal(C.settings({ overlayX: -1, overlayY: 10001 }).overlayX, 0);
  assert.equal(C.settings({ overlayX: -1, overlayY: 10001 }).overlayY, 10000);
});
test("legacy migration preserves folders, reports invalid and duplicate pins", () => {
  const { state, skipped } = C.parse(
    {
      pins: [
        { url: "example.com", title: "A", folder: "Công việc" },
        { url: "https://example.com/", title: "Duplicate" },
        { url: "javascript:alert(1)" },
        { url: "https://other.example", folder: "Công việc" },
      ],
      settings: { theme: "dark", collapsed: ["Công việc"], overlayWidth: 900 },
    },
    { migration: true },
  );
  assert.equal(state.pins.length, 2);
  assert.equal(skipped, 2);
  assert.equal(state.folders.length, 1);
  assert.equal(state.pins[0].folderId, state.pins[1].folderId);
  assert.deepEqual(state.settings.collapsed, [state.folders[0].id]);
  assert.equal(state.settings.overlayWidth, 420);
});
test("strict import is all-or-nothing for malformed rows", () => {
  assert.throws(
    () => C.parse([{ url: "example.com" }, { url: "javascript:alert(1)" }]),
    /Trang số 2/,
  );
  assert.throws(() => C.parse({ pins: [], schema: 99 }), /Phiên bản/);
});
test("empty folders and untrusted markup survive as plain data", () => {
  const data = C.parse({
    schema: 2,
    pins: [],
    folders: [{ id: "x", name: "<img src=x>" }],
  }).state;
  assert.equal(data.folders[0].name, "<img src=x>");
  assert.equal(data.pins.length, 0);
});
test("mutations are immutable and reject duplicate URLs", () => {
  const original = C.empty();
  const next = C.reduce(original, { type: "SAVE_PIN", url: "example.com" });
  assert.equal(original.pins.length, 0);
  assert.equal(next.pins.length, 1);
  assert.throws(
    () => C.reduce(next, { type: "SAVE_PIN", url: "https://EXAMPLE.com/" }),
    /đã được ghim/,
  );
});
test("move before/end and transfer between folders keeps unique IDs", () => {
  let state = C.parse({
    pins: [
      { url: "a.example", folder: "Work" },
      { url: "b.example", folder: "Work" },
      { url: "c.example", folder: "Other" },
    ],
  }).state;
  const [a, b, c] = state.pins;
  state = C.reduce(state, {
    type: "REORDER",
    id: a.id,
    folderId: c.folderId,
    beforeId: c.id,
  });
  assert.deepEqual(
    state.pins.map((p) => p.id),
    [b.id, a.id, c.id],
  );
  assert.equal(state.pins[1].folderId, c.folderId);
  state = C.reduce(state, {
    type: "REORDER",
    id: a.id,
    folderId: c.folderId,
    beforeId: "",
  });
  assert.deepEqual(
    state.pins.map((p) => p.id),
    [b.id, c.id, a.id],
  );
  assert.equal(new Set(state.pins.map((p) => p.id)).size, 3);
});
test("collections can move up, down and restore their original order", () => {
  let state = C.parse({
    folders: [
      { name: "Hằng ngày" },
      { name: "Công việc" },
      { name: "Đọc sau" },
    ],
    pins: [],
  }).state;
  const original = state.folders.map((folder) => folder.id);
  state = C.reduce(state, {
    type: "REORDER_FOLDER",
    id: original[2],
    beforeId: original[0],
  });
  assert.deepEqual(
    state.folders.map((folder) => folder.id),
    [original[2], original[0], original[1]],
  );
  state = C.reduce(state, { type: "SET_FOLDER_ORDER", ids: original });
  assert.deepEqual(
    state.folders.map((folder) => folder.id),
    original,
  );
  assert.throws(
    () => C.reduce(state, { type: "SET_FOLDER_ORDER", ids: [original[0]] }),
    /Thứ tự bộ sưu tập không hợp lệ/,
  );
});
test("delete folder retains its pins and undo delete does not overwrite another pin", () => {
  let state = C.parse({ pins: [{ url: "a.example", folder: "Work" }] }).state;
  state = C.reduce(state, { type: "DELETE_FOLDER", id: state.folders[0].id });
  assert.equal(state.pins.length, 1);
  assert.equal(state.pins[0].folderId, "");
  const pin = state.pins[0];
  state = C.reduce(state, { type: "DELETE_PIN", id: pin.id });
  state = C.reduce(state, { type: "RESTORE_PIN", pin, index: 0 });
  assert.equal(state.pins[0].url, pin.url);
  assert.throws(
    () => C.reduce(state, { type: "RESTORE_PIN", pin, index: 0 }),
    /đã có/,
  );
});
test("merge deduplicates URLs and merges folders by name", () => {
  let state = C.parse({ pins: [{ url: "a.example", folder: "Work" }] }).state;
  state = C.reduce(state, {
    type: "IMPORT",
    mode: "merge",
    data: {
      pins: [
        { url: "a.example", folder: "Work" },
        { url: "b.example", folder: "Work" },
      ],
    },
  });
  assert.equal(state.pins.length, 2);
  assert.equal(state.folders.length, 1);
  assert.equal(state.pins[0].folderId, state.pins[1].folderId);
  assert.throws(() =>
    C.reduce(state, { type: "IMPORT", mode: "cancel", data: { pins: [] } }),
  );
});
test("Unicode, quotes and backslashes split into sync-safe chunks without corruption", () => {
  const text = JSON.stringify({ text: 'Tiếng Việt 🐾 " \\ \n'.repeat(4000) });
  const chunks = C.chunks(text);
  assert.equal(chunks.join(""), text);
  for (let i = 0; i < chunks.length; i++)
    assert.ok(
      Buffer.byteLength("pinned.chunk." + i + JSON.stringify(chunks[i])) <=
        8192,
    );
  assert.deepEqual(JSON.parse(chunks.join("")), JSON.parse(text));
});
test("large local collection is independent of sync per-key quota", () => {
  const state = C.parse({
    pins: Array.from({ length: 1200 }, (_, i) => ({
      url: `https://example.com/${i}`,
      title: `Trang ${i}`,
    })),
  }).state;
  assert.equal(state.pins.length, 1200);
  assert.ok(Buffer.byteLength(JSON.stringify(state)) > 8192);
});
