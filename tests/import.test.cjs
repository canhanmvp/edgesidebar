const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");
const I = require("../import-core.js");

// Every result must survive the real data model, as the IMPORT flow uses it.
function load(text, fileName) {
  const result = I.parseImport(text, fileName);
  const parsed = C.parse(result.data);
  assert.equal(
    parsed.skipped,
    0,
    "import-core should already have removed duplicates",
  );
  return { ...result, state: parsed.state };
}
function folderOf(state, pin) {
  return state.folders.find((folder) => folder.id === pin.folderId)?.name || "";
}
function byUrl(state, url) {
  return state.pins.find((pin) => pin.url === url);
}

test("OneTab: groups become folders, non-http lines are skipped", () => {
  const text = [
    "https://vnexpress.net/ | VnExpress - Báo tiếng Việt nhiều người xem nhất",
    "https://tuoitre.vn/the-gioi.htm | Thế giới | Tuổi Trẻ Online",
    "chrome://extensions/ | Extensions",
    "https://vnexpress.net/ | VnExpress (bản trùng)",
    "",
    "https://github.com/canhanmvp/edgesidebar | GitHub - edgesidebar",
    "https://developer.chrome.com/docs/extensions/reference/api/sidePanel",
    "this line is not a link",
    "file:///C:/Users/me/notes.txt | notes.txt",
    "",
    "",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ | Video",
  ].join("\r\n");
  const result = load(text, "onetab.txt");
  assert.equal(result.format, "onetab");
  assert.equal(result.skipped, 3);
  assert.equal(result.duplicates, 1);
  assert.deepEqual(
    result.state.folders.map((folder) => folder.name),
    ["OneTab 1", "OneTab 2", "OneTab 3"],
  );
  const tuoitre = byUrl(result.state, "https://tuoitre.vn/the-gioi.htm");
  assert.equal(tuoitre.title, "Thế giới | Tuổi Trẻ Online");
  assert.equal(folderOf(result.state, tuoitre), "OneTab 1");
  const docs = byUrl(
    result.state,
    "https://developer.chrome.com/docs/extensions/reference/api/sidePanel",
  );
  assert.equal(docs.title, "developer.chrome.com", "falls back to the host");
  assert.equal(result.state.pins.length, 5);
});

test("plain URL list imports without folders", () => {
  const result = load(
    "https://example.com/a\nhttps://example.com/b\n\nhttps://example.com/c\n",
  );
  assert.equal(result.format, "url-list");
  assert.equal(result.state.pins.length, 3);
  assert.equal(result.state.folders.length, 0);
});

test("Toby JSON: lists become folders, customTitle wins", () => {
  const toby = {
    version: 3,
    lists: [
      {
        title: "Công việc",
        cards: [
          {
            title: "Trello Board",
            customTitle: "Bảng kế hoạch Q4",
            url: "https://trello.com/b/abc123/q4",
            customDescription: "Họp thứ Hai",
            favIconUrl: "https://trello.com/favicon.ico",
          },
          { title: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" },
          { title: "Bad card", url: "javascript:alert(1)" },
          { title: "No url" },
          "garbage",
          null,
        ],
      },
      {
        title: "Đọc sau",
        cards: [
          { title: "MDN", url: "https://developer.mozilla.org/vi/" },
          { title: "Trello again", url: "https://trello.com/b/abc123/q4" },
        ],
      },
      { title: "Danh sách trống", cards: [] },
      { title: "x".repeat(200), cards: [{ url: "https://long.example/" }] },
    ],
  };
  const result = load(JSON.stringify(toby), "toby-export.json");
  assert.equal(result.format, "toby");
  assert.equal(result.skipped, 3);
  assert.equal(result.duplicates, 1, "same URL in another list, same space");
  assert.deepEqual(
    result.state.folders.map((folder) => folder.name),
    ["Công việc", "Đọc sau", "Danh sách trống", "x".repeat(80)],
  );
  const trello = result.state.pins.filter(
    (pin) => pin.url === "https://trello.com/b/abc123/q4",
  );
  assert.equal(trello.length, 1);
  assert.equal(trello[0].title, "Bảng kế hoạch Q4");
  assert.equal(trello[0].note, "Họp thứ Hai");
});

test("Toby JSON: raw storage dump and grouped lists", () => {
  const state = JSON.stringify({
    groups: [
      {
        name: "Team",
        lists: [{ title: "Tài liệu", cards: [{ url: "https://a.example/" }] }],
      },
    ],
  });
  const result = load(JSON.stringify({ state }), "TobyBackup1700000000.json");
  assert.equal(result.format, "toby");
  assert.equal(folderOf(result.state, result.state.pins[0]), "Tài liệu");
});

test("Workona JSON: spaces become workspaces with sections and tabs", () => {
  const workona = {
    Workspaces: {
      ws1: {
        title: "Dự án Pawshop",
        resources: {
          r1: {
            title: "Figma – Trang chủ",
            url: "https://www.figma.com/file/xyz/home",
            description: "Bản thiết kế mới nhất",
          },
          r2: {
            title: "Sổ tay",
            url: "https://www.notion.so/pawshop",
            sectionTitle: "Tài liệu",
          },
          r3: { title: "Local", url: "file:///D:/pawshop" },
        },
        tabs: {
          t1: { title: "Shopee", url: "https://shopee.vn/" },
          t2: {
            title: "Figma dup",
            url: "https://www.figma.com/file/xyz/home",
          },
        },
      },
      ws2: {
        title: "Cá nhân",
        sections: [
          {
            title: "Giải trí",
            resources: [{ title: "Spotify", url: "https://open.spotify.com/" }],
          },
        ],
        resources: [],
      },
      ws3: { title: "Trống", resources: {}, tabs: {} },
    },
  };
  const result = load(JSON.stringify(workona), "userData-12345.json");
  assert.equal(result.format, "workona");
  assert.equal(result.skipped, 1);
  assert.equal(result.duplicates, 1, "Figma is both a resource and a tab");
  assert.deepEqual(
    result.state.workspaces.map((workspace) => workspace.name),
    ["Dự án Pawshop", "Cá nhân"],
  );
  const [pawshop, personal] = result.state.workspaces;
  const figma = result.state.pins.filter(
    (pin) => pin.url === "https://www.figma.com/file/xyz/home",
  );
  assert.equal(figma.length, 1);
  assert.equal(figma[0].workspaceId, pawshop.id);
  assert.equal(figma[0].note, "Bản thiết kế mới nhất");
  assert.equal(folderOf(result.state, figma[0]), "");
  const notion = byUrl(result.state, "https://www.notion.so/pawshop");
  assert.equal(folderOf(result.state, notion), "Tài liệu");
  assert.equal(
    folderOf(result.state, byUrl(result.state, "https://shopee.vn/")),
    "Tabs",
  );
  const spotify = byUrl(result.state, "https://open.spotify.com/");
  assert.equal(spotify.workspaceId, personal.id);
  assert.equal(folderOf(result.state, spotify), "Giải trí");
});

test("Workona JSON: more than 20 spaces fall back to folders", () => {
  const Workspaces = Array.from({ length: 25 }, (_, n) => ({
    title: "Không gian " + (n + 1),
    resources: [{ title: "Link", url: `https://s${n}.example/` }],
  }));
  const result = load(JSON.stringify({ Workspaces }), "userData.json");
  assert.equal(result.state.workspaces.length, 1);
  assert.equal(result.state.folders.length, 25);
  assert.equal(result.state.folders[24].name, "Không gian 25");
});

test("Workona HTML: wrapper dropped, spaces become workspaces", () => {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3>Imported from Workona</H3>
  <DL><p>
    <DT><H3>Marketing</H3>
    <DL><p>
      <DT><A HREF="https://ads.google.com/">Google Ads</A>
      <DT><H3>Tabs</H3>
      <DL><p>
        <DT><A HREF="https://business.facebook.com/">Meta Business</A>
      </DL><p>
    </DL><p>
    <DT><H3>Kỹ thuật</H3>
    <DL><p>
      <DT><A HREF="https://github.com/">GitHub</A>
      <DT><A HREF="about:blank">Blank</A>
    </DL><p>
  </DL><p>
</DL><p>`;
  const result = load(html, "workona-bookmarks.html");
  assert.equal(result.format, "workona-html");
  assert.equal(result.skipped, 1);
  assert.deepEqual(
    result.state.workspaces.map((workspace) => workspace.name),
    ["Marketing", "Kỹ thuật"],
  );
  const meta = byUrl(result.state, "https://business.facebook.com/");
  assert.equal(folderOf(result.state, meta), "Tabs");
  assert.equal(meta.workspaceId, result.state.workspaces[0].id);
});

const RAINDROP_CSV = [
  "id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite",
  '101,"Hướng dẫn nấu phở bò","Nhớ mua quế, hồi","Phở là món ăn...",https://monngonmoingay.com/pho-bo/,Nấu ăn,"công thức, việt nam",2024-03-01T08:00:00.000Z,https://img.example/pho.jpg,,true',
  '102,"Multi-line ""quoted"" title",,"Excerpt only",https://example.com/quoted,Unsorted,,2024-03-02T08:00:00.000Z,,,false',
  '103,"Note with',
  'a newline",x,,https://example.com/multiline,Nấu ăn,,,,,',
  "104,Broken row,,,ftp://files.example.com/a.zip,Nấu ăn",
  "105,Too few columns,,,https://example.com/short",
  "106,Dup,,,https://monngonmoingay.com/pho-bo/,Nấu ăn,,,,,",
  ",,,,,,,,,,",
].join("\n");

test("Raindrop CSV: columns by name, quoted fields, Unsorted inbox", () => {
  const result = load(RAINDROP_CSV, "export.csv");
  assert.equal(result.format, "raindrop-csv");
  assert.equal(result.skipped, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.state.pins.length, 4);
  const pho = byUrl(result.state, "https://monngonmoingay.com/pho-bo/");
  assert.equal(pho.title, "Hướng dẫn nấu phở bò");
  assert.equal(pho.note, "Nhớ mua quế, hồi");
  assert.deepEqual(pho.tags, ["công thức", "việt nam"]);
  assert.equal(pho.favorite, true);
  assert.equal(folderOf(result.state, pho), "Nấu ăn");
  const quoted = byUrl(result.state, "https://example.com/quoted");
  assert.equal(quoted.title, 'Multi-line "quoted" title');
  assert.equal(quoted.note, "Excerpt only", "falls back to excerpt");
  assert.equal(folderOf(result.state, quoted), "");
  assert.equal(quoted.favorite, false);
  const multi = byUrl(result.state, "https://example.com/multiline");
  assert.equal(multi.title, "Note with a newline");
  assert.equal(byUrl(result.state, "https://example.com/short").folderId, "");
});

test("Raindrop HTML: TAGS and <DD> notes, nested collections flatten", () => {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Raindrop.io Bookmarks</TITLE>
<H1>Raindrop.io Bookmarks</H1>
<DL><p>
<DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000000">Du lịch</H3>
<DD>Mô tả bộ sưu tập, không phải ghi chú
<DL><p>
<DT><A HREF="https://www.vietnam.travel/" ADD_DATE="1700000000" TAGS="đà nẵng,biển" DATA-COVER="https://img.example/c.jpg">Vietnam Travel &amp; Tourism</A>
<DD>Đi tháng 6 &lt;3
<DT><H3>Hội An</H3>
<DL><p>
<DT><A HREF="https://hoianworldheritage.org.vn/">Phố cổ Hội An</A>
</DL><p>
<DT><A HREF="javascript:void(0)">Bookmarklet</A>
</DL><p>
<DT><A HREF="https://unsorted.example/">Không thư mục</A>
</DL><p>`;
  const result = load(html, "Raindrop.io.html");
  assert.equal(result.format, "raindrop-html");
  assert.equal(result.skipped, 1);
  assert.deepEqual(
    result.state.folders.map((folder) => folder.name),
    ["Du lịch"],
  );
  const travel = byUrl(result.state, "https://www.vietnam.travel/");
  assert.equal(travel.title, "Vietnam Travel & Tourism");
  assert.deepEqual(travel.tags, ["đà nẵng", "biển"]);
  assert.equal(travel.note, "Đi tháng 6 <3");
  const hoian = byUrl(result.state, "https://hoianworldheritage.org.vn/");
  assert.equal(folderOf(result.state, hoian), "Du lịch");
  assert.equal(hoian.note, "");
  assert.equal(
    folderOf(result.state, byUrl(result.state, "https://unsorted.example/")),
    "",
  );
});

test("Chrome/Edge HTML: bar is transparent, nested folders flatten", () => {
  // Shape copied from Chromium's bookmark_html_writer.cc: the bar is an H3
  // with PERSONAL_TOOLBAR_FOLDER, "Other bookmarks" items sit at the root.
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1690000000" LAST_MODIFIED="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Thanh dấu trang</H3>
    <DL><p>
        <DT><A HREF="https://www.google.com/" ADD_DATE="1690000001" ICON="data:image/png;base64,iVBORw0KGgo=">Google</A>
        <DT><H3 ADD_DATE="1690000002" LAST_MODIFIED="1690000003">Ngân hàng</H3>
        <DL><p>
            <DT><A HREF="https://vcbdigibank.vietcombank.com.vn/" ADD_DATE="1690000004">Vietcombank</A>
            <DT><H3 ADD_DATE="1690000005" LAST_MODIFIED="1690000006">Thẻ &quot;tín dụng&quot;</H3>
            <DL><p>
                <DT><A HREF="https://www.techcombank.com/" ADD_DATE="1690000007">Techcombank</A>
            </DL><p>
        </DL><p>
        <DT><A HREF="edge://settings/" ADD_DATE="1690000008">Cài đặt Edge</A>
        <DT><A HREF="https://www.google.com/" ADD_DATE="1690000009">Google (trùng)</A>
        <DT><A HREF="https://broken.example/?a=1&b=2&amp;c=3 ADD_DATE="1">Thiếu dấu nháy
        <DT><A HREF="https://emoji.example/">Mèo 🐱 &#x1F436; &#128512;</A>
    </DL><p>
    <DT><H3 ADD_DATE="1690000010" LAST_MODIFIED="1690000011">Edge Collections</H3>
    <DL><p>
    </DL><p>
    <DT><A HREF="https://other.example/" ADD_DATE="1690000012">Dấu trang khác</A>
</DL><p>`;
  const result = load(html, "favorites_11_4_26.html");
  assert.equal(result.format, "netscape");
  assert.equal(result.skipped, 1);
  assert.equal(result.duplicates, 1);
  assert.deepEqual(
    result.state.folders.map((folder) => folder.name),
    ["Ngân hàng", "Edge Collections"],
  );
  assert.equal(
    folderOf(result.state, byUrl(result.state, "https://www.google.com/")),
    "",
  );
  const techcom = byUrl(result.state, "https://www.techcombank.com/");
  assert.equal(folderOf(result.state, techcom), "Ngân hàng");
  const emoji = byUrl(result.state, "https://emoji.example/");
  assert.equal(emoji.title, "Mèo 🐱 🐶 😀");
  assert.ok(
    result.state.pins.some((pin) =>
      pin.url.startsWith("https://broken.example/"),
    ),
    "an unclosed quote still yields the link",
  );
  assert.equal(
    folderOf(result.state, byUrl(result.state, "https://other.example/")),
    "",
  );
});

test("tokenizer tolerates junk", () => {
  const tokens = I.tokenize("a < b <A HREF=x>t</a><!-- c <A> --><p");
  const tags = tokens.filter((token) => token.type === "tag");
  assert.deepEqual(
    tags.map((token) => token.name),
    ["a", "a"],
  );
  assert.equal(tags[0].attrs.href, "x");
  assert.ok(
    tokens.some((token) => token.type === "text" && /</.test(token.text)),
  );
});

test("limits: long titles, too many pins and folders", () => {
  const lines = [];
  for (let n = 0; n < 5100; n++) {
    lines.push(`https://example.com/${n} | ${"Tiêu đề ".repeat(30)}${n}`);
    if (n % 9 === 8) lines.push("");
  }
  const result = load(lines.join("\n"), "onetab.txt");
  assert.equal(result.state.pins.length, 5000);
  assert.equal(result.truncated, 100);
  assert.equal(result.state.folders.length, 500);
  assert.equal(result.state.folders[499].name, "Imported");
  assert.ok(result.state.pins.every((pin) => pin.title.length <= 180));
});

test("pinned exports pass through; unknown files throw with a code", () => {
  const own = { pins: [{ url: "https://a.example/", title: "A" }] };
  assert.equal(I.parseImport(JSON.stringify(own)).format, "pinned");
  assert.throws(() => I.parseImport(""), { code: "EMPTY" });
  assert.throws(() => I.parseImport("{nope"), { code: "INVALID_JSON" });
  assert.throws(() => I.parseImport('{"foo":1}'), { code: "UNKNOWN_FORMAT" });
  assert.throws(() => I.parseImport("just some words\nand more"), {
    code: "UNKNOWN_FORMAT",
  });
});

test("labels can be translated", () => {
  const result = I.parseImport("https://a.example/ | A", "x.txt", {
    labels: { group: "Nhóm {n}" },
  });
  assert.equal(result.data.pins[0].folder, "Nhóm 1");
});
