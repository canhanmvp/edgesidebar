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
      ]);
    };
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
        : `${folders.length} thư mục · ${links.length} trang`
      : "Thư mục trống.";
    list.replaceChildren(
      ...folders.map(folderRow),
      ...links.map((child) => linkRow(child)),
    );
  }
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
