const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist", "pinned-sidebar");
// Browser tests cannot click Chromium's permission prompt, so test builds
// grant optional permissions up front. Never use this flag for releases.
const grantOptional = process.argv.includes("--grant-optional");
fs.rmSync(output, { recursive: true, force: true });
const files = [
  "manifest.json",
  "core.js",
  "bookmarks-core.js",
  "background.js",
  "icons.js",
  "sidebar.html",
  "sidebar.js",
  "sidebar-bookmarks.js",
  "sidebar-cleanup.js",
  "sidebar.css",
  "content.js",
  "content.css",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
];
for (const file of files) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
}
if (grantOptional) {
  const target = path.join(output, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(target, "utf8"));
  manifest.permissions.push(...(manifest.optional_permissions || []));
  delete manifest.optional_permissions;
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + "\n");
}
console.log("Built extension: " + output + (grantOptional ? " (test)" : ""));
