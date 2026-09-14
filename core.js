/* Shared, DOM-free data model. Used by the worker, UI and Node tests. */
(function (root) {
  "use strict";
  const DEFAULTS = Object.freeze({
    theme: "system",
    compact: false,
    overlay: true,
    overlaySide: "right",
    overlayX: null,
    overlayY: null,
    overlayWidth: 240,
    openMode: "sidebar",
    sync: true,
    collapsed: [],
  });
  const MAX_PINS = 5000;
  function fail(message) {
    throw new Error(message);
  }
  function uid() {
    return crypto.randomUUID();
  }
  function label(value, limit, fallback = "") {
    if (value == null || value === "") return fallback;
    if (typeof value !== "string") fail("Tên phải là văn bản.");
    const result = value.trim();
    if (result.length > limit) fail(`Tên quá dài (tối đa ${limit} ký tự).`);
    return result || fallback;
  }
  function url(raw) {
    if (typeof raw !== "string" || !raw.trim())
      fail("Hãy nhập địa chỉ website.");
    let input = raw.trim();
    if (input.length > 4096) fail("Địa chỉ quá dài.");
    if (!/^https?:\/\//i.test(input)) {
      if (
        /^[a-z][a-z\d+.-]*:/i.test(input) &&
        !/^[\w.-]+:\d+(\/|$)/.test(input)
      ) {
        fail("Chỉ hỗ trợ địa chỉ http:// hoặc https://.");
      }
      input = "https://" + input;
    }
    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      fail("Địa chỉ website không hợp lệ.");
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      fail("Dùng địa chỉ HTTP/HTTPS không chứa tên đăng nhập hoặc mật khẩu.");
    }
    return parsed.href;
  }
  function host(value) {
    return new URL(value).hostname.replace(/^www\./, "");
  }
  function settings(input = {}) {
    const result = { ...DEFAULTS, collapsed: [] };
    for (const key of ["compact", "overlay", "sync"])
      if (typeof input[key] === "boolean") result[key] = input[key];
    for (const [key, choices] of Object.entries({
      theme: ["system", "light", "dark", "black", "pastel"],
      overlaySide: ["left", "right"],
      openMode: ["sidebar", "tab"],
    })) {
      if (choices.includes(input[key])) result[key] = input[key];
    }
    if (Number.isFinite(input.overlayWidth))
      result.overlayWidth = Math.max(
        160,
        Math.min(420, Math.round(input.overlayWidth)),
      );
    for (const key of ["overlayX", "overlayY"])
      if (input[key] === null) result[key] = null;
      else if (Number.isFinite(input[key]))
        result[key] = Math.max(0, Math.min(10000, Math.round(input[key])));
    if (Array.isArray(input.collapsed))
      result.collapsed = [
        ...new Set(input.collapsed.filter((v) => typeof v === "string")),
      ];
    return result;
  }
  function empty() {
    return {
      schema: 2,
      revision: 0,
      updatedAt: 0,
      pins: [],
      folders: [],
      settings: settings(),
    };
  }
  function parse(input, { migration = false } = {}) {
    const source = Array.isArray(input) ? { pins: input } : input;
    if (!source || !Array.isArray(source.pins))
      fail("File cần có danh sách pins.");
    if (source.schema != null && source.schema !== 2)
      fail("Phiên bản dữ liệu chưa được hỗ trợ.");
    if (source.pins.length > MAX_PINS) fail(`Tối đa ${MAX_PINS} trang ghim.`);
    const result = empty();
    const folderMap = new Map();
    const folderIds = new Map();
    function folder(name, oldId) {
      name = label(name, 80);
      if (!name) return "";
      let found = folderMap.get(name.toLocaleLowerCase("vi"));
      if (!found) {
        found = { id: uid(), name };
        folderMap.set(name.toLocaleLowerCase("vi"), found);
        result.folders.push(found);
      }
      if (oldId) folderIds.set(oldId, found.id);
      return found.id;
    }
    if (Array.isArray(source.folders))
      for (const item of source.folders) {
        if (!item || typeof item.name !== "string")
          fail("Thư mục không hợp lệ.");
        folder(item.name, item.id);
      }
    const seen = new Set();
    let skipped = 0;
    source.pins.forEach((item, index) => {
      try {
        if (!item || typeof item !== "object") fail("Trang ghim không hợp lệ.");
        const address = url(item.url);
        if (seen.has(address)) {
          skipped++;
          return;
        }
        const folderId = item.folder
          ? folder(item.folder)
          : folderIds.get(item.folderId) || "";
        result.pins.push({
          id: uid(),
          title: label(item.title, 180, host(address)),
          url: address,
          folderId,
        });
        seen.add(address);
      } catch (error) {
        if (migration) skipped++;
        else fail(`Trang số ${index + 1}: ${error.message}`);
      }
    });
    if (result.folders.length > 500) fail("Tối đa 500 thư mục.");
    result.settings = settings(source.settings || {});
    result.settings.collapsed = result.settings.collapsed
      .map(
        (id) =>
          folderIds.get(id) || folderMap.get(id.toLocaleLowerCase("vi"))?.id,
      )
      .filter(Boolean);
    return { state: result, skipped };
  }
  function reduce(state, action) {
    const next = structuredClone(state);
    const findPin = (id) =>
      next.pins.find((p) => p.id === id) ||
      fail("Trang ghim không còn tồn tại. Hãy thử lại.");
    const checkFolder = (id) => {
      if (id && !next.folders.some((f) => f.id === id))
        fail("Thư mục không còn tồn tại.");
      return id || "";
    };
    switch (action.type) {
      case "SAVE_PIN": {
        const address = url(action.url);
        if (next.pins.some((p) => p.url === address && p.id !== action.id))
          fail("Website này đã được ghim.");
        const entry = {
          title: label(action.title, 180, host(address)),
          url: address,
          folderId: checkFolder(action.folderId),
        };
        if (action.id) Object.assign(findPin(action.id), entry);
        else next.pins.push({ id: uid(), ...entry });
        break;
      }
      case "DELETE_PIN":
        findPin(action.id);
        next.pins = next.pins.filter((p) => p.id !== action.id);
        break;
      case "RESTORE_PIN": {
        const p = action.pin;
        if (!p || next.pins.some((item) => item.url === url(p.url)))
          fail("Trang đã có trong danh sách.");
        next.pins.splice(
          Math.max(0, Math.min(next.pins.length, action.index || 0)),
          0,
          {
            id: uid(),
            title: label(p.title, 180, host(url(p.url))),
            url: url(p.url),
            folderId: next.folders.some((f) => f.id === p.folderId)
              ? p.folderId
              : "",
          },
        );
        break;
      }
      case "SAVE_FOLDER": {
        const name = label(action.name, 80);
        if (!name) fail("Hãy nhập tên thư mục.");
        if (
          next.folders.some(
            (f) =>
              f.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi") &&
              f.id !== action.id,
          )
        )
          fail("Tên thư mục đã tồn tại.");
        if (action.id) {
          const item =
            next.folders.find((f) => f.id === action.id) ||
            fail("Thư mục không còn tồn tại.");
          item.name = name;
        } else next.folders.push({ id: uid(), name });
        break;
      }
      case "DELETE_FOLDER":
        checkFolder(action.id);
        next.folders = next.folders.filter((f) => f.id !== action.id);
        next.pins.forEach((p) => {
          if (p.folderId === action.id) p.folderId = "";
        });
        next.settings.collapsed = next.settings.collapsed.filter(
          (id) => id !== action.id,
        );
        break;
      case "REORDER_FOLDER": {
        checkFolder(action.id);
        if (action.beforeId === action.id) break;
        if (action.beforeId) checkFolder(action.beforeId);
        const folder = next.folders.find((item) => item.id === action.id);
        next.folders = next.folders.filter((item) => item.id !== action.id);
        const index = action.beforeId
          ? next.folders.findIndex((item) => item.id === action.beforeId)
          : next.folders.length;
        next.folders.splice(index, 0, folder);
        break;
      }
      case "SET_FOLDER_ORDER": {
        if (
          !Array.isArray(action.ids) ||
          action.ids.length !== next.folders.length ||
          new Set(action.ids).size !== next.folders.length
        )
          fail("Thứ tự bộ sưu tập không hợp lệ.");
        const folders = new Map(next.folders.map((item) => [item.id, item]));
        if (action.ids.some((id) => !folders.has(id)))
          fail("Thứ tự bộ sưu tập không hợp lệ.");
        next.folders = action.ids.map((id) => folders.get(id));
        break;
      }
      case "REORDER": {
        const pin = findPin(action.id);
        const folderId = checkFolder(action.folderId);
        if (action.beforeId === pin.id) break;
        if (action.beforeId && findPin(action.beforeId).folderId !== folderId)
          fail("Vị trí thả không hợp lệ.");
        next.pins = next.pins.filter((p) => p.id !== pin.id);
        pin.folderId = folderId;
        const index = action.beforeId
          ? next.pins.findIndex((p) => p.id === action.beforeId)
          : next.pins.length;
        next.pins.splice(index, 0, pin);
        break;
      }
      case "SETTINGS":
        next.settings = settings({ ...next.settings, ...action.patch });
        break;
      case "TOGGLE_FOLDER": {
        checkFolder(action.id);
        const set = new Set(next.settings.collapsed);
        set.has(action.id) ? set.delete(action.id) : set.add(action.id);
        next.settings.collapsed = [...set];
        break;
      }
      case "IMPORT": {
        if (!["merge", "replace"].includes(action.mode))
          fail("Hãy chọn gộp hoặc thay thế.");
        const incoming = parse(action.data).state;
        if (action.mode === "replace") {
          next.pins = incoming.pins;
          next.folders = incoming.folders;
          next.settings.collapsed = [];
        } else {
          const ids = new Map();
          for (const f of incoming.folders) {
            const existing = next.folders.find(
              (item) =>
                item.name.toLocaleLowerCase("vi") ===
                f.name.toLocaleLowerCase("vi"),
            );
            if (!existing) next.folders.push(f);
            ids.set(f.id, existing ? existing.id : f.id);
          }
          const urls = new Set(next.pins.map((p) => p.url));
          for (const p of incoming.pins)
            if (!urls.has(p.url)) {
              next.pins.push({ ...p, folderId: ids.get(p.folderId) || "" });
              urls.add(p.url);
            }
        }
        break;
      }
      default:
        fail("Thao tác không được hỗ trợ.");
    }
    if (next.pins.length > MAX_PINS || next.folders.length > 500)
      fail("Đã đạt giới hạn 5.000 trang hoặc 500 thư mục.");
    next.revision = state.revision + 1;
    next.updatedAt = Date.now();
    return next;
  }
  function chunks(text, maxBytes = 7000) {
    const encoder = new TextEncoder();
    const result = [];
    let chunk = "";
    let count = 0;
    for (const char of text) {
      const bytes = encoder.encode(JSON.stringify(char).slice(1, -1)).length;
      if (count + bytes > maxBytes) {
        result.push(chunk);
        chunk = "";
        count = 0;
      }
      chunk += char;
      count += bytes;
    }
    if (chunk || !result.length) result.push(chunk);
    return result;
  }
  const api = {
    DEFAULTS,
    MAX_PINS,
    uid,
    url,
    host,
    settings,
    empty,
    parse,
    reduce,
    chunks,
  };
  root.Pinned = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
