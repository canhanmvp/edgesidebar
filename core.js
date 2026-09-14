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
    workspaceId: "workspace-default",
    collapsed: [],
  });
  const DEFAULT_WORKSPACE_ID = "workspace-default";
  const MAX_PINS = 5000;
  const MAX_WORKSPACES = 20;
  const MAX_TAGS = 30;
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
  function id(value, fallback) {
    return typeof value === "string" && value.trim() && value.length <= 120
      ? value
      : fallback();
  }
  function tags(value) {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .filter((item) => typeof item === "string")
          .map((item) => item.trim().slice(0, 40))
          .filter(Boolean),
      ),
    ].slice(0, MAX_TAGS);
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
    if (typeof input.workspaceId === "string")
      result.workspaceId = input.workspaceId;
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
      schema: 3,
      revision: 0,
      updatedAt: 0,
      workspaces: [
        { id: DEFAULT_WORKSPACE_ID, name: "Mặc định", color: "#b5ef55" },
      ],
      pins: [],
      folders: [],
      settings: settings(),
    };
  }
  function parse(input, { migration = false } = {}) {
    const source = Array.isArray(input) ? { pins: input } : input;
    if (!source || !Array.isArray(source.pins))
      fail("File cần có danh sách pins.");
    if (source.schema != null && ![2, 3].includes(source.schema))
      fail("Phiên bản dữ liệu chưa được hỗ trợ.");
    if (source.pins.length > MAX_PINS) fail(`Tối đa ${MAX_PINS} trang ghim.`);
    const result = empty();
    result.workspaces = [];
    const workspaceMap = new Map();
    const workspaceIdsSeen = new Set();
    function workspace(item, fallbackName = "Mặc định") {
      const raw = typeof item === "string" ? { name: item } : item || {};
      const name = label(raw.name, 80, fallbackName);
      const key = name.toLocaleLowerCase("vi");
      let found = workspaceMap.get(key);
      if (!found) {
        let workspaceId = id(raw.id, uid);
        while (workspaceIdsSeen.has(workspaceId)) workspaceId = uid();
        workspaceIdsSeen.add(workspaceId);
        found = {
          id: workspaceId,
          name,
          color:
            typeof raw.color === "string" ? raw.color.slice(0, 20) : "#b5ef55",
        };
        workspaceMap.set(key, found);
        result.workspaces.push(found);
      }
      return found.id;
    }
    if (Array.isArray(source.workspaces))
      source.workspaces.forEach((item) => workspace(item));
    if (!result.workspaces.length)
      result.workspaces.push({
        id: DEFAULT_WORKSPACE_ID,
        name: "Mặc định",
        color: "#b5ef55",
      });
    const defaultWorkspaceId = result.workspaces[0].id;
    const workspaceIds = new Set(result.workspaces.map((item) => item.id));
    const folderMap = new Map();
    const folderIds = new Map();
    const folderIdsSeen = new Set();
    function folder(name, oldId, folderWorkspaceId = defaultWorkspaceId) {
      name = label(name, 80);
      if (!name) return "";
      const key = folderWorkspaceId + "\u0000" + name.toLocaleLowerCase("vi");
      let found = folderMap.get(key);
      if (!found) {
        let folderId = id(oldId, uid);
        while (folderIdsSeen.has(folderId)) folderId = uid();
        folderIdsSeen.add(folderId);
        found = {
          id: folderId,
          name,
          workspaceId: folderWorkspaceId,
        };
        folderMap.set(key, found);
        result.folders.push(found);
      }
      if (oldId) folderIds.set(oldId, found.id);
      return found.id;
    }
    if (Array.isArray(source.folders))
      for (const item of source.folders) {
        if (!item || typeof item.name !== "string")
          fail("Thư mục không hợp lệ.");
        const workspaceId = workspaceIds.has(item.workspaceId)
          ? item.workspaceId
          : defaultWorkspaceId;
        const folderId = folder(item.name, item.id, workspaceId);
        const found = result.folders.find((entry) => entry.id === folderId);
        if (found) found.workspaceId = workspaceId;
      }
    const seen = new Set();
    const pinIdsSeen = new Set();
    let skipped = 0;
    source.pins.forEach((item, index) => {
      try {
        if (!item || typeof item !== "object") fail("Trang ghim không hợp lệ.");
        const address = url(item.url);
        if (seen.has(address)) {
          skipped++;
          return;
        }
        const requestedWorkspaceId = workspaceIds.has(item.workspaceId)
          ? item.workspaceId
          : "";
        const folderId = item.folder
          ? folder(
              item.folder,
              undefined,
              requestedWorkspaceId || defaultWorkspaceId,
            )
          : folderIds.get(item.folderId) || "";
        const folderItem = result.folders.find(
          (entry) => entry.id === folderId,
        );
        const workspaceId =
          requestedWorkspaceId || folderItem?.workspaceId || defaultWorkspaceId;
        let pinId = id(item.id, uid);
        while (pinIdsSeen.has(pinId)) pinId = uid();
        pinIdsSeen.add(pinId);
        result.pins.push({
          id: pinId,
          title: label(item.title, 180, host(address)),
          url: address,
          folderId,
          workspaceId,
          tags: tags(item.tags),
          note: label(item.note, 500),
          favorite: item.favorite === true,
        });
        seen.add(address);
      } catch (error) {
        if (migration) skipped++;
        else fail(`Trang số ${index + 1}: ${error.message}`);
      }
    });
    if (result.folders.length > 500) fail("Tối đa 500 thư mục.");
    if (result.workspaces.length > MAX_WORKSPACES)
      fail(`Tối đa ${MAX_WORKSPACES} không gian.`);
    result.settings = settings(source.settings || {});
    result.settings.workspaceId = workspaceIds.has(result.settings.workspaceId)
      ? result.settings.workspaceId
      : defaultWorkspaceId;
    result.settings.collapsed = result.settings.collapsed
      .map(
        (id) =>
          folderIds.get(id) ||
          result.folders.find(
            (folder) =>
              folder.name.toLocaleLowerCase("vi") ===
              id.toLocaleLowerCase("vi"),
          )?.id,
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
        const workspaceId = next.workspaces.some(
          (item) => item.id === action.workspaceId,
        )
          ? action.workspaceId
          : next.workspaces[0]?.id || DEFAULT_WORKSPACE_ID;
        const folderId = checkFolder(action.folderId);
        const folder = folderId
          ? next.folders.find((item) => item.id === folderId)
          : null;
        if (folder && folder.workspaceId !== workspaceId)
          fail("Thư mục thuộc không gian khác.");
        const entry = {
          title: label(action.title, 180, host(address)),
          url: address,
          folderId,
          workspaceId,
          tags: tags(action.tags),
          note: label(action.note, 500),
          favorite: action.favorite === true,
        };
        if (action.id) {
          const pin = findPin(action.id);
          Object.assign(pin, entry);
        } else next.pins.push({ id: id(action.pinId, uid), ...entry });
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
            workspaceId: next.workspaces.some((w) => w.id === p.workspaceId)
              ? p.workspaceId
              : next.workspaces[0]?.id || DEFAULT_WORKSPACE_ID,
            tags: tags(p.tags),
            note: label(p.note, 500),
            favorite: p.favorite === true,
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
        } else
          next.folders.push({
            id: id(action.folderId, uid),
            name,
            workspaceId: next.workspaces.some(
              (item) => item.id === action.workspaceId,
            )
              ? action.workspaceId
              : next.workspaces[0]?.id || DEFAULT_WORKSPACE_ID,
          });
        break;
      }
      case "SAVE_WORKSPACE": {
        const name = label(action.name, 80);
        if (!name) fail("Hãy nhập tên không gian.");
        if (
          next.workspaces.some(
            (item) =>
              item.name.toLocaleLowerCase("vi") ===
                name.toLocaleLowerCase("vi") && item.id !== action.id,
          )
        )
          fail("Tên không gian đã tồn tại.");
        if (action.id) {
          const item =
            next.workspaces.find((entry) => entry.id === action.id) ||
            fail("Không gian không còn tồn tại.");
          item.name = name;
          if (typeof action.color === "string")
            item.color = action.color.slice(0, 20);
        } else {
          if (next.workspaces.length >= MAX_WORKSPACES)
            fail(`Tối đa ${MAX_WORKSPACES} không gian.`);
          next.workspaces.push({
            id: id(action.workspaceId, uid),
            name,
            color:
              typeof action.color === "string"
                ? action.color.slice(0, 20)
                : "#b5ef55",
          });
        }
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
      case "DELETE_WORKSPACE": {
        if (next.workspaces.length < 2)
          fail("Cần giữ lại ít nhất một không gian.");
        const workspace =
          next.workspaces.find((item) => item.id === action.id) ||
          fail("Không gian không còn tồn tại.");
        const fallback = next.workspaces.find(
          (item) => item.id !== workspace.id,
        );
        next.workspaces = next.workspaces.filter(
          (item) => item.id !== workspace.id,
        );
        next.folders = next.folders.filter(
          (item) => item.workspaceId !== workspace.id,
        );
        next.pins = next.pins.filter(
          (item) => item.workspaceId !== workspace.id,
        );
        if (next.settings.workspaceId === workspace.id)
          next.settings.workspaceId = fallback.id;
        break;
      }
      case "REORDER_FOLDER": {
        checkFolder(action.id);
        if (action.beforeId === action.id) break;
        if (action.beforeId) checkFolder(action.beforeId);
        const folder = next.folders.find((item) => item.id === action.id);
        const before = action.beforeId
          ? next.folders.find((item) => item.id === action.beforeId)
          : null;
        if (before && before.workspaceId !== folder.workspaceId)
          fail("Chỉ sắp xếp bộ sưu tập trong cùng không gian.");
        const peers = next.folders.filter(
          (item) =>
            item.workspaceId === folder.workspaceId && item.id !== folder.id,
        );
        const index = action.beforeId
          ? peers.findIndex((item) => item.id === action.beforeId)
          : peers.length;
        peers.splice(index < 0 ? peers.length : index, 0, folder);
        let peerIndex = 0;
        next.folders = next.folders.map((item) =>
          item.workspaceId === folder.workspaceId ? peers[peerIndex++] : item,
        );
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
        const folder = folderId
          ? next.folders.find((item) => item.id === folderId)
          : null;
        if (folder && folder.workspaceId !== pin.workspaceId)
          fail("Chỉ sắp xếp website trong cùng không gian.");
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
          next.workspaces = incoming.workspaces;
          next.settings.workspaceId = incoming.settings.workspaceId;
          next.settings.collapsed = [];
        } else {
          const workspaces = new Map();
          const workspaceIds = new Set(next.workspaces.map((item) => item.id));
          for (const item of incoming.workspaces) {
            const existing = next.workspaces.find(
              (current) =>
                current.name.toLocaleLowerCase("vi") ===
                item.name.toLocaleLowerCase("vi"),
            );
            if (existing) {
              workspaces.set(item.id, existing.id);
            } else {
              let workspaceId = id(item.id, uid);
              while (workspaceIds.has(workspaceId)) workspaceId = uid();
              workspaceIds.add(workspaceId);
              const added = { ...item, id: workspaceId };
              next.workspaces.push(added);
              workspaces.set(item.id, workspaceId);
            }
          }
          const ids = new Map();
          const folderIds = new Set(next.folders.map((item) => item.id));
          for (const f of incoming.folders) {
            const workspaceId =
              workspaces.get(f.workspaceId) || next.workspaces[0].id;
            const existing = next.folders.find(
              (item) =>
                item.workspaceId === workspaceId &&
                item.name.toLocaleLowerCase("vi") ===
                  f.name.toLocaleLowerCase("vi"),
            );
            if (existing) ids.set(f.id, existing.id);
            else {
              let folderId = id(f.id, uid);
              while (folderIds.has(folderId)) folderId = uid();
              folderIds.add(folderId);
              next.folders.push({ ...f, id: folderId, workspaceId });
              ids.set(f.id, folderId);
            }
          }
          const urls = new Set(next.pins.map((p) => p.url));
          const pinIds = new Set(next.pins.map((item) => item.id));
          for (const p of incoming.pins)
            if (!urls.has(p.url)) {
              let pinId = id(p.id, uid);
              while (pinIds.has(pinId)) pinId = uid();
              pinIds.add(pinId);
              next.pins.push({
                ...p,
                id: pinId,
                folderId: ids.get(p.folderId) || "",
                workspaceId:
                  workspaces.get(p.workspaceId) || next.workspaces[0].id,
              });
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
