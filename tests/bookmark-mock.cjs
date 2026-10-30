/* In-memory chrome.bookmarks with Chromium's move() index semantics. */
function event() {
  const listeners = [];
  return {
    listeners,
    addListener(fn) {
      listeners.push(fn);
    },
    removeListener(fn) {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    hasListener(fn) {
      return listeners.includes(fn);
    },
    emit(...args) {
      for (const fn of [...listeners]) fn(...args);
    },
  };
}
function bookmarks() {
  let next = 10;
  const nodes = new Map();
  const root = { id: "0", title: "", children: [] };
  nodes.set("0", root);
  const api = {
    nodes,
    onCreated: event(),
    onChanged: event(),
    onRemoved: event(),
    onMoved: event(),
    onChildrenReordered: event(),
    onImportBegan: event(),
    onImportEnded: event(),
    calls: [],
  };
  function add(parentId, data, index) {
    const parent = nodes.get(parentId);
    if (!parent?.children) throw new Error("Can't find parent bookmark.");
    const node = {
      id: String(next++),
      parentId,
      title: data.title || "",
      ...(data.url != null ? { url: data.url } : { children: [] }),
    };
    nodes.set(node.id, node);
    const at = index == null ? parent.children.length : index;
    parent.children.splice(at, 0, node);
    return node;
  }
  function plain(node) {
    const copy = { ...node, index: indexOf(node) };
    if (node.children) copy.children = node.children.map(plain);
    return copy;
  }
  function indexOf(node) {
    return node.parentId ? nodes.get(node.parentId).children.indexOf(node) : 0;
  }
  function get(id) {
    const node = nodes.get(String(id));
    if (!node) throw new Error("Can't find bookmark for id.");
    return node;
  }
  // Fixed roots like Chromium: "1" bookmarks bar, "2" other bookmarks.
  for (const title of ["Bookmarks bar", "Other bookmarks"]) {
    const node = add("0", { title });
    nodes.delete(node.id);
    node.id = String(root.children.length);
    nodes.set(node.id, node);
  }
  Object.assign(api, {
    seed(parentId, tree) {
      const ids = [];
      for (const item of tree) {
        const node = add(parentId, item);
        ids.push(node.id);
        if (item.children) api.seed(node.id, item.children);
      }
      return ids;
    },
    async getTree() {
      return [plain(root)];
    },
    async getSubTree(id) {
      return [plain(get(id))];
    },
    async getChildren(id) {
      return get(id).children.map((node) => {
        const copy = plain(node);
        delete copy.children;
        return copy;
      });
    },
    async get(id) {
      const node = plain(get(id));
      delete node.children;
      return [node];
    },
    async create({ parentId = "2", index, title, url }) {
      api.calls.push(["create", title]);
      const node = add(String(parentId), { title, url }, index);
      const out = plain(node);
      api.onCreated.emit(node.id, out);
      return out;
    },
    async update(id, changes) {
      api.calls.push(["update", id]);
      const node = get(id);
      if (changes.title != null) node.title = changes.title;
      if (changes.url != null && node.url != null) node.url = changes.url;
      api.onChanged.emit(node.id, { title: node.title, url: node.url });
      return plain(node);
    },
    async move(id, { parentId, index }) {
      api.calls.push(["move", id]);
      const node = get(id);
      const oldParent = nodes.get(node.parentId);
      const oldIndex = oldParent.children.indexOf(node);
      const parent = parentId == null ? oldParent : get(parentId);
      let at = index == null ? parent.children.length : index;
      oldParent.children.splice(oldIndex, 1);
      if (parent === oldParent && at > oldIndex) at--;
      parent.children.splice(Math.min(at, parent.children.length), 0, node);
      node.parentId = parent.id;
      api.onMoved.emit(node.id, {
        parentId: parent.id,
        index: at,
        oldParentId: oldParent.id,
        oldIndex,
      });
      return plain(node);
    },
    async remove(id) {
      api.calls.push(["remove", id]);
      const node = get(id);
      if (node.children?.length)
        throw new Error("Can't remove non-empty folder.");
      const parent = nodes.get(node.parentId);
      const index = parent.children.indexOf(node);
      parent.children.splice(index, 1);
      nodes.delete(node.id);
      api.onRemoved.emit(node.id, {
        parentId: parent.id,
        index,
        node: plain(node),
      });
    },
    async removeTree(id) {
      const node = get(id);
      for (const child of [...(node.children || [])])
        await api.removeTree(child.id);
      await api.remove(id);
    },
    titles(id) {
      return get(id).children.map((node) =>
        node.children ? [node.title, api.titles(node.id)] : node.title,
      );
    },
  });
  return api;
}
module.exports = { bookmarks, event };
