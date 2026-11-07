const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const I18N = require("../i18n.js");
const EN = require("../i18n-en.js");
const C = require("../core.js");

const root = path.resolve(__dirname, "..");
// Latin letters with diacritics (Vietnamese), excluding the symbols × and ÷.
const VI = /[À-ÖØ-öø-ỹ]/;
const SOURCES = [
  "core.js",
  "bookmarks-core.js",
  "background.js",
  "sidebar.js",
  "sidebar-bookmarks.js",
  "sidebar-cleanup.js",
  "content.js",
];
const placeholders = (text) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// Walks the real AST so strings inside comments or regexes never count.
async function literals(file) {
  const babel = await import("prettier/plugins/babel");
  const src = fs.readFileSync(path.join(root, file), "utf8");
  const ast = await babel.parsers.babel.parse(src, {});
  const keys = [];
  const bare = [];
  (function walk(node, parent) {
    const call =
      parent?.type === "CallExpression" &&
      parent.callee.type === "Identifier" &&
      parent.callee.name === "t" &&
      parent.arguments[0] === node;
    const key =
      parent?.type === "ObjectProperty" &&
      parent.key === node &&
      !parent.computed;
    if (node.type === "StringLiteral" && VI.test(node.value)) {
      if (call) keys.push(node.value);
      else if (!key)
        bare.push(`${file}:${node.loc.start.line} "${node.value}"`);
    }
    if (
      node.type === "TemplateLiteral" &&
      node.quasis.some((q) => VI.test(q.value.cooked))
    )
      bare.push(`${file}:${node.loc.start.line} template literal`);
    for (const [name, value] of Object.entries(node)) {
      if (name === "loc") continue;
      if (Array.isArray(value))
        value.forEach((child) => child?.type && walk(child, node));
      else if (value?.type) walk(value, node);
    }
  })(ast.program, null);
  return { keys, bare };
}
function htmlKeys() {
  const html = fs
    .readFileSync(path.join(root, "sidebar.html"), "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, "");
  const keys = new Set();
  const norm = (s) => s.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  for (const m of html.matchAll(/>([^<]+)</g)) keys.add(norm(m[1]));
  for (const m of html.matchAll(/(?:title|aria-label|placeholder)="([^"]*)"/g))
    keys.add(norm(m[1]));
  // Brand names and samples stay as they are in every language.
  const SAME = [
    "Pinned Sidebar",
    "pinned",
    "Bookmark",
    "BOOKMARK",
    "https://example.com",
  ];
  return [...keys].filter(
    (key) => /[a-z]/i.test(key) && !SAME.includes(key) && !/^V\d/.test(key),
  );
}

test("every Vietnamese UI string goes through t() and has an English entry", async () => {
  const missing = [];
  const unwrapped = [];
  for (const file of SOURCES) {
    const { keys, bare } = await literals(file);
    unwrapped.push(...bare);
    for (const key of keys)
      if (!Object.hasOwn(EN, key)) missing.push(`${file}: ${key}`);
  }
  for (const key of htmlKeys())
    if (!Object.hasOwn(EN, key)) missing.push(`sidebar.html: ${key}`);
  assert.deepEqual(unwrapped, [], "wrap these in t()");
  assert.deepEqual(missing, [], "add these to i18n-en.js");
});

test("English entries keep the same placeholders and are not left in Vietnamese", () => {
  for (const [key, value] of Object.entries(EN)) {
    assert.deepEqual(placeholders(value), placeholders(key), key);
    // Leading/trailing spaces matter: these strings are concatenated.
    assert.equal(/^\s/.test(value), /^\s/.test(key), "leading space: " + key);
    assert.equal(/\s$/.test(value), /\s$/.test(key), "trailing space: " + key);
    assert.ok(!VI.test(value), "untranslated: " + key);
  }
});

test("t() formats params and follows the chosen language", () => {
  try {
    assert.equal(I18N.setLanguage("vi"), "vi");
    assert.equal(
      I18N.t("Đã lưu {0} tab thành một phiên.", [3]),
      "Đã lưu 3 tab thành một phiên.",
    );
    assert.equal(I18N.t("chưa dịch {x}", { x: 1 }), "chưa dịch 1");
    assert.equal(I18N.setLanguage("en"), "en");
    assert.equal(
      I18N.t("Đã lưu {0} tab thành một phiên.", [3]),
      "Saved 3 tabs as a session.",
    );
    assert.equal(I18N.t("Không có trong từ điển"), "Không có trong từ điển");
    assert.throws(() => C.url("javascript:alert(1)"), /Only http/);
    assert.throws(
      () => C.parse([{ url: "a.test" }, { url: "ftp://x" }]),
      /Site 2/,
    );
    assert.ok(["vi", "en"].includes(I18N.setLanguage("auto")));
  } finally {
    I18N.setLanguage("vi");
  }
});

test("language setting is validated and defaults to the browser", () => {
  assert.equal(C.settings().language, "auto");
  assert.equal(C.settings({ language: "en" }).language, "en");
  assert.equal(C.settings({ language: "fr" }).language, "auto");
});

test("manifest strings exist in every locale", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
  );
  const used = JSON.stringify(manifest)
    .match(/__MSG_(\w+)__/g)
    .map((m) => m.slice(6, -2));
  for (const locale of ["en", "vi"]) {
    const messages = JSON.parse(
      fs.readFileSync(
        path.join(root, "_locales", locale, "messages.json"),
        "utf8",
      ),
    );
    for (const key of used)
      assert.ok(messages[key]?.message, `${locale}: ${key}`);
  }
  assert.ok(
    fs.existsSync(path.join(root, "_locales", manifest.default_locale)),
  );
});
