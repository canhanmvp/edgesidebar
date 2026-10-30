/* Cleanup dialog: checks pinned sites for dead or moved links and lists
   near-duplicate URLs. Runs in the sidebar so closing the dialog stops it. */
"use strict";
(() => {
  const CONCURRENCY = 4;
  const TIMEOUT = 10000;
  let controller = null;
  let results = {}; // pinId -> { status, code, finalUrl, checkedAt }
  async function probe(url, signal) {
    const options = {
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "follow",
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT)]),
    };
    let response = await fetch(url, { ...options, method: "HEAD" });
    // Many servers mishandle HEAD; confirm any error with a real GET.
    if (response.status >= 400) {
      response = await fetch(url, { ...options, method: "GET" });
      response.body?.cancel().catch(() => {});
    }
    return {
      status: response.status,
      redirected: response.redirected,
      finalUrl: response.url,
    };
  }
  function scopePins() {
    return $("cleanup-scope").value === "all"
      ? state.pins
      : state.pins.filter((pin) => pin.workspaceId === activeWorkspaceId);
  }
  function workspaceName(pin) {
    return (
      state.workspaces.find((item) => item.id === pin.workspaceId)?.name || ""
    );
  }
  function row(pin, detail, actions) {
    const item = element("div", "cleanup-row");
    const copy = element("div", "cleanup-row-copy");
    copy.append(element("strong", "", pin.title), element("span", "", detail));
    copy.title = pin.url;
    item.append(copy);
    for (const [label, action, danger] of actions) {
      const button = element(
        "button",
        "text-button" + (danger ? " danger" : ""),
        label,
      );
      button.type = "button";
      button.onclick = () => run(button, action);
      item.append(button);
    }
    return item;
  }
  async function removePin(pin) {
    const index = state.pins.findIndex((item) => item.id === pin.id);
    await mutate({ type: "DELETE_PIN", id: pin.id });
    renderResults();
    toast(`Đã bỏ ghim ${pin.title}`, {
      undo: async () => {
        await mutate({ type: "RESTORE_PIN", pin, index });
        renderResults();
      },
    });
  }
  async function updateUrl(pin, url) {
    await mutate({
      type: "SAVE_PIN",
      id: pin.id,
      url,
      title: pin.title,
      folderId: pin.folderId,
      workspaceId: pin.workspaceId,
      tags: pin.tags,
      note: pin.note,
      favorite: pin.favorite,
    });
    delete results[pin.id];
    await save();
    renderResults();
    toast("Đã cập nhật địa chỉ mới.");
  }
  const openTab = (pin) => () => openPin(pin, "tab", true);
  function section(title, rows, extra) {
    if (!rows.length) return null;
    const box = element("section");
    const heading = element("h3", "", `${title} (${rows.length})`);
    box.append(heading, ...rows);
    if (extra) box.append(extra);
    return box;
  }
  function renderResults() {
    const live = new Map(scopePins().map((pin) => [pin.id, pin]));
    const by = (status) =>
      [...live.values()].filter((pin) => results[pin.id]?.status === status);
    const broken = by("broken");
    const deleteAll = element(
      "button",
      "text-button danger",
      "Bỏ ghim tất cả link hỏng",
    );
    deleteAll.type = "button";
    deleteAll.onclick = () =>
      run(deleteAll, async () => {
        const ok = await choose(
          "Bỏ ghim link hỏng?",
          `Bỏ ghim ${broken.length} website trả về lỗi 404/410. Bạn có thể xuất JSON trước để sao lưu.`,
          [{ label: "Bỏ ghim tất cả", value: "delete", danger: true }],
        );
        if (ok !== "delete") return;
        for (const pin of broken)
          await mutate({ type: "DELETE_PIN", id: pin.id });
        renderResults();
        toast(`Đã bỏ ghim ${broken.length} link hỏng.`);
      });
    const groups = C.duplicateGroups(
      { ...state, pins: [...live.values()] },
      { acrossWorkspaces: $("cleanup-across").checked },
    );
    const across = $("cleanup-scope").value === "all";
    const detail = (pin, text) =>
      (across ? workspaceName(pin) + " · " : "") + text;
    $("cleanup-results").replaceChildren(
      ...[
        section(
          "Link hỏng",
          broken.map((pin) =>
            row(
              pin,
              detail(pin, `Lỗi ${results[pin.id].code} · ${C.host(pin.url)}`),
              [
                ["Mở", openTab(pin)],
                ["Bỏ ghim", () => removePin(pin), true],
              ],
            ),
          ),
          broken.length > 1 ? deleteAll : null,
        ),
        section(
          "Đã chuyển địa chỉ",
          by("redirect").map((pin) =>
            row(pin, detail(pin, "→ " + results[pin.id].finalUrl), [
              ["Cập nhật", () => updateUrl(pin, results[pin.id].finalUrl)],
              ["Mở", openTab(pin)],
            ]),
          ),
        ),
        section(
          "Không truy cập được",
          by("unreachable").map((pin) =>
            row(
              pin,
              detail(
                pin,
                (results[pin.id].code
                  ? `Lỗi ${results[pin.id].code} · `
                  : "Hết thời gian hoặc lỗi mạng · ") + C.host(pin.url),
              ),
              [
                ["Mở", openTab(pin)],
                ["Bỏ ghim", () => removePin(pin), true],
              ],
            ),
          ),
        ),
        section(
          "Cần đăng nhập hoặc bị chặn",
          by("blocked").map((pin) =>
            row(
              pin,
              detail(
                pin,
                `Mã ${results[pin.id].code}: thường vẫn dùng được khi đã đăng nhập`,
              ),
              [["Mở", openTab(pin)]],
            ),
          ),
        ),
        section(
          "Gần trùng",
          groups.flatMap((pins) =>
            pins.map((pin, i) =>
              row(
                pin,
                (i ? "Trùng với “" + pins[0].title + "” · " : "Giữ lại · ") +
                  (across || $("cleanup-across").checked
                    ? workspaceName(pin) + " · "
                    : "") +
                  pin.url,
                i
                  ? [
                      ["Mở", openTab(pin)],
                      ["Bỏ ghim", () => removePin(pin), true],
                    ]
                  : [["Mở", openTab(pin)]],
              ),
            ),
          ),
        ),
      ].filter(Boolean),
    );
  }
  async function save() {
    const known = new Set(state.pins.map((pin) => pin.id));
    const stored =
      (await chrome.storage.local.get("linkCheck")).linkCheck || {};
    const merged = Object.fromEntries(
      Object.entries({ ...stored, ...results }).filter(([id]) => known.has(id)),
    );
    await chrome.storage.local.set({ linkCheck: merged });
  }
  async function start() {
    const pins = scopePins();
    controller = new AbortController();
    const { signal } = controller;
    results = {};
    let done = 0;
    $("cleanup-run").hidden = true;
    $("cleanup-stop").hidden = false;
    $("cleanup-progress").hidden = false;
    $("cleanup-bar").style.width = "0";
    renderResults();
    const queue = [...pins];
    const status = () => {
      $("cleanup-status").textContent =
        `Đã kiểm tra ${done}/${pins.length} trang…`;
      $("cleanup-bar").style.width =
        (pins.length ? (done / pins.length) * 100 : 100) + "%";
    };
    status();
    async function worker() {
      while (queue.length && !signal.aborted) {
        const pin = queue.shift();
        let outcome;
        try {
          outcome = await probe(pin.url, signal);
        } catch (error) {
          if (signal.aborted) return;
          outcome = { error: error.name || "error" };
        }
        results[pin.id] = {
          ...C.classifyCheck(pin.url, outcome),
          checkedAt: Date.now(),
        };
        done++;
        status();
        if (done % 10 === 0) renderResults();
      }
    }
    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } finally {
      controller = null;
      $("cleanup-run").hidden = false;
      $("cleanup-run").textContent = "Kiểm tra lại";
      $("cleanup-stop").hidden = true;
      await save();
      renderResults();
      const issues = Object.values(results).filter((r) =>
        ["broken", "redirect", "unreachable"].includes(r.status),
      ).length;
      $("cleanup-status").textContent =
        (signal.aborted
          ? `Đã dừng sau ${done}/${pins.length} trang. `
          : `Đã kiểm tra ${done} trang. `) +
        (issues ? `Có ${issues} trang cần xem lại.` : "Không thấy link hỏng.");
    }
  }
  function stop() {
    controller?.abort();
  }
  function open() {
    if (!state) return;
    results = {};
    $("cleanup-status").textContent = "";
    $("cleanup-progress").hidden = true;
    $("cleanup-run").textContent = "Bắt đầu kiểm tra";
    showDialog($("cleanup-dialog"));
    renderResults();
  }
  $("cleanup-run").onclick = () => run($("cleanup-run"), start);
  $("cleanup-stop").onclick = stop;
  $("cleanup-scope").onchange = renderResults;
  $("cleanup-across").onchange = renderResults;
  $("cleanup-dialog").addEventListener("close", stop);
  globalThis.PinnedCleanup = { open };
})();
