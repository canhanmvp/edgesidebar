const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist", "pinned-sidebar");
fs.rmSync(output, { recursive: true, force: true });
const files = [
  "manifest.json",
  "core.js",
  "background.js",
  "icons.js",
  "sidebar.html",
  "sidebar.js",
  "sidebar.css",
  "content.js",
  "content.css",
  "README.md",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];
for (const file of files) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
}
console.log("Built extension: " + output);
