/* Converts exports from other tools (OneTab, Toby, Workona, Raindrop.io and
   Netscape bookmark HTML) into the input Pinned.parse() accepts:
     { workspaces?, folders, pins: [{ url, title, folder, tags, note,
       favorite, workspaceId? }] }
   Pure and DOM-free: HTML is read with a small tolerant tokenizer instead of
   DOMParser, so this runs in the UI, the worker and Node tests alike. */
(function (root) {
  "use strict";
  const C =
    root.Pinned || (typeof require === "function" && require("./core.js"));
  // Mirrors the limits in core.js parse(): over-long text makes parse() throw,
  // so it is trimmed here instead.
  const LIMITS = Object.freeze({
    title: 180,
    note: 500,
    name: 80,
    pins: 5000,
    folders: 500,
    workspaces: 20,
  });
  // Names this module has to make up. English and language-neutral by
  // default; the UI can pass translated ones in options.labels.
  const LABELS = Object.freeze({
    group: "OneTab {n}",
    tabs: "Tabs",
    overflow: "Imported",
  });

  function importError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
  // Collapses whitespace and cuts to `limit` UTF-16 units without leaving a
  // lone high surrogate behind (core.js label() counts .length).
  function clean(value, limit) {
    if (value == null) return "";
    const text = String(value).replace(/\s+/g, " ").trim();
    if (text.length <= limit) return text;
    return text
      .slice(0, limit)
      .replace(/[\uD800-\uDBFF]$/, "")
      .trim();
  }
  function cleanNote(value) {
    if (value == null) return "";
    const text = String(value)
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text.length <= LIMITS.note
      ? text
      : text
          .slice(0, LIMITS.note)
          .replace(/[\uD800-\uDBFF]$/, "")
          .trim();
  }
  // Only absolute http(s) links are imported; everything else (chrome://,
  // javascript:, file:, place:, bare text) is skipped and counted.
  function address(raw) {
    const text = String(raw ?? "").trim();
    if (!/^https?:\/\//i.test(text)) return "";
    try {
      return C.url(text);
    } catch {
      return "";
    }
  }
  function tagList(value) {
    const list = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [];
    return list
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  function text(value) {
    return typeof value === "string" ? value : "";
  }
  // Workona and Toby store collections either as arrays or as objects keyed
  // by id; this reads both.
  function items(value) {
    if (Array.isArray(value)) return value.filter((item) => item);
    if (value && typeof value === "object")
      return Object.values(value).filter((item) => item);
    return [];
  }
  function fill(template, n) {
    return String(template).replace("{n}", n);
  }

  /* ---------- Output builder: dedupes, caps and counts ---------- */

  function builder(labels) {
    const workspaces = [];
    const workspaceKeys = new Map();
    const folders = [];
    const folderKeys = new Map();
    const pins = [];
    const seen = new Set();
    const counts = { skipped: 0, duplicates: 0, truncated: 0 };
    function workspace(name) {
      const label = clean(name, LIMITS.name) || "Workspace";
      const key = label.toLocaleLowerCase("vi");
      if (!workspaceKeys.has(key)) {
        const id = "import-workspace-" + (workspaces.length + 1);
        workspaces.push({ id, name: label });
        workspaceKeys.set(key, id);
      }
      return workspaceKeys.get(key);
    }
    // Returns the folder name actually used. Past the folder limit, new
    // folders fall into one overflow folder per workspace.
    function folder(name, workspaceId = "") {
      let label = clean(name, LIMITS.name);
      if (!label) return "";
      const keyOf = (value) =>
        workspaceId + "\0" + value.toLocaleLowerCase("vi");
      if (folderKeys.has(keyOf(label))) return folderKeys.get(keyOf(label));
      if (folders.length >= LIMITS.folders - 1) {
        label = clean(labels.overflow, LIMITS.name);
        if (folderKeys.has(keyOf(label))) return folderKeys.get(keyOf(label));
        if (folders.length >= LIMITS.folders) return "";
      }
      const entry = { name: label };
      if (workspaceId) entry.workspaceId = workspaceId;
      folders.push(entry);
      folderKeys.set(keyOf(label), label);
      return label;
    }
    function add(item) {
      const url = address(item.url);
      if (!url) {
        counts.skipped++;
        return;
      }
      const workspaceId = item.workspaceId || "";
      const key = workspaceId + "\0" + url;
      if (seen.has(key)) {
        counts.duplicates++;
        return;
      }
      if (pins.length >= LIMITS.pins) {
        counts.truncated++;
        return;
      }
      seen.add(key);
      const pin = {
        url,
        title: clean(item.title, LIMITS.title),
        folder: item.folder ? folder(item.folder, workspaceId) : "",
        tags: tagList(item.tags),
        note: cleanNote(item.note),
        favorite: item.favorite === true,
      };
      if (workspaceId) pin.workspaceId = workspaceId;
      pins.push(pin);
    }
    function result(format) {
      const data = { folders, pins };
      if (workspaces.length) data.workspaces = workspaces;
      return { data, format, ...counts };
    }
    return { workspace, folder, add, result, counts };
  }

  /* ---------- Tolerant HTML tokenizer ---------- */

  const ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  function decode(value) {
    return String(value).replace(
      /&(#x[\da-f]+|#\d+|[a-z]+);?/gi,
      (match, entity) => {
        if (entity[0] === "#") {
          const code =
            entity[1] === "x" || entity[1] === "X"
              ? parseInt(entity.slice(2), 16)
              : parseInt(entity.slice(1), 10);
          return code > 0 &&
            code <= 0x10ffff &&
            !(code >= 0xd800 && code <= 0xdfff)
            ? String.fromCodePoint(code)
            : match;
        }
        const named = ENTITIES[entity.toLowerCase()];
        return named ?? match;
      },
    );
  }
  function attributes(source) {
    const result = {};
    const pattern =
      /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"?|'([^']*)'?|([^\s>]+)))?/g;
    let match;
    while ((match = pattern.exec(source))) {
      const name = match[1].toLowerCase();
      if (name in result) continue;
      result[name] = decode(match[2] ?? match[3] ?? match[4] ?? "");
    }
    return result;
  }
  // Yields { type: "text", text } and { type: "tag", name, close, attrs }.
  // Unknown or broken markup degrades to text instead of throwing.
  function tokenize(html) {
    const tokens = [];
    const length = html.length;
    let index = 0;
    function pushText(value) {
      if (value) tokens.push({ type: "text", text: decode(value) });
    }
    while (index < length) {
      const open = html.indexOf("<", index);
      if (open < 0) {
        pushText(html.slice(index));
        break;
      }
      pushText(html.slice(index, open));
      if (html.startsWith("<!--", open)) {
        const end = html.indexOf("-->", open + 4);
        index = end < 0 ? length : end + 3;
        continue;
      }
      if (html[open + 1] === "!" || html[open + 1] === "?") {
        const end = html.indexOf(">", open);
        index = end < 0 ? length : end + 1;
        continue;
      }
      const head = /^<(\/?)([a-z][\w:-]*)/i.exec(html.slice(open, open + 64));
      if (!head) {
        pushText("<");
        index = open + 1;
        continue;
      }
      // Find the closing ">" while respecting quoted attribute values. A
      // quote still open at a line break is treated as never closed (bookmark
      // exporters write one tag per line) and the first ">" after the name
      // ends the tag instead.
      let cursor = open + head[0].length;
      let quote = "";
      let end = -1;
      for (; cursor < length; cursor++) {
        const char = html[cursor];
        if (quote) {
          if (char === quote) quote = "";
          else if (char === "\n") break;
        } else if (char === '"' || char === "'") quote = char;
        else if (char === ">") {
          end = cursor;
          break;
        }
      }
      if (end < 0) end = html.indexOf(">", open + head[0].length);
      if (end < 0) {
        pushText(html.slice(open));
        break;
      }
      tokens.push({
        type: "tag",
        name: head[2].toLowerCase(),
        close: head[1] === "/",
        attrs: head[1]
          ? {}
          : attributes(html.slice(open + head[0].length, end)),
      });
      index = end + 1;
    }
    return tokens;
  }

  /* ---------- Netscape bookmark HTML ---------- */

  // Returns { title, links: [{ url, title, tags, note, path }], folders }.
  // `path` lists the enclosing folder names, outermost first. Browser root
  // folders (PERSONAL_TOOLBAR_FOLDER, UNFILED_BOOKMARKS_FOLDER) are left out
  // of the path: Chrome writes "Other bookmarks" items straight into the
  // root list, so treating the bar the same way keeps both at one level.
  function readNetscape(html) {
    const tokens = tokenize(html);
    const stack = [];
    const links = [];
    const folders = [];
    let pageTitle = "";
    let mode = "";
    let buffer = "";
    let link = null;
    let folderAttrs = null;
    let pendingFolder = null;
    let lastLink = null;
    let noteTarget = null;
    function path() {
      return stack.filter((entry) => entry && !entry.root).map((e) => e.name);
    }
    function finish() {
      if (mode === "a" && link) {
        link.title = buffer;
        links.push(link);
        lastLink = link;
      } else if (mode === "h3") {
        const attrs = folderAttrs || {};
        pendingFolder = {
          name: clean(buffer, LIMITS.name),
          root:
            attrs.personal_toolbar_folder === "true" ||
            attrs.unfiled_bookmarks_folder === "true",
        };
        lastLink = null;
      } else if (mode === "dd" && noteTarget) {
        noteTarget.note = buffer;
      } else if (mode === "title" || mode === "h1") {
        if (!pageTitle) pageTitle = clean(buffer, 200);
      }
      mode = "";
      buffer = "";
      link = null;
      noteTarget = null;
    }
    for (const token of tokens) {
      if (token.type === "text") {
        if (mode) buffer += token.text;
        continue;
      }
      const { name, close } = token;
      if (close) {
        if (name === "a" && mode === "a") finish();
        else if (name === "h3" && mode === "h3") finish();
        else if ((name === "title" || name === "h1") && mode === name) finish();
        else if (name === "dl") {
          finish();
          pendingFolder = null;
          lastLink = null;
          if (stack.length) stack.pop();
        }
        continue;
      }
      if (name === "br") {
        if (mode) buffer += "\n";
        continue;
      }
      if (name === "a") {
        finish();
        pendingFolder = null;
        mode = "a";
        link = {
          url: token.attrs.href || "",
          title: "",
          tags: tagList(token.attrs.tags),
          note: "",
          path: path(),
        };
      } else if (name === "h3") {
        finish();
        mode = "h3";
        folderAttrs = token.attrs;
      } else if (name === "dl") {
        finish();
        const entry =
          pendingFolder && pendingFolder.name ? pendingFolder : null;
        stack.push(entry);
        if (entry && !entry.root) folders.push(path());
        pendingFolder = null;
        lastLink = null;
      } else if (name === "dt") {
        finish();
        pendingFolder = null;
        lastLink = null;
      } else if (name === "dd") {
        // A <DD> after a link is its note; after a folder heading it is the
        // folder's description, which has nowhere to go.
        const target = mode === "a" ? link : mode === "h3" ? null : lastLink;
        finish();
        noteTarget = target;
        mode = "dd";
      } else if (name === "title" || name === "h1") {
        finish();
        mode = name;
      }
    }
    finish();
    return { title: pageTitle, links, folders };
  }

  /* ---------- Format parsers ---------- */

  // OneTab: Options → "Export / Import URLs" gives one "url | title" per line
  // with a blank line between tab groups. Group names are not exported, so
  // groups are numbered. A plain URL list (Toby/Raindrop TXT) has no " | "
  // and no blank lines that mean anything, so it imports without folders.
  function fromText(input, out, labels) {
    const lines = input.split(/\r\n?|\n/);
    const hasPipes = lines.some((line) => /^\S+ \| /.test(line.trim()));
    let group = 0;
    let groupHasLinks = false;
    let open = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        if (groupHasLinks) open = false;
        continue;
      }
      if (!open) {
        group++;
        open = true;
        groupHasLinks = false;
      }
      const split = line.indexOf(" | ");
      const url = split < 0 ? line : line.slice(0, split);
      const title = split < 0 ? "" : line.slice(split + 3);
      groupHasLinks = true;
      out.add({
        url,
        title,
        folder: hasPipes ? fill(labels.group, group) : "",
      });
    }
    return hasPipes ? "onetab" : "url-list";
  }

  // Minimal RFC 4180 reader: quoted fields, doubled quotes, embedded
  // newlines, CRLF. A quote in the middle of a field is kept as text.
  function csvRows(input) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    let wasQuoted = false;
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (quoted) {
        if (char === '"') {
          if (input[i + 1] === '"') {
            field += '"';
            i++;
          } else quoted = false;
        } else field += char;
      } else if (char === '"' && !field && !wasQuoted) {
        quoted = true;
        wasQuoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
        wasQuoted = false;
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && input[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        wasQuoted = false;
      } else field += char;
    }
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((cells) => cells.some((cell) => cell.trim()));
  }

  // Raindrop.io CSV (Settings → Backups / Export). Raindrop does not document
  // the export header; exports seen in the wild use
  //   id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite
  // (older ones lack `favorite`). Columns are looked up by name, so order
  // and extra columns do not matter. Assumptions: `tags` is comma-separated,
  // `folder` holds the collection title (kept whole, not split on "/"),
  // "Unsorted" is Raindrop's inbox and imports without a folder, `note`
  // falls back to `excerpt`, and `favorite` is "true"/"false".
  function fromCsv(input, out) {
    const [header, ...rows] = csvRows(input);
    const columns = header.map((name) => name.trim().toLowerCase());
    const col = (...names) => {
      for (const name of names) {
        const index = columns.indexOf(name);
        if (index >= 0) return index;
      }
      return -1;
    };
    const at = {
      url: col("url", "link", "href"),
      title: col("title", "name"),
      note: col("note", "notes", "description"),
      excerpt: col("excerpt"),
      folder: col("folder", "collection"),
      tags: col("tags"),
      favorite: col("favorite", "important"),
    };
    const get = (cells, index) => (index >= 0 ? (cells[index] ?? "") : "");
    for (const cells of rows) {
      const folder = get(cells, at.folder).trim();
      out.add({
        url: get(cells, at.url),
        title: get(cells, at.title),
        note: get(cells, at.note) || get(cells, at.excerpt),
        folder: /^unsorted$/i.test(folder) ? "" : folder,
        tags: get(cells, at.tags),
        favorite: /^(true|1|yes)$/i.test(get(cells, at.favorite).trim()),
      });
    }
    const raindrop = ["folder", "excerpt", "highlights", "cover"].some((name) =>
      columns.includes(name),
    );
    return raindrop ? "raindrop-csv" : "csv";
  }

  // Netscape HTML, as written by Chrome, Edge (favorites and Collections),
  // Firefox and Raindrop.io. Nested folders flatten into their first-level
  // folder. TAGS="a,b" (Firefox, Raindrop) becomes tags and the <DD> after a
  // link (Raindrop notes) becomes the note.
  function fromNetscape(parsed, out, format) {
    for (const path of parsed.folders)
      if (path.length === 1) out.folder(path[0]);
    for (const link of parsed.links) out.add({ ...link, folder: link.path[0] });
    return format;
  }

  // Workona: "spaces" become workspaces when there are few enough to fit
  // (core.js allows 20), otherwise one folder per space so nothing is lost.
  // `spaces` is [{ name, folders: [{ name, links: [...] }] }]; links with an
  // empty folder name sit directly in the space.
  function fromSpaces(spaces, out) {
    const used = spaces.filter((space) =>
      space.folders.some((group) => group.links.length),
    );
    const asWorkspaces = used.length > 0 && used.length <= LIMITS.workspaces;
    for (const space of used) {
      if (asWorkspaces) {
        const workspaceId = out.workspace(space.name);
        for (const group of space.folders) {
          if (group.name) out.folder(group.name, workspaceId);
          for (const link of group.links)
            out.add({ ...link, folder: group.name, workspaceId });
        }
      } else {
        out.folder(space.name);
        for (const group of space.folders)
          for (const link of group.links)
            out.add({ ...link, folder: space.name });
      }
    }
  }

  // Workona JSON (Account → Export data → JSON, "userData-<id>.json").
  // Workona publishes no schema. Third-party importers read a top-level
  // `Workspaces` collection whose entries have `title`, `resources` (saved
  // links: title, url, description) and `tabs` (open tabs: title, url),
  // each an object keyed by id or an array. Assumptions: key case may vary,
  // resources may carry a section name (`section`/`sectionTitle`) or sit in
  // `sections[].resources`, and open tabs go into a "Tabs" folder.
  function workonaWorkspaces(json) {
    const keys = ["Workspaces", "workspaces"];
    for (const key of keys) if (json[key]) return items(json[key]);
    for (const value of Object.values(json))
      if (value && typeof value === "object" && !Array.isArray(value))
        for (const key of keys) if (value[key]) return items(value[key]);
    return null;
  }
  function workonaLink(item) {
    return {
      url: text(item.url) || text(item.link),
      title: text(item.title) || text(item.name),
      note: text(item.description) || text(item.note),
      tags: item.tags,
    };
  }
  function fromWorkonaJson(list, out, labels) {
    const spaces = list.map((workspace) => {
      const groups = new Map();
      const group = (name) => {
        const key = clean(name, LIMITS.name);
        if (!groups.has(key)) groups.set(key, { name: key, links: [] });
        return groups.get(key);
      };
      group("");
      for (const section of items(workspace.sections))
        for (const item of items(section.resources))
          group(text(section.title) || text(section.name)).links.push(
            workonaLink(item),
          );
      for (const item of items(workspace.resources))
        group(text(item.sectionTitle) || text(item.section)).links.push(
          workonaLink(item),
        );
      for (const item of items(workspace.tabs))
        group(labels.tabs).links.push(workonaLink(item));
      return {
        name: text(workspace.title) || text(workspace.name),
        folders: [...groups.values()],
      };
    });
    fromSpaces(spaces, out);
    return "workona";
  }
  // Workona HTML. Workona's own export is JSON/YAML; the HTML files people
  // have are bookmark files written from it (Netscape format), usually with
  // one wrapper folder ("Workona" / "Imported from Workona") holding one
  // folder per space. Assumption: the wrapper is dropped, the next level is
  // the space and the level after that is a folder (deeper levels flatten).
  function fromWorkonaHtml(parsed, out) {
    const wrapper = (name) => /workona/i.test(name || "");
    const spaces = new Map();
    const space = (name) => {
      if (!spaces.has(name)) spaces.set(name, { name, groups: new Map() });
      return spaces.get(name);
    };
    for (const link of parsed.links) {
      const path = link.path.slice(wrapper(link.path[0]) ? 1 : 0);
      const entry = space(path[0] || "Workona");
      const folderName = path[1] || "";
      if (!entry.groups.has(folderName))
        entry.groups.set(folderName, { name: folderName, links: [] });
      entry.groups.get(folderName).links.push(link);
    }
    fromSpaces(
      [...spaces.values()].map((entry) => ({
        name: entry.name,
        folders: [...entry.groups.values()],
      })),
      out,
    );
    return "workona-html";
  }

  // Toby JSON (Account → Export → JSON). Toby publishes no schema; exports
  // and community scripts read `{ lists: [{ title, cards: [{ title,
  // customTitle, url, customDescription }] }] }`. `customTitle` overrides
  // `title` when set. Assumptions: newer exports may nest lists in
  // `groups[]` (or `spaces[]`, `organizations[]`); lists are flattened into
  // folders either way. A raw `{ state: "<json>" }` storage dump is unwrapped.
  function tobyLists(json) {
    if (Array.isArray(json.lists)) return json.lists;
    for (const key of ["groups", "spaces", "organizations"])
      if (Array.isArray(json[key]))
        return json[key].flatMap((group) =>
          Array.isArray(group?.lists) ? group.lists : [],
        );
    return null;
  }
  function fromToby(lists, out) {
    for (const list of lists) {
      if (!list || typeof list !== "object") continue;
      const folder = out.folder(text(list.title) || text(list.name));
      for (const card of items(list.cards)) {
        if (typeof card !== "object") {
          out.counts.skipped++;
          continue;
        }
        out.add({
          url: card.url,
          title: text(card.customTitle) || text(card.title),
          note:
            text(card.customDescription) ||
            text(card.description) ||
            text(card.note),
          tags: card.tags,
          folder,
        });
      }
    }
    return "toby";
  }

  /* ---------- Entry point ---------- */

  function looksLikeHtml(input) {
    return (
      /^<!doctype\s+netscape-bookmark-file/i.test(input) ||
      (/^</.test(input) && /<(dl|dt|a)\b/i.test(input.slice(0, 20000)))
    );
  }
  function looksLikeCsv(input, fileName) {
    const first = input.split(/\r\n?|\n/, 1)[0] || "";
    if (!first.includes(",")) return false;
    const header = csvRows(first)[0] || [];
    const names = header.map((name) => name.trim().toLowerCase());
    return (
      names.some((name) => ["url", "link", "href"].includes(name)) &&
      (/\.csv$/i.test(fileName) || names.length > 1)
    );
  }
  function looksLikeText(input) {
    const lines = input.split(/\r\n?|\n/).map((line) => line.trim());
    const filled = lines.filter(Boolean);
    if (!filled.length) return false;
    const urlish = filled.filter((line) => /^[a-z][\w+.-]*:\S/i.test(line));
    return urlish.length / filled.length >= 0.5;
  }

  // text: file contents; fileName: used as a hint only. Returns
  // { data, format, skipped, duplicates, truncated } where `data` is ready
  // for Pinned.parse() and `skipped` counts non-http(s) or unreadable links.
  // Throws an Error with a `code` ("EMPTY", "INVALID_JSON", "UNKNOWN_FORMAT")
  // and an English message the UI can replace.
  function parseImport(input, fileName = "", options = {}) {
    const labels = { ...LABELS, ...(options.labels || {}) };
    const source = String(input ?? "")
      .replace(/^﻿/, "")
      .trim();
    const name = String(fileName || "");
    if (!source) throw importError("EMPTY", "The file is empty.");
    const out = builder(labels);
    if (/^[[{]/.test(source)) {
      let json;
      try {
        json = JSON.parse(source);
      } catch {
        throw importError("INVALID_JSON", "The file is not valid JSON.");
      }
      if (json && typeof json.state === "string") {
        try {
          json = JSON.parse(json.state);
        } catch {
          /* not a Toby storage dump */
        }
      }
      if (Array.isArray(json))
        json = json.some((item) => item && Array.isArray(item.cards))
          ? { lists: json }
          : { pins: json };
      if (json && Array.isArray(json.pins))
        return {
          data: json,
          format: "pinned",
          skipped: 0,
          duplicates: 0,
          truncated: 0,
        };
      const lists = json && tobyLists(json);
      if (lists) return out.result(fromToby(lists, out));
      const workspaces = json && workonaWorkspaces(json);
      if (workspaces)
        return out.result(fromWorkonaJson(workspaces, out, labels));
      throw importError(
        "UNKNOWN_FORMAT",
        "This JSON file is not a known export.",
      );
    }
    if (looksLikeHtml(source)) {
      const parsed = readNetscape(source);
      const top = parsed.links.map((link) => link.path[0] || "");
      if (
        /workona/i.test(name) ||
        /workona/i.test(parsed.title) ||
        top.some((folder) => /workona/i.test(folder))
      )
        return out.result(fromWorkonaHtml(parsed, out));
      // Raindrop's HTML is plain Netscape; the file name is the only reliable
      // hint, so the format label falls back to "netscape".
      const format = /raindrop/i.test(name) ? "raindrop-html" : "netscape";
      return out.result(fromNetscape(parsed, out, format));
    }
    if (looksLikeCsv(source, name)) return out.result(fromCsv(source, out));
    if (looksLikeText(source)) return out.result(fromText(source, out, labels));
    throw importError("UNKNOWN_FORMAT", "This file is not a known export.");
  }

  const api = { LIMITS, LABELS, parseImport, tokenize, readNetscape, csvRows };
  root.PinnedImport = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
