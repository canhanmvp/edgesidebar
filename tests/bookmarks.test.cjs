const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");
const B = require("../bookmarks-core.js");
const { bookmarks } = require("./bookmark-mock.cjs");

function setup(tree) {
  const bm = bookmarks();
  const [rootId] = bm.seed("1", [{ title: "Công việc", children: tree }]);
  const state = C.reduce(C.empty(), {
    type: "SAVE_WORKSPACE",
    workspaceId: "ws",
    name: "Liên kết",
  });
  return {
    bm,
    rootId,
    state,
    link: { workspaceId: "ws", rootId, map: B.emptyMap() },
  };
}
async function pull(ctx, mode) {
  const [node] = await ctx.bm.getSubTree(ctx.rootId);
  const plan = B.planPull(ctx.state, ctx.link, node, { mode });
  if (plan.changed)
    ctx.state = C.reduce(ctx.state, {
      type: "REPLACE_WORKSPACE_ITEMS",
      workspaceId: "ws",
      folders: plan.folders,
      pins: plan.pins,
    });
  ctx.link.map = plan.map;
  return plan;
}
async function push(ctx) {
  const [node] = await ctx.bm.getSubTree(ctx.rootId);
  const plan = B.planPush(ctx.state, ctx.link, node);
  const result = await B.applyOps(ctx.bm, ctx.rootId, plan);
  ctx.link.map = result.map;
  return { plan, result };
}
const wsPins = (ctx) => ctx.state.pins.filter((p) => p.workspaceId === "ws");
const wsFolders = (ctx) =>
  ctx.state.folders.filter((f) => f.workspaceId === "ws");

test("reorderMoves follows Chromium move() indexes and keeps other slots", async () => {
  const bm = bookmarks();
  const ids = bm.seed(
    "2",
    ["a", "x", "b", "c", "y"].map((title) => ({
      title,
      url: "https://" + title + ".test",
    })),
  );
  const [a, x, b, c, y] = ids;
  for (const move of B.reorderMoves(ids, [c, a, b]))
    await bm.move(move.id, { parentId: "2", index: move.index });
  assert.deepEqual(bm.titles("2"), ["c", "x", "a", "b", "y"]);
  assert.deepEqual(B.reorderMoves([a, b], [a, b]), []);
  // Moving down within one parent passes the slot after the target.
  const down = bookmarks();
  const [d1, d2, d3] = down.seed(
    "2",
    ["1", "2", "3"].map((title) => ({
      title,
      url: "https://n" + title + ".test",
    })),
  );
  for (const move of B.reorderMoves([d1, d2, d3], [d2, d3, d1]))
    await down.move(move.id, { parentId: "2", index: move.index });
  assert.deepEqual(down.titles("2"), ["2", "3", "1"]);
  (void x, y);
});

test("pull mirrors links, first-level folders, flattens deeper folders and skips junk", async () => {
  const ctx = setup([
    { title: "Google", url: "https://google.com" },
    { title: "Script", url: "javascript:alert(1)" },
    { title: "Settings", url: "chrome://settings" },
    {
      title: "Dev",
      children: [
        { title: "GitHub", url: "https://github.com" },
        {
          title: "Sâu",
          children: [{ title: "MDN", url: "https://developer.mozilla.org" }],
        },
      ],
    },
    { title: "Google again", url: "https://google.com/" },
  ]);
  const plan = await pull(ctx);
  assert.equal(plan.stats.added, 3);
  assert.equal(plan.stats.skipped, 2);
  assert.equal(plan.stats.duplicates, 1);
  assert.deepEqual(
    wsFolders(ctx).map((f) => f.name),
    ["Dev"],
  );
  const dev = wsFolders(ctx)[0].id;
  assert.deepEqual(
    wsPins(ctx).map((p) => [p.title, p.folderId === dev]),
    [
      ["Google", false],
      ["GitHub", true],
      ["MDN", true],
    ],
  );
  assert.equal((await pull(ctx)).changed, false, "second pull is a no-op");
});

test("pull keeps tags, notes and favorites when a bookmark changes", async () => {
  const ctx = setup([{ title: "Docs", url: "https://docs.test" }]);
  await pull(ctx);
  const pin = wsPins(ctx)[0];
  ctx.state = C.reduce(ctx.state, {
    type: "SAVE_PIN",
    id: pin.id,
    url: pin.url,
    title: pin.title,
    workspaceId: "ws",
    tags: ["đọc"],
    note: "ghi chú",
    favorite: true,
  });
  const bmId = Object.keys(ctx.link.map.pins)[0];
  await ctx.bm.update(bmId, { title: "Docs mới", url: "https://docs.test/v2" });
  const plan = await pull(ctx);
  assert.equal(plan.stats.updated, 1);
  const updated = wsPins(ctx)[0];
  assert.equal(updated.id, pin.id);
  assert.equal(updated.url, "https://docs.test/v2");
  assert.deepEqual(updated.tags, ["đọc"]);
  assert.equal(updated.note, "ghi chú");
  assert.equal(updated.favorite, true);
  await ctx.bm.remove(bmId);
  assert.equal((await pull(ctx)).stats.removed, 1);
  assert.equal(wsPins(ctx).length, 0);
});

test("pins added in the sidebar survive a pull and are pushed to bookmarks", async () => {
  const ctx = setup([{ title: "A", url: "https://a.test" }]);
  await pull(ctx);
  ctx.state = C.reduce(ctx.state, {
    type: "SAVE_FOLDER",
    folderId: "f-new",
    name: "Mới",
    workspaceId: "ws",
  });
  ctx.state = C.reduce(ctx.state, {
    type: "SAVE_PIN",
    url: "https://b.test",
    title: "B",
    workspaceId: "ws",
    folderId: "f-new",
  });
  ctx.state = C.reduce(ctx.state, {
    type: "SAVE_PIN",
    url: "https://c.test",
    title: "C",
    workspaceId: "ws",
  });
  assert.equal((await pull(ctx)).changed, false, "unpushed items are kept");
  await push(ctx);
  assert.deepEqual(ctx.bm.titles(ctx.rootId), ["A", ["Mới", ["B"]], "C"]);
  assert.equal((await pull(ctx)).changed, false, "push then pull converges");
  assert.equal(
    (await push(ctx)).plan.ops.filter((op) => !/^order/.test(op.op)).length,
    0,
  );
});

test("push renames, moves, reorders and removes only mapped bookmarks", async () => {
  const ctx = setup([
    { title: "A", url: "https://a.test" },
    { title: "B", url: "https://b.test" },
    { title: "Thủ công", url: "https://manual.test" },
    {
      title: "Nhóm",
      children: [
        { title: "C", url: "https://c.test" },
        { title: "Ghi chú", children: [] },
      ],
    },
  ]);
  await pull(ctx);
  const [a, b, manual] = wsPins(ctx);
  const folder = wsFolders(ctx)[0];
  // The user's own bookmark with the same URL as nothing in the sidebar.
  const [extra] = ctx.bm.seed(ctx.rootId, [
    { title: "Trùng", url: "https://a.test/" },
  ]);
  ctx.state = C.reduce(ctx.state, {
    type: "SAVE_FOLDER",
    id: folder.id,
    name: "Nhóm 2",
  });
  ctx.state = C.reduce(ctx.state, {
    type: "REORDER",
    id: b.id,
    folderId: "",
    beforeId: a.id,
  });
  ctx.state = C.reduce(ctx.state, { type: "DELETE_PIN", id: manual.id });
  ctx.state = C.reduce(ctx.state, {
    type: "REORDER",
    id: a.id,
    folderId: folder.id,
    beforeId: "",
  });
  await push(ctx);
  assert.deepEqual(ctx.bm.titles(ctx.rootId), [
    "B",
    ["Nhóm 2", ["C", ["Ghi chú", []], "A"]],
    "Trùng",
  ]);
  assert.ok(ctx.bm.nodes.has(extra), "unmapped duplicate is untouched");
  // Deleting the collection keeps its sites; the bookmark folder still holds
  // the user's own subfolder, so it is not removed.
  ctx.state = C.reduce(ctx.state, { type: "DELETE_FOLDER", id: folder.id });
  await push(ctx);
  assert.deepEqual(ctx.bm.titles(ctx.rootId), [
    "B",
    ["Nhóm 2", [["Ghi chú", []]]],
    "Trùng",
    "C",
    "A",
  ]);
});

test("copy mode only adds missing sites and never edits existing pins", async () => {
  const ctx = setup([
    { title: "Mới", url: "https://new.test" },
    { title: "Tên khác", url: "https://old.test" },
  ]);
  ctx.state = C.reduce(ctx.state, {
    type: "SAVE_PIN",
    url: "https://old.test",
    title: "Cũ",
    workspaceId: "ws",
    tags: ["x"],
  });
  const plan = await pull(ctx, "copy");
  assert.equal(plan.stats.added, 1);
  assert.deepEqual(
    wsPins(ctx).map((p) => p.title),
    ["Cũ", "Mới"],
  );
});

test("large folders are refused before anything changes", () => {
  const ctx = setup([]);
  const node = {
    id: "big",
    children: Array.from({ length: B.MAX_LINKED_URLS + 1 }, (_, i) => ({
      id: "n" + i,
      title: "x",
      url: `https://site${i}.test`,
    })),
  };
  assert.throws(() => B.planPull(ctx.state, ctx.link, node), /hơn 2000/);
});

test("REPLACE_WORKSPACE_ITEMS validates input and leaves other workspaces alone", () => {
  let state = C.parse({
    schema: 3,
    workspaces: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    folders: [{ id: "fa", name: "F", workspaceId: "a" }],
    pins: [
      { id: "p1", url: "https://one.test", workspaceId: "a", folderId: "fa" },
      { id: "p2", url: "https://two.test", workspaceId: "b" },
    ],
  }).state;
  assert.throws(
    () =>
      C.reduce(state, {
        type: "REPLACE_WORKSPACE_ITEMS",
        workspaceId: "a",
        folders: [],
        pins: [{ url: "javascript:x" }],
      }),
    /http/,
  );
  assert.throws(
    () =>
      C.reduce(state, {
        type: "REPLACE_WORKSPACE_ITEMS",
        workspaceId: "a",
        folders: [],
        pins: [{ url: "https://x.test" }, { url: "https://x.test/" }],
      }),
    /đã được ghim/,
  );
  state = C.reduce(state, { type: "TOGGLE_FOLDER", id: "fa" });
  // An ID owned by another workspace is never reused.
  state = C.reduce(state, {
    type: "REPLACE_WORKSPACE_ITEMS",
    workspaceId: "a",
    folders: [{ id: "fn", name: "Mới" }],
    pins: [
      { id: "p2", url: "https://three.test", folderId: "fn", tags: ["t"] },
    ],
  });
  assert.deepEqual(state.settings.collapsed, []);
  const a = state.pins.filter((p) => p.workspaceId === "a");
  assert.equal(a.length, 1);
  assert.notEqual(a[0].id, "p2");
  assert.equal(a[0].folderId, "fn");
  assert.deepEqual(a[0].tags, ["t"]);
  assert.deepEqual(state.pins.find((p) => p.id === "p2").workspaceId, "b");
});
