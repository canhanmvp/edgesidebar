// Language toggle for the Pinned Sidebar site. Loaded in <head> so the right
// language is set before the page paints. Order: ?lang= > saved choice > browser.
(function () {
  var KEY = "pinned-site-lang";
  var root = document.documentElement;

  function pick() {
    var q = /[?&]lang=(vi|en)\b/.exec(location.search);
    if (q) return q[1];
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === "vi" || saved === "en") return saved;
    } catch (e) {}
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return /^vi\b/i.test(nav) ? "vi" : "en";
  }

  function apply(lang, save) {
    root.lang = lang;
    var title = root.getAttribute("data-title-" + lang);
    if (title) document.title = title;
    var desc = root.getAttribute("data-desc-" + lang);
    var meta = document.querySelector('meta[name="description"]');
    if (desc && meta) meta.setAttribute("content", desc);
    var buttons = document.querySelectorAll("[data-set-lang]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-pressed", String(buttons[i].getAttribute("data-set-lang") === lang));
    }
    if (save) {
      try {
        localStorage.setItem(KEY, lang);
      } catch (e) {}
    }
  }

  apply(pick(), false);

  document.addEventListener("DOMContentLoaded", function () {
    apply(root.lang, false);
    document.addEventListener("click", function (event) {
      var btn = event.target.closest ? event.target.closest("[data-set-lang]") : null;
      if (!btn) return;
      apply(btn.getAttribute("data-set-lang"), true);
    });
  });
})();
