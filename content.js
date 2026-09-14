/* Isolated floating rail: no page CSS or storage writes. */
(() => {
  "use strict";
  if (
    window.top !== window.self ||
    document.getElementById("pinned-sidebar-v2")
  )
    return;
  let host,
    shadow,
    rail,
    current,
    refreshId = 0,
    activeDrag = null,
    repairTimer = 0;
  const DEFAULT_EDGE_INSET = 24;
  const systemTheme = matchMedia("(prefers-color-scheme: dark)");
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  async function send(type, extra = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...extra });
    if (!response?.ok)
      throw new Error(
        response?.error || "Hãy tải lại trang để kết nối extension.",
      );
    return response;
  }
  function message(text) {
    if (!shadow) return;
    const notice = shadow.querySelector(".notice");
    notice.textContent = text;
    notice.hidden = false;
    setTimeout(() => {
      if (notice.isConnected) notice.hidden = true;
    }, 5500);
  }
  function theme() {
    if (rail && current)
      rail.dataset.theme =
        current.settings.theme === "system"
          ? systemTheme.matches
            ? "dark"
            : "light"
          : current.settings.theme;
  }
  function siteIcon(pin) {
    const tile = el("span", "tile");
    const fallback = el(
      "span",
      "tile-fallback",
      Array.from(pin.title)[0]?.toLocaleUpperCase("vi") || "•",
    );
    const favicon = document.createElement("img");
    favicon.className = "tile-favicon";
    favicon.alt = "";
    favicon.width = 30;
    favicon.height = 30;
    favicon.referrerPolicy = "no-referrer";
    // Ask the pinned website for its conventional icon. If it has none, the
    // readable letter tile remains in place without depending on page CSS.
    favicon.src = new URL("/favicon.ico", pin.url).href;
    favicon.addEventListener("load", () => tile.classList.add("has-favicon"));
    favicon.addEventListener("error", () => favicon.remove());
    tile.append(fallback, favicon);
    return tile;
  }
  function remove() {
    if (activeDrag) {
      activeDrag.abort();
      activeDrag = null;
    }
    host?.remove();
    host = null;
    shadow = null;
    rail = null;
  }
  function clampPosition(left, top) {
    // The rail expands on hover to reveal labels, but its saved location is
    // the 48px icon column. Using the expanded width here made right-side
    // dragging stop far from the viewport edge.
    const width = 48;
    const height = rail?.getBoundingClientRect().height || 48;
    // Keep clear of a page's scrollbar. When Edge opens its native side
    // panel, the remaining page viewport can become very narrow, so reduce
    // the preferred 24px inset only when that is necessary to keep the rail
    // visible.
    const horizontalInset = Math.min(
      DEFAULT_EDGE_INSET,
      Math.max(8, Math.floor((innerWidth - width) / 2)),
    );
    const verticalInset = Math.min(
      8,
      Math.max(0, Math.floor((innerHeight - height) / 2)),
    );
    const maxLeft = Math.max(
      horizontalInset,
      innerWidth - width - horizontalInset,
    );
    const maxTop = Math.max(
      verticalInset,
      innerHeight - height - verticalInset,
    );
    return {
      left: Math.max(horizontalInset, Math.min(maxLeft, Math.round(left))),
      top: Math.max(verticalInset, Math.min(maxTop, Math.round(top))),
    };
  }
  function placeRail(left, top) {
    const position = clampPosition(left, top);
    host.style.setProperty("left", position.left + "px", "important");
    host.style.setProperty("top", position.top + "px", "important");
    host.style.setProperty("right", "auto", "important");
    rail.classList.toggle("left", position.left < innerWidth / 2);
    return position;
  }
  async function open(pin, event) {
    const tab =
      current.settings.openMode === "tab" ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.button === 1;
    try {
      await send(tab ? "OPEN_PIN" : "OPEN_PANEL", {
        id: pin.id,
        background: event.ctrlKey || event.metaKey || event.button === 1,
      });
    } catch (error) {
      if (/context invalidated/i.test(error.message)) {
        message(
          "Extension vừa được tải lại. Tải lại trang này (F5), rồi bấm icon để mở sidebar.",
        );
        return;
      }
      message(
        error.message +
          " Bạn có thể mở bằng biểu tượng extension trên thanh công cụ.",
      );
    }
  }
  function build(data) {
    const previousFocus = shadow?.activeElement?.dataset.pin;
    const expanded = rail?.matches(":hover") || !!previousFocus;
    current = data;
    remove();
    if (!data.settings.overlay) return;
    host = document.createElement("div");
    host.id = "pinned-sidebar-v2";
    // Reset only our host. The host never reserves or changes the page layout.
    host.style.cssText =
      "all:initial!important;position:fixed!important;z-index:2147483646!important;display:block!important;";
    shadow = host.attachShadow({ mode: "closed" });
    const stylesheet = el("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = chrome.runtime.getURL("content.css");
    shadow.append(stylesheet);
    rail = el("nav", "rail");
    rail.setAttribute("aria-label", "Pinned Sidebar");
    rail.style.setProperty("--expanded", data.settings.overlayWidth + "px");
    if (expanded) {
      rail.classList.add("keep-open");
      rail.addEventListener(
        "mouseleave",
        () => rail?.classList.remove("keep-open"),
        { once: true },
      );
    }
    const home = el("button", "home");
    home.type = "button";
    home.title = "Mở Pinned Sidebar";
    home.setAttribute("aria-label", "Mở Pinned Sidebar");
    home.append(
      el("span", "home-icon", "p."),
      el("span", "label", "Không gian của bạn"),
    );
    home.onclick = () =>
      send("OPEN_PANEL").catch((error) => message(error.message));
    rail.append(home);
    const moveHandle = el("div", "move-handle", "⠿");
    moveHandle.title = "Kéo để di chuyển thanh icon";
    moveHandle.setAttribute("aria-label", "Kéo để di chuyển thanh icon");
    moveHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      activeDrag?.abort();
      rail.classList.remove("resizing");
      activeDrag = new AbortController();
      const { signal } = activeDrag;
      const start = { left: host.offsetLeft, top: host.offsetTop };
      const pointer = { x: event.clientX, y: event.clientY };
      moveHandle.setPointerCapture(event.pointerId);
      rail.classList.add("moving");
      const move = (next) =>
        placeRail(
          start.left + next.clientX - pointer.x,
          start.top + next.clientY - pointer.y,
        );
      const end = (cancelled) => {
        rail?.classList.remove("moving");
        activeDrag?.abort();
        activeDrag = null;
        if (cancelled) return;
        const position = clampPosition(host.offsetLeft, host.offsetTop);
        placeRail(position.left, position.top);
        send("OVERLAY_POSITION", {
          x: position.left,
          y: position.top,
          side: position.left < innerWidth / 2 ? "left" : "right",
        }).catch((error) => message(error.message));
      };
      moveHandle.addEventListener("pointermove", move, { signal });
      moveHandle.addEventListener("pointerup", () => end(false), { signal });
      moveHandle.addEventListener("pointercancel", () => end(true), { signal });
      moveHandle.addEventListener("lostpointercapture", () => end(true), {
        signal,
      });
    });
    rail.append(moveHandle);
    const list = el("div", "list");
    for (const pin of data.pins.slice(0, 100)) {
      const item = el("button", "item");
      item.type = "button";
      item.dataset.pin = pin.id;
      item.title = `${pin.title}\n${pin.url}`;
      item.setAttribute("aria-label", pin.title);
      item.append(siteIcon(pin), el("span", "label", pin.title));
      item.onclick = (event) => open(pin, event);
      item.onauxclick = (event) => {
        if (event.button === 1) {
          event.preventDefault();
          open(pin, event);
        }
      };
      list.append(item);
    }
    rail.append(list);
    if (data.pins.length > 100) {
      const more = el("button", "more", "+" + (data.pins.length - 100));
      more.title = "Xem tất cả trong sidebar";
      more.onclick = () =>
        send("OPEN_PANEL").catch((error) => message(error.message));
      rail.append(more);
    }
    const resizer = el("div", "resizer");
    resizer.title = "Kéo để chỉnh độ rộng";
    resizer.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      activeDrag?.abort();
      rail.classList.remove("moving");
      activeDrag = new AbortController();
      const { signal } = activeDrag;
      resizer.setPointerCapture(event.pointerId);
      rail.classList.add("resizing");
      let width = data.settings.overlayWidth;
      resizer.addEventListener(
        "pointermove",
        (move) => {
          const bounds = host.getBoundingClientRect();
          width = Math.max(
            160,
            Math.min(
              420,
              Math.round(
                rail.classList.contains("left")
                  ? move.clientX - bounds.left
                  : bounds.right - move.clientX,
              ),
            ),
          );
          rail.style.setProperty("--expanded", width + "px");
        },
        { signal },
      );
      function end(cancelled) {
        rail?.classList.remove("resizing");
        activeDrag?.abort();
        activeDrag = null;
        if (!cancelled)
          send("OVERLAY_WIDTH", { width }).catch((error) =>
            message(error.message),
          );
      }
      resizer.addEventListener("pointerup", () => end(false), { signal });
      resizer.addEventListener("pointercancel", () => end(true), { signal });
      resizer.addEventListener("lostpointercapture", () => end(true), {
        signal,
      });
    });
    rail.append(resizer);
    const notice = el("p", "notice");
    notice.hidden = true;
    notice.setAttribute("role", "status");
    shadow.append(rail, notice);
    (document.body || document.documentElement).append(host);
    theme();
    placeRail(
      Number.isFinite(data.settings.overlayX)
        ? data.settings.overlayX
        : data.settings.overlaySide === "left"
          ? DEFAULT_EDGE_INSET
          : innerWidth - 48 - DEFAULT_EDGE_INSET,
      Number.isFinite(data.settings.overlayY)
        ? data.settings.overlayY
        : innerHeight * 0.25,
    );
    if (previousFocus)
      [...shadow.querySelectorAll("[data-pin]")]
        .find((item) => item.dataset.pin === previousFocus)
        ?.focus();
  }
  async function refresh() {
    const id = ++refreshId;
    try {
      const data = await send("OVERLAY_STATE");
      if (id === refreshId) build(data);
    } catch {
      remove();
    }
  }
  // Some storefronts and single-page apps replace document.body after the
  // extension has loaded. The old rail is removed with that body, so restore
  // it once the page has finished its DOM update.
  const bodyWatcher = new MutationObserver(() => {
    if (repairTimer || !host || host.isConnected || !current?.settings.overlay)
      return;
    repairTimer = setTimeout(() => {
      repairTimer = 0;
      if (host && !host.isConnected && current?.settings.overlay) refresh();
    }, 0);
  });
  bodyWatcher.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  systemTheme.addEventListener("change", theme);
  // Opening or closing Edge's native side panel changes the remaining page
  // viewport. Re-clamp a previously saved position immediately so the rail
  // does not cover the page scrollbar.
  addEventListener("resize", () => {
    if (host?.isConnected) placeRail(host.offsetLeft, host.offsetTop);
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "REFRESH_OVERLAY") refresh();
  });
  refresh();
})();
