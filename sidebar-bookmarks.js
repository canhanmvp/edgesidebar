/* Bookmark tab. Reads chrome.bookmarks directly (optional permission); every
   write that touches pins goes through the worker like the rest of the UI. */
"use strict";
(() => {
  const PERMISSION = { permissions: ["bookmarks"] };
  let granted = false;
  let flat = null; // id -> { node, path } built from getTree(), or null
  let loading = null;
  let currentId = "0";
  let linkSource = null;
  let previewRequest = 0;
  let eventsBound = false;
  async function hasPermission() {
    try {
      return await chrome.permissions.contains(PERMISSION);
    } catch {
      return false;
    }
  }
  async function ensurePermission() {
    if (await hasPermission()) return true;
    if (!(await chrome.permissions.request(PERMISSION)))
      throw new Error("Chưa được cấp quyền truy cập bookmark.");
    await refreshPermission();
    return true;
  }
  function invalidate() {
    flat = null;
    render();
    if (activeView === "pins" && $("search").value.trim()) globalThis.render();
  }
  function bindEvents() {
    if (eventsBound || !chrome.bookmarks) return;
    eventsBound = true;
    let timer;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(invalidate, 250);
    };
    for (const name of [
      "onCreated",
      "onChanged",
      "onRemoved",
      "onMoved",
      "onChildrenReordered",
      "onImportEnded",
    ])
      chrome.bookmarks[name]?.addListener(later);
  }
  async function refreshPermission() {
    granted = await hasPermission();
    $("bookmark-permission-label").textContent = granted
      ? "Tắt bookmark"
      : "Bật bookmark";
    if (granted) bindEvents();
    flat = null;
    render();
  }
  async function load() {
    if (flat) return flat;
    if (!loading)
      loading = chrome.bookmarks
        .getTree()
        .then(([root]) => {
          const map = new Map();
          (function walk(node, path) {
            map.set(node.id, { node, path });
            const next =
              node.id === "0" ? [] : [...path, node.title || "Bookmark"];
            for (const child of node.children || []) walk(child, next);
          })(root, []);
          flat = map;
          return map;
        })
        .finally(() => {
          loading = null;
        });
    return loading;
  }
  function linkFor(rootId) {
    return bookmarkLinks.find((link) => link.rootId === rootId) || null;
  }
  function linkBadge(node) {
    const link = linkFor(node.id);
    if (!link) return null;
    const workspace = state?.workspaces.find(
      (item) => item.id === link.workspaceId,
    );
    const badge = element("span", "bm-linked");
    badge.append(
      makeIcon("link"),
      document.createTextNode(workspace?.name || ""),
    );
    badge.title = "Đã liên kết với không gian " + (workspace?.name || "");
    return badge;
  }
  function isWeb(node) {
    return node.url != null && /^https?:\/\//i.test(node.url);
  }
  function pinnedHere(url) {
    try {
      const address = C.url(url);
      return state.pins.some(
        (pin) => pin.workspaceId === activeWorkspaceId && pin.url === address,
      );
    } catch {
      return false;
    }
  }
  async function pinBookmark(node) {
    await mutate({
      type: "SAVE_PIN",
      url: node.url,
      title: node.title,
      workspaceId: activeWorkspaceId,
    });
    toast(`Đã ghim “${node.title || C.host(C.url(node.url))}”.`);
  }
  // Top-level containers (Bookmarks bar, Other…) and managed bookmarks are
  // fixed by the browser: they cannot be moved, deleted or dropped beside.
  function editable(node) {
    return (
      node.id !== "0" &&
      node.parentId &&
      node.parentId !== "0" &&
      !node.unmodifiable
    );
  }
  function countLinks(node) {
    let count = 0;
    (function walk(item) {
      for (const child of item.children || [])
        if (child.children) walk(child);
        else count++;
    })(node);
    return count;
  }
  async function recreate(node, parentId, index) {
    const created = await chrome.bookmarks.create({
      parentId,
      index,
      title: node.title,
      ...(node.url != null ? { url: node.url } : {}),
    });
    for (const [i, child] of (node.children || []).entries())
      await recreate(child, created.id, i).catch(() => {});
    return created;
  }
  async function deleteBookmark(node) {
    if (!editable(node)) throw new Error("Không thể xóa mục này.");
    const snapshot = flat?.get(node.id)?.node || node;
    if (node.url == null) {
      const inside = new Set();
      (function walk(item) {
        inside.add(item.id);
        (item.children || []).forEach(walk);
      })(snapshot);
      const linked = bookmarkLinks.filter((link) => inside.has(link.rootId));
      const names = linked
        .map(
          (link) =>
            state.workspaces.find((item) => item.id === link.workspaceId)?.name,
        )
        .filter(Boolean);
      const result = await choose(
        "Xóa thư mục bookmark?",
        `Xóa “${node.title || "Bookmark"}” và ${countLinks(snapshot)} bookmark bên trong.` +
          (names.length
            ? ` Liên kết với không gian ${names.map((n) => `“${n}”`).join(", ")} sẽ bị hủy; trang ghim vẫn được giữ.`
            : "") +
          " Có thể hoàn tác trong 10 giây.",
        [{ label: "Xóa thư mục", value: "delete", danger: true }],
      );
      if (result !== "delete") return;
      // Unlink first so the worker does not mirror the deletion into pins.
      for (const link of linked)
        await request("BOOKMARK_UNLINK", { workspaceId: link.workspaceId });
      await chrome.bookmarks.removeTree(node.id);
    } else await chrome.bookmarks.remove(node.id);
    invalidate();
    toast(`Đã xóa “${node.title || node.url || "Bookmark"}”.`, {
      undo: async () => {
        await recreate(snapshot, snapshot.parentId, snapshot.index);
        invalidate();
      },
    });
  }
  // Moves a bookmark before/after a sibling or into a folder. Indexes follow
  // chrome.bookmarks.move(): the position counted before the node is removed.
  async function moveBookmark(id, target, place) {
    const dragged = flat.get(id)?.node;
    if (!dragged || !editable(dragged)) return;
    const parentId = place === "into" ? target.id : target.parentId;
    if (!parentId || parentId === "0") return;
    for (let current = flat.get(parentId); current;) {
      if (current.node.id === id)
        throw new Error("Không thể đưa thư mục vào chính nó.");
      current = current.node.parentId ? flat.get(current.node.parentId) : null;
    }
    const destination = { parentId };
    if (place === "before") destination.index = target.index;
    else if (place === "after") destination.index = target.index + 1;
    await chrome.bookmarks.move(id, destination);
    invalidate();
  }
  // Up/down among the rows shown (non-web links are hidden but keep slots).
  async function step(node, direction) {
    const parent = flat.get(node.parentId)?.node;
    const siblings = (parent?.children || []).filter(
      (child) => child.children || isWeb(child),
    );
    const i = siblings.findIndex((child) => child.id === node.id);
    const target = siblings[i + direction];
    if (!target || !editable(node)) return;
    await moveBookmark(node.id, target, direction < 0 ? "before" : "after");
    setTimeout(() => focusRow(node.id), 350);
  }
  function focusRow(id) {
    [...$("bm-list").querySelectorAll("[data-bm]")]
      .find((row) => row.dataset.bm === id)
      ?.querySelector(".pin-link")
      ?.focus();
  }
  function editEntries(node) {
    if (!editable(node)) return [];
    return [
      null,
      { label: "Đưa lên trên", icon: "up", action: () => step(node, -1) },
      { label: "Đưa xuống dưới", icon: "down", action: () => step(node, 1) },
      {
        label: node.url == null ? "Xóa thư mục" : "Xóa bookmark",
        icon: "trash",
        danger: true,
        action: () => deleteBookmark(node),
      },
    ];
  }
  function rowKeys(row, node) {
    row.dataset.bm = node.id;
    row.addEventListener("keydown", (event) => {
      if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        run(null, () => step(node, event.key === "ArrowUp" ? -1 : 1));
      } else if (event.key === "Delete" && editable(node)) {
        event.preventDefault();
        run(null, () => deleteBookmark(node));
      }
    });
  }
  function asPin(node) {
    return {
      id: "bookmark:" + node.id,
      title: node.title || node.url,
      url: node.url,
    };
  }
  function linkRow(node, subtitle) {
    const row = element("li", "pin-row");
    const link = element("a", "pin-link");
    link.href = node.url;
    link.title = (node.title || "") + "\n" + node.url;
    const copy = element("span", "site-copy");
    copy.append(
      element("span", "site-title", node.title || node.url),
      element("span", "site-domain", subtitle ?? C.host(C.url(node.url))),
    );
    link.append(tile(asPin(node)), copy);
    link.onclick = (event) => {
      event.preventDefault();
      run(null, () =>
        openPin(
          asPin(node),
          event.ctrlKey || event.metaKey || event.shiftKey
            ? "tab"
            : state.settings.openMode,
          event.ctrlKey || event.metaKey,
        ),
      );
    };
    const pinned = pinnedHere(node.url);
    const pin = iconButton(
      "pin",
      pinned ? "Đã ghim trong không gian này" : "Ghim vào không gian hiện tại",
      "icon-button row-pin",
    );
    pin.disabled = pinned;
    pin.onclick = () => run(pin, () => pinBookmark(node));
    const more = iconButton(
      "more",
      "Tùy chọn " + (node.title || ""),
      "icon-button row-more",
    );
    more.setAttribute("aria-haspopup", "menu");
    more.onclick = (event) => {
      event.stopPropagation();
      showMenu(more, [
        {
          label: "Mở trong sidebar",
          icon: "panel",
          action: () => openPin(asPin(node), "sidebar"),
        },
        {
          label: "Mở tab mới",
          icon: "external",
          action: () => openPin(asPin(node), "tab"),
        },
        null,
        {
          label: "Ghim vào không gian hiện tại",
          icon: "pin",
          action: () => pinBookmark(node),
        },
        ...editEntries(node),
      ]);
    };
    rowKeys(row, node);
    row.append(link, pin, more);
    return row;
  }
  function folderRow(node) {
    const row = element("li", "pin-row");
    const open = element("button", "pin-link");
    open.type = "button";
    const icon = element("span", "bm-folder-icon");
    icon.append(makeIcon("folder"));
    const copy = element("span", "site-copy");
    const title = element("span", "site-title", node.title || "Bookmark");
    const badge = linkBadge(node);
    if (badge) title.append(badge);
    const count = (node.children || []).length;
    copy.append(title, element("span", "site-domain", `${count} mục`));
    open.append(icon, copy);
    open.onclick = () => {
      currentId = node.id;
      $("search").value = "";
      render();
    };
    const more = iconButton(
      "more",
      "Tùy chọn thư mục " + (node.title || ""),
      "icon-button row-more",
    );
    more.setAttribute("aria-haspopup", "menu");
    more.onclick = (event) => {
      event.stopPropagation();
      folderMenu(node, more);
    };
    rowKeys(row, node);
    row.classList.add("bm-folder-row");
    row.append(open, more);
    return row;
  }
  function folderMenu(node, trigger) {
    const link = linkFor(node.id);
    const urls = [];
    (function collect(item) {
      for (const child of item.children || [])
        if (isWeb(child)) urls.push({ url: child.url });
        else if (child.children) collect(child);
    })(node);
    const workspace = link
      ? state.workspaces.find((item) => item.id === link.workspaceId)
      : null;
    showMenu(trigger, [
      ...(workspace
        ? [
            {
              label: `Mở không gian “${workspace.name}”`,
              icon: "grid",
              action: async () => {
                activeWorkspaceId = workspace.id;
                await chrome.storage.local.set({ activeWorkspaceId });
                setActiveView("pins");
                renderWorkspaces();
                renderSessions();
                globalThis.render();
              },
            },
            ...linkMenuEntries(workspace),
          ]
        : [
            {
              label: "Liên kết với không gian…",
              icon: "link",
              action: () => openLinkDialog(node),
            },
          ]),
      {
        label: "Mở tất cả thành nhóm tab",
        icon: "layers",
        action: () =>
          openTabsAsGroup(urls, {
            title: node.title || "Bookmark",
            color: workspaceGroupColor(activeWorkspaceId),
          }),
      },
      ...editEntries(node),
    ]);
  }
  function crumbs(id) {
    const nav = $("bm-crumbs");
    nav.replaceChildren();
    const trail = [];
    for (let current = flat.get(id); current;) {
      trail.unshift(current.node);
      current = current.node.parentId ? flat.get(current.node.parentId) : null;
    }
    trail.forEach((node, i) => {
      if (i) nav.append(element("span", "bm-sep", "›"));
      const button = element(
        "button",
        "",
        node.id === "0" ? "Bookmark" : node.title || "Bookmark",
      );
      button.type = "button";
      button.dataset.bm = node.id;
      if (node.id === id) button.setAttribute("aria-current", "page");
      button.onclick = () => {
        currentId = node.id;
        render();
      };
      nav.append(button);
    });
  }
  function matches(query, limit) {
    const results = [];
    for (const { node, path } of flat.values()) {
      if (!isWeb(node)) continue;
      if (C.fold((node.title || "") + " " + node.url).includes(query)) {
        results.push({ node, path });
        if (results.length >= limit) break;
      }
    }
    return results;
  }
  async function render() {
    if (activeView !== "bookmarks" || !state) return;
    $("bm-permission").hidden = granted;
    $("bm-browser").hidden = !granted;
    if (!granted) return;
    let map;
    try {
      map = await load();
    } catch (error) {
      $("bm-status").textContent = error.message;
      return;
    }
    if (!map.has(currentId)) currentId = "0";
    const list = $("bm-list");
    list.className = "bm-list group-pins";
    const query = C.fold($("search").value.trim());
    if (query) {
      $("bm-crumbs").replaceChildren();
      const results = matches(query, 200);
      $("bm-status").textContent = results.length
        ? `${results.length}${results.length === 200 ? "+" : ""} bookmark khớp “${$("search").value.trim()}”`
        : "Không tìm thấy bookmark phù hợp.";
      list.replaceChildren(
        ...results.map(({ node, path }) =>
          linkRow(node, path.join(" › ") || C.host(C.url(node.url))),
        ),
      );
      return;
    }
    crumbs(currentId);
    const node = map.get(currentId).node;
    const children = node.children || [];
    const folders = children.filter((child) => child.children);
    const links = children.filter(isWeb);
    $("bm-status").textContent = children.length
      ? currentId === "0"
        ? "Chọn một thư mục. Bấm ⋯ trên thư mục để liên kết với không gian."
        : `${folders.length} thư mục · ${links.length} trang · kéo thả để sắp xếp`
      : "Thư mục trống. Kéo bookmark vào tên thư mục ở trên để chuyển chỗ.";
    // Real bookmark order, so drag and drop matches the browser's own list.
    list.replaceChildren(
      ...children
        .filter((child) => child.children || isWeb(child))
        .map((child) => {
          const row = child.children ? folderRow(child) : linkRow(child);
          row.draggable = editable(child);
          return row;
        }),
    );
  }
  let dragId = null;
  function clearBookmarkDrop() {
    document
      .querySelectorAll(".bm-drop-before,.bm-drop-after,.bm-drop-into")
      .forEach((el) =>
        el.classList.remove("bm-drop-before", "bm-drop-after", "bm-drop-into"),
      );
  }
  // Folder rows: middle half drops inside; edges drop beside. At the top
  // level only "inside" is allowed, since roots are fixed by the browser.
  function dropPlace(row, event) {
    const target = flat?.get(row.dataset.bm)?.node;
    if (!target || target.id === dragId) return null;
    const box = row.getBoundingClientRect();
    const y = (event.clientY - box.top) / box.height;
    const canInto = !!target.children && !target.unmodifiable;
    if (!editable(target)) return canInto ? "into" : null;
    if (canInto && y > 0.25 && y < 0.75) return "into";
    return y < 0.5 ? "before" : "after";
  }
  $("bm-list").addEventListener("dragstart", (event) => {
    const row = event.target.closest?.("[data-bm]");
    if (!row?.draggable || $("search").value.trim()) {
      event.preventDefault();
      return;
    }
    dragId = row.dataset.bm;
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "bookmark:" + dragId);
    closeMenu();
  });
  $("bm-list").addEventListener("dragover", (event) => {
    if (!dragId) return;
    const row = event.target.closest("[data-bm]");
    clearBookmarkDrop();
    if (!row) return;
    const place = dropPlace(row, event);
    if (!place) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    row.classList.add("bm-drop-" + place);
  });
  $("bm-list").addEventListener("drop", (event) => {
    if (!dragId) return;
    event.preventDefault();
    const row = event.target.closest("[data-bm]");
    const id = dragId;
    const place = row && dropPlace(row, event);
    dragId = null;
    clearBookmarkDrop();
    if (place)
      run(null, () => moveBookmark(id, flat.get(row.dataset.bm).node, place));
  });
  $("bm-list").addEventListener("dragend", () => {
    dragId = null;
    clearBookmarkDrop();
    document
      .querySelectorAll("#bm-list .dragging")
      .forEach((el) => el.classList.remove("dragging"));
  });
  // Dropping on a breadcrumb moves the bookmark up into that folder.
  $("bm-crumbs").addEventListener("dragover", (event) => {
    const button = event.target.closest("button[data-bm]");
    clearBookmarkDrop();
    if (!dragId || !button || button.dataset.bm === "0") return;
    event.preventDefault();
    button.classList.add("bm-drop-into");
  });
  $("bm-crumbs").addEventListener("drop", (event) => {
    const button = event.target.closest("button[data-bm]");
    const id = dragId;
    dragId = null;
    clearBookmarkDrop();
    if (!id || !button || button.dataset.bm === "0") return;
    event.preventDefault();
    run(null, () => moveBookmark(id, flat.get(button.dataset.bm).node, "into"));
  });
  // "Từ bookmark" group appended to the pin list while searching pins.
  function searchGroup(query) {
    if (!granted) return null;
    if (!flat) {
      load().then(
        () => activeView === "pins" && globalThis.render(),
        () => {},
      );
      return null;
    }
    const results = matches(query, 30)
      .filter(({ node }) => !pinnedHere(node.url))
      .slice(0, 5);
    if (!results.length) return null;
    const group = element("section", "group from-bookmarks");
    const heading = element("div", "group-heading");
    const label = element("span", "folder-toggle");
    label.append(
      makeIcon("bookmark"),
      element("span", "folder-name", "Từ bookmark"),
      element("span", "group-count", results.length),
    );
    heading.append(label);
    const ul = element("ul", "group-pins");
    ul.append(
      ...results.map(({ node, path }) => linkRow(node, path.join(" › "))),
    );
    group.append(heading, ul);
    return { element: group, count: results.length };
  }
  async function preview() {
    const request_ = ++previewRequest;
    const mode = $("link-mode").value;
    const target = $("link-target").value;
    $("link-name-wrap").hidden = target !== "__new";
    $("link-save").textContent = mode === "copy" ? "Sao chép" : "Liên kết";
    $("link-preview").textContent = "Đang xem trước…";
    $("link-error").textContent = "";
    if (mode === "copy") {
      let count = 0;
      (function walk(node) {
        for (const child of node.children || [])
          if (isWeb(child)) count++;
          else if (child.children) walk(child);
      })(linkSource);
      $("link-preview").textContent =
        `Sao chép ${count} bookmark vào không gian. Trang đã có được bỏ qua; ` +
        "sau này sửa bookmark sẽ không ảnh hưởng tới sidebar.";
      return;
    }
    try {
      const data = await request("BOOKMARK_LINK", {
        rootId: linkSource.id,
        workspaceId: target === "__new" ? "" : target,
        newWorkspaceName:
          target === "__new"
            ? $("link-name").value || linkSource.title || "Bookmark"
            : "",
        direction: mode,
        dryRun: true,
      });
      if (request_ !== previewRequest) return;
      const s = data.stats;
      $("link-preview").textContent =
        [
          `Thêm ${s.added} trang từ bookmark`,
          s.updated ? `cập nhật ${s.updated} trang` : "",
          s.pushed ? `tạo ${s.pushed} bookmark từ trang ghim sẵn có` : "",
          s.duplicates || s.skipped
            ? `bỏ qua ${s.duplicates + s.skipped} mục trùng hoặc không phải website`
            : "",
        ]
          .filter(Boolean)
          .join(" · ") +
        (mode === "two-way"
          ? ". Từ nay sửa, thêm hoặc bỏ ghim trong không gian sẽ cập nhật thư mục bookmark và ngược lại."
          : ". Từ nay thay đổi trong bookmark sẽ tự cập nhật không gian.");
    } catch (error) {
      if (request_ !== previewRequest) return;
      $("link-preview").textContent = "";
      $("link-error").textContent = error.message;
    }
  }
  function openLinkDialog(node) {
    linkSource = node;
    const entry = flat?.get(node.id);
    $("link-source").textContent =
      "Thư mục: " +
      [...(entry?.path || []), node.title || "Bookmark"].join(" › ");
    const free = state.workspaces.filter(
      (workspace) => !workspaceLink(workspace.id),
    );
    $("link-target").replaceChildren(
      new Option("Không gian mới", "__new"),
      ...free.map((workspace) => new Option(workspace.name, workspace.id)),
    );
    $("link-target").value = "__new";
    $("link-name").value = (node.title || "Bookmark").slice(0, 80);
    $("link-mode").value = node.unmodifiable ? "pull-only" : "two-way";
    $("link-mode").options[0].disabled = !!node.unmodifiable;
    showDialog($("link-dialog"));
    preview();
  }
  $("link-target").onchange = preview;
  $("link-mode").onchange = preview;
  $("link-name").oninput = () => {
    clearTimeout(openLinkDialog.timer);
    openLinkDialog.timer = setTimeout(preview, 300);
  };
  $("link-form").onsubmit = (event) => {
    event.preventDefault();
    run(
      $("link-save"),
      async () => {
        const target = $("link-target").value;
        const mode = $("link-mode").value;
        const message = {
          rootId: linkSource.id,
          workspaceId: target === "__new" ? "" : target,
          newWorkspaceName:
            target === "__new"
              ? $("link-name").value.trim() || linkSource.title || "Bookmark"
              : "",
          color: "#b5ef55",
        };
        const data =
          mode === "copy"
            ? await request("BOOKMARK_COPY", message)
            : await request("BOOKMARK_LINK", { ...message, direction: mode });
        accept(data.state);
        activeWorkspaceId = data.workspaceId;
        await chrome.storage.local.set({ activeWorkspaceId });
        $("link-dialog").close();
        renderWorkspaces();
        renderSessions();
        setActiveView("pins");
        globalThis.render();
        toast(
          mode === "copy"
            ? `Đã sao chép ${data.stats.added} bookmark.`
            : "Đã liên kết thư mục bookmark với không gian.",
        );
      },
      $("link-error"),
    );
  };
  async function exportWorkspace(workspace) {
    await ensurePermission();
    const linked = !!workspaceLink(workspace.id);
    const result = await choose(
      "Xuất ra bookmark",
      `Tạo thư mục “Pinned · ${workspace.name}” trong Bookmark khác, gồm các thư mục và website của không gian.` +
        (linked ? "" : " Chọn Xuất và liên kết để hai bên luôn giống nhau."),
      [
        ...(linked ? [] : [{ label: "Xuất và liên kết", value: "link" }]),
        { label: "Chỉ xuất", value: "export" },
      ],
    );
    if (result !== "link" && result !== "export") return;
    await request("BOOKMARK_EXPORT", {
      workspaceId: workspace.id,
      link: result === "link",
    });
    toast(
      result === "link"
        ? "Đã xuất và liên kết không gian với bookmark."
        : "Đã xuất không gian ra bookmark.",
    );
  }
  $("bm-grant").onclick = () => run($("bm-grant"), ensurePermission);
  chrome.permissions?.onAdded?.addListener(refreshPermission);
  chrome.permissions?.onRemoved?.addListener(refreshPermission);
  globalThis.PinnedBookmarks = {
    render,
    searchGroup,
    hasPermission,
    ensurePermission,
    exportWorkspace,
  };
  refreshPermission();
})();
