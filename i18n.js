/* Gettext-style i18n shared by the worker, UI, content script and Node tests.
   The Vietnamese source text is the key; English lives in i18n-en.js. */
(function (root) {
  "use strict";
  const EN =
    root.PinnedI18nEN ||
    (typeof require === "function" ? require("./i18n-en.js") : {});
  const LANGUAGES = Object.freeze([
    ["auto", "Theo trình duyệt"],
    ["vi", "Tiếng Việt"],
    ["en", "English"],
  ]);
  // Extension pages cache the choice so text is right before storage loads.
  // Never in content scripts: their localStorage belongs to the website.
  const CACHE_KEY = "pinned.language";
  const storage =
    root.location?.protocol === "chrome-extension:" ? root.localStorage : null;
  function cached() {
    try {
      return storage?.getItem(CACHE_KEY) || "";
    } catch {
      return "";
    }
  }
  function detect() {
    let ui = "";
    try {
      ui = root.chrome?.i18n?.getUILanguage?.() || "";
    } catch {}
    ui = ui || root.navigator?.language || "vi";
    return /^vi\b/i.test(ui) ? "vi" : "en";
  }
  let language = ["vi", "en"].includes(cached()) ? cached() : "vi";
  function setLanguage(value) {
    language = value === "vi" || value === "en" ? value : detect();
    try {
      storage?.setItem(CACHE_KEY, language);
    } catch {}
    if (root.document?.documentElement)
      root.document.documentElement.lang = language;
    return language;
  }
  // t("Đã lưu {0} tab", [3]) or t("Xin chào {name}", { name }).
  function t(text, params) {
    let out =
      language === "en" && Object.hasOwn(EN, text) ? EN[text] : String(text);
    if (params)
      out = out.replace(/\{(\w+)\}/g, (match, key) =>
        Object.hasOwn(params, key) ? String(params[key]) : match,
      );
    return out;
  }
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  // Translates the static markup of a page once, before user data renders.
  function translateDom(node) {
    if (language === "vi" || !node) return;
    const walker = root.document.createTreeWalker(node, 4 /* SHOW_TEXT */);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const key = normalize(text.nodeValue);
      if (key && Object.hasOwn(EN, key)) {
        const [, lead, , trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text.nodeValue);
        text.nodeValue = lead + EN[key] + trail;
      }
    }
    // data-en overrides a key that means different things in different places.
    for (const el of node.querySelectorAll("[data-en]"))
      el.textContent = el.dataset.en;
    for (const el of node.querySelectorAll(
      "[title],[aria-label],[placeholder]",
    ))
      for (const attr of ["title", "aria-label", "placeholder"]) {
        const key = el.hasAttribute(attr) && normalize(el.getAttribute(attr));
        if (key && Object.hasOwn(EN, key)) el.setAttribute(attr, EN[key]);
      }
  }
  const api = {
    LANGUAGES,
    t,
    setLanguage,
    translateDom,
    detect,
    get language() {
      return language;
    },
  };
  root.PinnedI18n = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
