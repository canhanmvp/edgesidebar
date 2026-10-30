/* Pure bookmark <-> workspace reconciliation. No chrome.* calls: the worker
   reads the bookmark subtree, asks these functions what to change, then
   applies it. Shared by the worker and Node tests. */
(function (root) {
  "use strict";
  const C =
    root.Pinned || (typeof require === "function" && require("./core.js"));
  const MAX_LINKED_URLS = 2000;
  const MAX_LINKED_FOLDERS = 100;
  function emptyMap() {
    return { pins: {}, folders: {} };
  }
  function cleanUrl(value) {
    try {
      return C.url(value);
    } catch {
      return "";
    }
  }
  // Flattens a getSubTree() node: direct links of the root stay unfiled, every
  // first-level folder becomes one collection and deeper folders fold into it.
  function index(rootNode) {
    const nodes = new Map();
    const topFolders = [];
    const links = [];
    let skipped = 0;
    function walk(node, top) {
      for (const child of node.children || []) {
        if (child.url == null) {
          const folderTop = top ?? child.id;
          nodes.set(child.id, { node: child, top: top ?? "", folder: true });
          if (top == null) topFolders.push(child);
          walk(child, folderTop);
          continue;
        }
        nodes.set(child.id, { node: child, top: top ?? "", folder: false });
        const address = cleanUrl(child.url);
        if (!address || !/^https?:/i.test(child.url)) {
          skipped++;
          continue;
        }
        links.push({ node: child, url: address, top: top ?? "" });
      }
    }
    walk(rootNode, null);
    return { nodes, topFolders, links, skipped };
  }
  function limits(tree) {
    if (tree.links.length > MAX_LINKED_URLS)
      throw new Error(
        `Thư mục có hơn ${MAX_LINKED_URLS} bookmark. Hãy chọn thư mục nhỏ hơn.`,
      );
    if (tree.topFolders.length > MAX_LINKED_FOLDERS)
      throw new Error(
        `Thư mục có hơn ${MAX_LINKED_FOLDERS} thư mục con. Hãy chọn thư mục nhỏ hơn.`,
      );
  }
  function folderName(node) {
    return (node.title || "").trim().slice(0, 80) || "Không tên";
  }
  function pinTitle(node, address) {
    return (node.title || "").trim().slice(0, 180) || C.host(address);
  }
  // Visible content of a workspace: folder order plus pin order per folder.
  // Pins of different folders may interleave in state.pins without any
  // visible difference, so that order is deliberately ignored.
  function signature(folders, pins) {
    const groups = new Map([["", []]]);
    for (const folder of folders) groups.set(folder.id, []);
    for (const pin of pins) {
      if (!groups.has(pin.folderId)) groups.set(pin.folderId, []);
      groups
        .get(pin.folderId)
        .push([
          pin.id,
          pin.title,
          pin.url,
          pin.tags || [],
          pin.note || "",
          pin.favorite === true,
        ]);
    }
    return JSON.stringify([
      folders.map((folder) => [folder.id, folder.name]),
      [...groups],
    ]);
  }
  /* Bookmarks -> workspace. mode "link" makes the workspace mirror the folder
     (keeping tags/notes/favorites); mode "copy" only adds missing sites. */
  function planPull(state, link, rootNode, { mode = "link" } = {}) {
    const workspaceId = link.workspaceId;
    const map = link.map || emptyMap();
    const tree = index(rootNode);
    limits(tree);
    const currentFolders = state.folders.filter(
      (item) => item.workspaceId === workspaceId,
    );
    const currentPins = state.pins.filter(
      (item) => item.workspaceId === workspaceId,
    );
    const folderById = new Map(currentFolders.map((item) => [item.id, item]));
    const pinById = new Map(currentPins.map((item) => [item.id, item]));
    const nextMap = emptyMap();
    const stats = {
      added: 0,
      updated: 0,
      removed: 0,
      skipped: tree.skipped,
      duplicates: 0,
    };
    // Folders: mapped ID, then same name, then a new collection.
    const folders =
      mode === "copy" ? currentFolders.map((f) => ({ ...f })) : [];
    const byName = new Map(
      folders.map((folder) => [folder.name.toLocaleLowerCase("vi"), folder]),
    );
    const usedFolders = new Set(folders.map((folder) => folder.id));
    const topToFolder = new Map();
    for (const node of tree.topFolders) {
      const name = folderName(node);
      const key = name.toLocaleLowerCase("vi");
      let folder = byName.get(key);
      if (!folder) {
        const mapped = folderById.get(map.folders[node.id]);
        const sameName = currentFolders.find(
          (item) =>
            item.name.toLocaleLowerCase("vi") === key &&
            !usedFolders.has(item.id),
        );
        const reuse =
          mapped && !usedFolders.has(mapped.id) ? mapped : sameName || null;
        folder = { id: reuse?.id || C.uid(), name, workspaceId };
        usedFolders.add(folder.id);
        byName.set(key, folder);
        folders.push(folder);
      }
      topToFolder.set(node.id, folder.id);
      nextMap.folders[node.id] = folder.id;
    }
    // Pins: mapped ID, then same URL, then a new pin. First URL wins.
    const pins = [];
    const usedPins = new Set();
    const urls = new Set();
    const byUrl = new Map(currentPins.map((pin) => [pin.url, pin]));
    if (mode === "copy")
      for (const pin of currentPins) {
        pins.push({ ...pin });
        usedPins.add(pin.id);
        urls.add(pin.url);
      }
    for (const item of tree.links) {
      if (urls.has(item.url)) {
        if (mode === "copy") {
          const existing = byUrl.get(item.url);
          if (existing) nextMap.pins[item.node.id] = existing.id;
        } else stats.duplicates++;
        continue;
      }
      const folderId = item.top ? topToFolder.get(item.top) || "" : "";
      const mapped = pinById.get(map.pins[item.node.id]);
      const sameUrl = byUrl.get(item.url);
      const existing =
        mapped && !usedPins.has(mapped.id)
          ? mapped
          : sameUrl && !usedPins.has(sameUrl.id)
            ? sameUrl
            : null;
      const pin = {
        id: existing?.id || C.uid(),
        title: pinTitle(item.node, item.url),
        url: item.url,
        folderId,
        workspaceId,
        tags: existing?.tags || [],
        note: existing?.note || "",
        favorite: existing?.favorite === true,
      };
      if (!existing) stats.added++;
      else if (
        existing.title !== pin.title ||
        existing.url !== pin.url ||
        existing.folderId !== pin.folderId
      )
        stats.updated++;
      pins.push(pin);
      usedPins.add(pin.id);
      urls.add(item.url);
      nextMap.pins[item.node.id] = pin.id;
    }
    if (mode !== "copy") {
      const mappedPinIds = new Set(Object.values(map.pins));
      const mappedFolderIds = new Set(Object.values(map.folders));
      // Collections created in the sidebar and not pushed yet stay; mapped
      // ones whose bookmark folder disappeared are removed with it.
      for (const folder of currentFolders)
        if (!usedFolders.has(folder.id) && !mappedFolderIds.has(folder.id)) {
          folders.push({ ...folder });
          usedFolders.add(folder.id);
        }
      for (const pin of currentPins) {
        if (usedPins.has(pin.id)) continue;
        if (mappedPinIds.has(pin.id) || urls.has(pin.url)) {
          stats.removed++;
          continue;
        }
        pins.push({
          ...pin,
          folderId: usedFolders.has(pin.folderId) ? pin.folderId : "",
        });
        urls.add(pin.url);
      }
    }
    const changed =
      signature(folders, pins) !== signature(currentFolders, currentPins);
    return { folders, pins, map: nextMap, stats, changed };
  }
  /* Workspace -> bookmarks. Returns ops for the worker to run in order. It
     only ever removes bookmarks it has mapped, never folders with content. */
  function planPush(state, link, rootNode) {
    const workspaceId = link.workspaceId;
    const map = link.map || emptyMap();
    const tree = index(rootNode);
    const folders = state.folders.filter(
      (item) => item.workspaceId === workspaceId,
    );
    const pins = state.pins.filter((item) => item.workspaceId === workspaceId);
    const nextMap = emptyMap();
    const ops = [];
    const topFolderIds = new Set(tree.topFolders.map((node) => node.id));
    const folderToBm = new Map();
    const usedBm = new Set();
    for (const [bmId, folderId] of Object.entries(map.folders))
      if (topFolderIds.has(bmId) && !folderToBm.has(folderId))
        folderToBm.set(folderId, bmId);
    for (const folder of folders) {
      let bmId = folderToBm.get(folder.id);
      if (!bmId) {
        const key = folder.name.toLocaleLowerCase("vi");
        bmId = tree.topFolders.find(
          (node) =>
            !usedBm.has(node.id) &&
            !Object.hasOwn(map.folders, node.id) &&
            folderName(node).toLocaleLowerCase("vi") === key,
        )?.id;
      }
      if (bmId) {
        usedBm.add(bmId);
        nextMap.folders[bmId] = folder.id;
        if (folderName(tree.nodes.get(bmId).node) !== folder.name)
          ops.push({ op: "renameFolder", bmId, title: folder.name });
      } else
        ops.push({
          op: "createFolder",
          folderId: folder.id,
          title: folder.name,
        });
    }
    const liveFolders = new Set(folders.map((folder) => folder.id));
    const pinToBm = new Map();
    for (const [bmId, pinId] of Object.entries(map.pins)) {
      const entry = tree.nodes.get(bmId);
      if (entry && !entry.folder && !pinToBm.has(pinId))
        pinToBm.set(pinId, bmId);
    }
    const linkByUrl = new Map();
    for (const item of tree.links)
      if (!Object.hasOwn(map.pins, item.node.id) && !linkByUrl.has(item.url))
        linkByUrl.set(item.url, item.node.id);
    // The collection a bookmark currently sits in ("" = directly in root).
    const containerOf = (top) =>
      top ? (nextMap.folders[top] ?? map.folders[top] ?? null) : "";
    for (const pin of pins) {
      const folderId = liveFolders.has(pin.folderId) ? pin.folderId : "";
      let bmId = pinToBm.get(pin.id);
      if (!bmId && linkByUrl.has(pin.url)) {
        bmId = linkByUrl.get(pin.url);
        linkByUrl.delete(pin.url);
      }
      if (!bmId) {
        ops.push({
          op: "create",
          pinId: pin.id,
          folderId,
          title: pin.title,
          url: pin.url,
        });
        continue;
      }
      nextMap.pins[bmId] = pin.id;
      const entry = tree.nodes.get(bmId);
      const node = entry.node;
      if ((node.title || "") !== pin.title || cleanUrl(node.url) !== pin.url)
        ops.push({ op: "update", bmId, title: pin.title, url: pin.url });
      // A bookmark inside any subfolder of the right collection is in place.
      if (containerOf(entry.top) !== folderId)
        ops.push({ op: "move", bmId, folderId });
    }
    const livePins = new Set(pins.map((pin) => pin.id));
    for (const [bmId, pinId] of Object.entries(map.pins)) {
      const entry = tree.nodes.get(bmId);
      if (entry && !entry.folder && !livePins.has(pinId) && !nextMap.pins[bmId])
        ops.push({ op: "remove", bmId });
    }
    for (const [bmId, folderId] of Object.entries(map.folders))
      if (
        topFolderIds.has(bmId) &&
        !liveFolders.has(folderId) &&
        !nextMap.folders[bmId]
      )
        ops.push({ op: "removeFolderIfEmpty", bmId });
    ops.push({
      op: "orderFolders",
      folderIds: folders.map((folder) => folder.id),
    });
    for (const container of ["", ...folders.map((folder) => folder.id)])
      ops.push({
        op: "order",
        folderId: container,
        pinIds: pins
          .filter(
            (pin) =>
              (liveFolders.has(pin.folderId) ? pin.folderId : "") === container,
          )
          .map((pin) => pin.id),
      });
    return { ops, map: nextMap };
  }
  /* Moves that put `desired` (a subset of `children`, by id) in order while
     every other bookmark keeps its slot. Indexes follow chrome.bookmarks.move:
     moving down within one parent counts the moved node's old slot. */
  function reorderMoves(children, desired) {
    const list = [...children];
    const wanted = desired.filter((id) => list.includes(id));
    const slots = list
      .map((id, i) => (wanted.includes(id) ? i : -1))
      .filter((i) => i >= 0);
    const moves = [];
    wanted.forEach((id, k) => {
      const from = list.indexOf(id);
      const to = slots[k];
      if (from === to) return;
      list.splice(from, 1);
      list.splice(to, 0, id);
      moves.push({ id, index: to > from ? to + 1 : to });
    });
    return moves;
  }
  /* Runs planPush() ops against a chrome.bookmarks-compatible API. Returns the
     updated map and the number of ops that failed (e.g. a bookmark removed
     meanwhile); the next reconcile repairs those. */
  async function applyOps(bookmarks, rootId, plan) {
    const map = {
      pins: { ...plan.map.pins },
      folders: { ...plan.map.folders },
    };
    const folderBm = (folderId) =>
      folderId
        ? Object.keys(map.folders).find((id) => map.folders[id] === folderId) ||
          rootId
        : rootId;
    const pinBm = (pinId) =>
      Object.keys(map.pins).find((id) => map.pins[id] === pinId);
    async function order(parentId, desired) {
      const children = (await bookmarks.getChildren(parentId)).map(
        (node) => node.id,
      );
      for (const move of reorderMoves(children, desired.filter(Boolean)))
        await bookmarks.move(move.id, { parentId, index: move.index });
    }
    let failed = 0;
    for (const op of plan.ops) {
      try {
        if (op.op === "createFolder") {
          const node = await bookmarks.create({
            parentId: rootId,
            title: op.title,
          });
          map.folders[node.id] = op.folderId;
        } else if (op.op === "renameFolder")
          await bookmarks.update(op.bmId, { title: op.title });
        else if (op.op === "create") {
          const node = await bookmarks.create({
            parentId: folderBm(op.folderId),
            title: op.title,
            url: op.url,
          });
          map.pins[node.id] = op.pinId;
        } else if (op.op === "update")
          await bookmarks.update(op.bmId, { title: op.title, url: op.url });
        else if (op.op === "move")
          await bookmarks.move(op.bmId, { parentId: folderBm(op.folderId) });
        else if (op.op === "remove") await bookmarks.remove(op.bmId);
        else if (op.op === "removeFolderIfEmpty") {
          if (!(await bookmarks.getChildren(op.bmId)).length)
            await bookmarks.remove(op.bmId);
        } else if (op.op === "orderFolders")
          await order(
            rootId,
            op.folderIds
              .map((id) => folderBm(id))
              .filter((id) => id !== rootId),
          );
        else if (op.op === "order")
          await order(folderBm(op.folderId), op.pinIds.map(pinBm));
      } catch {
        failed++;
      }
    }
    return { map, failed };
  }
  const api = {
    MAX_LINKED_URLS,
    MAX_LINKED_FOLDERS,
    emptyMap,
    index,
    planPull,
    planPush,
    reorderMoves,
    applyOps,
  };
  root.BookmarkSync = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
