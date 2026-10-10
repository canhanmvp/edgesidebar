/* Builds the extension, validates it against store rules, and writes one zip for
   both Chrome Web Store and Microsoft Edge Add-ons (same MV3 package). */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
execFileSync(process.execPath, [path.join(__dirname, "build.cjs")], {
  stdio: "inherit",
});
const dir = path.join(root, "dist", "pinned-sidebar");
const manifest = JSON.parse(
  fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
);

const problems = [];
const check = (ok, message) => ok || problems.push(message);
check(manifest.manifest_version === 3, "manifest_version phải là 3");
check(
  /^\d+(\.\d+){0,3}$/.test(manifest.version),
  "version phải dạng 1-4 số cách nhau bằng dấu chấm",
);
check(manifest.name.length <= 45, "name tối đa 45 ký tự");
check(
  manifest.description && manifest.description.length <= 132,
  "description bắt buộc, tối đa 132 ký tự",
);
for (const size of ["16", "48", "128"])
  check(manifest.icons?.[size], "thiếu icon " + size + "px");
const referenced = new Set([
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...Object.values(manifest.icons || {}),
  ...(manifest.content_scripts || []).flatMap((s) => [
    ...(s.js || []),
    ...(s.css || []),
  ]),
  ...(manifest.web_accessible_resources || []).flatMap((r) => r.resources),
]);
for (const file of referenced)
  if (file) check(fs.existsSync(path.join(dir, file)), "thiếu file " + file);
for (const file of ["sidebar.html"])
  for (const m of fs
    .readFileSync(path.join(dir, file), "utf8")
    .matchAll(/(?:src|href)="([^"#?]+)"/g)) {
    if (/^(https?:|data:)/.test(m[1])) {
      problems.push(
        file + " tải tài nguyên ngoài (remote code bị cấm): " + m[1],
      );
    } else check(fs.existsSync(path.join(dir, m[1])), "thiếu file " + m[1]);
  }

function walk(base) {
  return fs.readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(base, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
const files = walk(dir).sort();
for (const file of files) {
  const rel = path.relative(dir, file).split(path.sep).join("/");
  check(
    !/\.(map|log|md|cjs|zip)$/.test(rel),
    "file không nên đóng gói: " + rel,
  );
  if (/\.js$/.test(rel)) {
    const source = fs.readFileSync(file, "utf8");
    check(!/\beval\s*\(|new Function\s*\(/.test(source), rel + " dùng eval");
  }
}
if (problems.length) {
  console.error("Gói chưa đạt chuẩn store:\n- " + problems.join("\n- "));
  process.exit(1);
}

// Minimal ZIP writer: forward-slash names, fixed timestamp => reproducible output.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const DOS_TIME = 0;
const DOS_DATE = (2026 - 1980) * 512 + 1 * 32 + 1;
const locals = [];
const centrals = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(path.relative(dir, file).split(path.sep).join("/"));
  const data = fs.readFileSync(file);
  const packed = zlib.deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  local.copy(central, 6, 4, 30);
  central.writeUInt32LE(offset, 42);
  locals.push(local, name, packed);
  centrals.push(central, name);
  offset += local.length + name.length + packed.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);
const releaseDir = path.join(root, "release");
fs.mkdirSync(releaseDir, { recursive: true });
const zipPath = path.join(
  releaseDir,
  "pinned-sidebar-" + manifest.version + ".zip",
);
fs.writeFileSync(zipPath, Buffer.concat([...locals, ...centrals, end]));
console.log(
  "Packaged " +
    files.length +
    " files, " +
    (fs.statSync(zipPath).size / 1024).toFixed(1) +
    " KB: " +
    zipPath,
);
