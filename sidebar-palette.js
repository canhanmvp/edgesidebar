/* Command palette (Ctrl+K): one search over pins, bookmarks, tab sessions
   and commands. It only calls what the sidebar already does; no new writes. */
"use strict";
(() => {
  const LIMITS = { pins: 8, bookmarks: 5, sessions: 4 };
  let items = [];
  let selected = 0;
  let renderRequest = 0;
  let splitPick = false;
  // Enter follows the open-mode setting; Ctrl+Enter forces a new tab and
  // Shift+Enter the bottom half of the viewer.
  function openMode(event) {
    if (splitPick || event?.shiftKey) return panes[0].pin ? "split" : "sidebar";
    if (event?.ctrlKey || event?.metaKey) return "tab";
    return state.settings.openMode;
  }
  function pinItem(pin, detail, kind = "pin") {
    return {
      kind,
      icon: kind === "bookmark" ? "bookmark" : pin.favorite ? "star" : "pin",
      label: pin.title || pin.url,
      detail,
      run: (event) => openPin(pin, openMode(event), event?.ctrlKey),
    };
  }
  function commands() {
    const go = (view) => () => {
      if (panes[0].pin) closeViewer();
      setActiveView(view);
    };
    const settings = (patch) => () => mutate({ type: "SETTINGS", patch });
    const list = [
      {
        label: t("Ghim tab hiện tại"),
        icon: "pin",
        run: () => $("pin-current").click(),
      },
      { label: t("Thêm website"), icon: "plus", run: () => pinDialog() },
      {
        label: t("Thư mục mới"),
        icon: "folder-plus",
        run: () => folderDialog(),
      },
      {
        label: t("Không gian mới"),
        icon: "grid",
        run: () => workspaceDialog(),
      },
      {
        label: t("Lưu các tab đang mở thành một phiên"),
        icon: "history",
        run: () => saveCurrentSession(),
      },
      { label: t("Xem trang ghim"), icon: "grid", run: go("pins") },
      { label: t("Xem phiên tab"), icon: "history", run: go("sessions") },
      { label: t("Xem bookmark"), icon: "bookmark", run: go("bookmarks") },
      ...state.workspaces
        .filter((workspace) => workspace.id !== activeWorkspaceId)
        .map((workspace) => ({
          label: t("Chuyển sang không gian “{0}”", [workspace.name]),
          icon: "grid",
          run: () => {
            $("workspace-select").value = workspace.id;
            return $("workspace-select").onchange();
          },
        })),
      {
        label: t("Dọn dẹp trang ghim…"),
        icon: "broom",
        run: () => globalThis.PinnedCleanup.open(),
      },
      {
        label: t("Nhập dữ liệu"),
        icon: "upload",
        run: () => $("import-btn").click(),
      },
      { label: t("Cài đặt"), icon: "settings", run: () => settingsDialog() },
      {
        label: t("Chế độ chỉ biểu tượng"),
        icon: "grid",
        run: () => $("compact-btn").click(),
      },
      {
        label: t("Giao diện: Sáng"),
        icon: "settings",
        run: settings({ theme: "light" }),
      },
      {
        label: t("Giao diện: Tối"),
        icon: "settings",
        run: settings({ theme: "dark" }),
      },
      {
        label: t("Giao diện: Theo hệ thống"),
        icon: "settings",
        run: settings({ theme: "system" }),
      },
      {
        label: t("Ngôn ngữ: Tiếng Việt"),
        icon: "settings",
        run: settings({ language: "vi" }),
      },
      {
        label: t("Ngôn ngữ: Tiếng Anh"),
        icon: "settings",
        run: settings({ language: "en" }),
      },
    ];
    return list.map((item) => ({
      ...item,
      kind: "command",
      detail: t("Lệnh"),
    }));
  }
  async function collect(raw) {
    const commandOnly = !splitPick && raw.startsWith(">");
    const query = C.fold((commandOnly ? raw.slice(1) : raw).trim());
    const out = [];
    if (!commandOnly) {
      if (!query) {
        // Nothing typed: favorites of this workspace first.
        for (const pin of state.pins
          .filter(
            (item) => item.workspaceId === activeWorkspaceId && item.favorite,
          )
          .slice(0, 6))
          out.push(pinItem(pin, C.host(pin.url)));
        if (splitPick)
          for (const pin of state.pins
            .filter(
              (item) =>
                item.workspaceId === activeWorkspaceId && !item.favorite,
            )
            .slice(0, 8))
            out.push(pinItem(pin, C.host(pin.url)));
      } else {
        for (const { pin, workspace, folder } of C.search(state, query, {
          workspaceId: activeWorkspaceId,
          limit: LIMITS.pins,
        }))
          out.push(
            pinItem(
              pin,
              [workspace?.name, folder?.name, C.host(pin.url)]
                .filter(Boolean)
                .join(" › "),
            ),
          );
        for (const { node, path } of await globalThis.PinnedBookmarks.search(
          query,
          LIMITS.bookmarks,
        ))
          out.push(
            pinItem(
              {
                id: "bookmark:" + node.id,
                title: node.title || node.url,
                url: node.url,
              },
              path.join(" › ") || C.host(C.url(node.url)),
              "bookmark",
            ),
          );
        if (!splitPick)
          for (const session of savedSessions
            .filter((item) => C.fold(item.name).includes(query))
            .slice(0, LIMITS.sessions))
            out.push({
              kind: "session",
              icon: "history",
              label: session.name,
              detail: t("Phiên · {0} tab", [session.tabs.length]),
              run: () => openSession(session),
            });
      }
    }
    if (!splitPick) {
      const list = commands();
      const matching = query
        ? list.filter((item) => C.fold(item.label).includes(query))
        : commandOnly
          ? list
          : list.slice(0, 6);
      out.push(...matching);
    }
    return out;
  }
  function paint() {
    const list = $("palette-list");
    list.replaceChildren(
      ...items.map((item, i) => {
        const li = element("li", "palette-item");
        li.id = "palette-opt-" + i;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === selected));
        const copy = element("span", "palette-copy");
        copy.append(
          element("span", "palette-label", item.label),
          element("span", "palette-detail", item.detail || ""),
        );
        li.append(makeIcon(item.icon), copy);
        li.onmousemove = () => {
          if (selected !== i) {
            selected = i;
            mark();
          }
        };
        li.onclick = (event) => pick(i, event);
        return li;
      }),
    );
    $("palette-empty").hidden = items.length > 0;
    mark();
  }
  function mark() {
    const options = $("palette-list").children;
    for (let i = 0; i < options.length; i++)
      options[i].setAttribute("aria-selected", String(i === selected));
    const active = options[selected];
    $("palette-input").setAttribute("aria-activedescendant", active?.id || "");
    active?.scrollIntoView({ block: "nearest" });
  }
  async function update() {
    const request_ = ++renderRequest;
    const found = await collect($("palette-input").value);
    if (request_ !== renderRequest) return;
    items = found;
    selected = 0;
    paint();
  }
  function pick(index, event) {
    const item = items[index];
    if (!item) return;
    $("palette-dialog").close();
    run(null, () => item.run(event));
  }
  function open({ split = false } = {}) {
    if (!state) return;
    splitPick = split;
    $("palette-input").value = "";
    $("palette-input").placeholder = split
      ? t("Chọn website cho nửa dưới…")
      : t("Tìm trang, bookmark, phiên… hoặc gõ > để chạy lệnh");
    showDialog($("palette-dialog"));
    $("palette-input").focus();
    update();
  }
  $("palette-input").addEventListener("input", update);
  $("palette-input").addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      selected =
        (selected + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
        items.length;
      mark();
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(selected, event);
    }
  });
  // Ctrl+K / Cmd+K anywhere in the sidebar (not inside an embedded website,
  // which keeps its own keys; the header button covers that case).
  document.addEventListener("keydown", (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "k"
    ) {
      event.preventDefault();
      if ($("palette-dialog").open) $("palette-dialog").close();
      else if (!document.querySelector("dialog[open]")) open();
    }
  });
  $("palette-btn").onclick = () => open();
  globalThis.PinnedPalette = { open };
})();
