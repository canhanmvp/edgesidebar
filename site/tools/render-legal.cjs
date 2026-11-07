#!/usr/bin/env node
// Renders the legal pages in store/*.md into static HTML pages in site/.
// Run from anywhere:  node site/tools/render-legal.cjs
// Only needed after editing store/privacy-policy.md, store/terms.md or
// store/refund-policy.md; the site itself has no build step.
//
// Each markdown file holds a Vietnamese part, a line with only "---", then an
// English part. The two parts become <article lang="vi"> and <article lang="en">
// and the site's language toggle shows one of them.
"use strict";

const fs = require("fs");
const path = require("path");

const SITE = path.resolve(__dirname, "..");
const STORE = path.resolve(SITE, "..", "store");
const REPO = "https://github.com/canhanmvp/edgesidebar/blob/main/";

const PAGES = [
  { src: "privacy-policy.md", out: "privacy.html", vi: "Chính sách quyền riêng tư", en: "Privacy Policy" },
  { src: "terms.md", out: "terms.html", vi: "Điều khoản sử dụng", en: "Terms of Service" },
  { src: "refund-policy.md", out: "refund.html", vi: "Chính sách hoàn tiền", en: "Refund Policy" },
];

const LINKS = {
  "privacy-policy.md": "privacy.html",
  "terms.md": "terms.html",
  "refund-policy.md": "refund.html",
  "../LICENSE.md": REPO + "LICENSE.md",
  "../TRADEMARK.md": REPO + "TRADEMARK.md",
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return "\u0000" + (codes.length - 1) + "\u0000";
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const target = LINKS[href] || href;
    return `<a href="${target}">${label}</a>`;
  });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

function render(md) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(
        '<div class="table-scroll" tabindex="0"><table><thead><tr>' +
          head.map((c) => `<th scope="col">${inline(c)}</th>`).join("") +
          "</tr></thead><tbody>" +
          body.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
          "</tbody></table></div>",
      );
      continue;
    }
    if (line.startsWith(">")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith(">")) quote.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s+/, ""));
      out.push("<ul>" + items.map((t) => `<li>${inline(t)}</li>`).join("") + "</ul>");
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||>|[-*]\s)/.test(lines[i])) para.push(lines[i++]);
    const text = inline(para.join(" "));
    const meta = /^(Cập nhật lần cuối|Last updated):/.test(para[0]);
    out.push(meta ? `<p class="legal-meta">${text}</p>` : `<p>${text}</p>`);
  }
  return out.join("\n");
}

function split(md) {
  const parts = md.replace(/\r\n?/g, "\n").split(/\n---\n/);
  if (parts.length !== 2) throw new Error("expected one '---' line between the Vietnamese and English parts");
  return { vi: parts[0], en: parts[1] };
}

const nav = (current) =>
  PAGES.map(
    (p) =>
      `<a href="${p.out}"${p.out === current ? ' aria-current="page"' : ""}><span lang="vi">${p.vi}</span><span lang="en">${p.en}</span></a>`,
  ).join("\n          ");

function page(p) {
  const { vi, en } = split(fs.readFileSync(path.join(STORE, p.src), "utf8"));
  const titleVi = `${p.vi} — Pinned Sidebar`;
  const titleEn = `${p.en} — Pinned Sidebar`;
  return `<!doctype html>
<!-- Generated from store/${p.src} by site/tools/render-legal.cjs. Edit the markdown, then re-run the script. -->
<html lang="vi" data-title-vi="${esc(titleVi)}" data-title-en="${esc(titleEn)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(titleVi)}</title>
    <meta name="theme-color" content="#236b55" />
    <link rel="icon" type="image/svg+xml" href="assets/logo.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png" />
    <link rel="stylesheet" href="style.css" />
    <script src="lang.js"></script>
  </head>
  <body>
    <a class="skip" href="#main"><span lang="vi">Bỏ qua tới nội dung</span><span lang="en">Skip to content</span></a>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="index.html" aria-label="Pinned Sidebar">
          <img src="assets/logo.svg" alt="" width="30" height="30" />
          <span>pinned<span class="brand-dot">.</span></span>
        </a>
        <nav class="nav" aria-label="Main">
          <a href="index.html#features"><span lang="vi">Tính năng</span><span lang="en">Features</span></a>
          <a href="index.html#compare"><span lang="vi">So sánh</span><span lang="en">Compare</span></a>
          <a href="index.html#pricing"><span lang="vi">Bảng giá</span><span lang="en">Pricing</span></a>
          <a href="index.html#faq">FAQ</a>
        </nav>
        <div class="lang-toggle" role="group" aria-label="Ngôn ngữ / Language">
          <button type="button" data-set-lang="vi" aria-pressed="true" title="Tiếng Việt">VI</button>
          <button type="button" data-set-lang="en" aria-pressed="false" title="English">EN</button>
        </div>
      </div>
    </header>
    <main id="main" class="legal">
      <div class="wrap">
        <nav class="legal-nav" aria-label="Legal">
          ${nav(p.out)}
        </nav>
        <article lang="vi">
${render(vi)}
        </article>
        <article lang="en">
${render(en)}
        </article>
      </div>
    </main>
    <footer class="site-footer">
      <div class="wrap">
        <p>
          <span lang="vi">Liên hệ:</span><span lang="en">Contact:</span>
          <a href="mailto:canhanmvp@gmail.com">canhanmvp@gmail.com</a> ·
          <a href="index.html"><span lang="vi">Trang chủ</span><span lang="en">Home</span></a> ·
          <a href="https://github.com/canhanmvp/edgesidebar">GitHub</a>
        </p>
        <p class="footer-small">© 2026 MAI VAN PHO.</p>
      </div>
    </footer>
  </body>
</html>
`;
}

for (const p of PAGES) {
  fs.writeFileSync(path.join(SITE, p.out), page(p));
  console.log(`site/${p.out} <- store/${p.src}`);
}
