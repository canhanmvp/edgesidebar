# Nội dung listing

Dán nguyên văn vào Chrome Web Store và Microsoft Edge Add-ons. Mô tả ngắn đã đếm ký tự (≤132). Chỉ ghi tính năng đã có trong bản đang nộp; gói Pro chưa mở bán nên không nhắc giá trong listing.

**Đường dẫn dùng chung** (điền khi đã host `site/`):

- Website: `https://<tên-miền>/`
- Privacy policy URL: `https://<tên-miền>/privacy.html`
- Support: `canhanmvp@gmail.com` hoặc https://github.com/canhanmvp/edgesidebar/issues

## Tiếng Việt

**Tên:** Pinned Sidebar

**Mô tả ngắn (127/132 ký tự):**
Ghim, tìm, sắp xếp website ngay trong thanh bên; mở web trong sidebar, lưu phiên tab, đồng bộ bookmark. Dữ liệu ở trên máy bạn.

**Mô tả chi tiết:**

Pinned Sidebar biến thanh bên của Edge và Chrome thành không gian làm việc của bạn: các website dùng hằng ngày luôn cách một cú nhấp, mở ngay bên cạnh trang đang đọc.

GHIM VÀ SẮP XẾP
• Ghim tab hiện tại bằng một cú nhấp, từ menu chuột phải hoặc bằng URL; kéo-thả để sắp xếp
• Bộ sưu tập (thư mục), nhãn, ghi chú và yêu thích
• Nhiều không gian làm việc tách biệt: Công việc, Cá nhân, Dự án…
• Tìm kiếm nhanh, không phân biệt dấu tiếng Việt (phím /)

MỞ WEB NGAY TRONG THANH BÊN
• Xem website trong sidebar mà không rời trang đang làm
• Thanh nổi tùy chọn trên mọi trang, kéo đặt ở đâu cũng được, ẩn chỉ với một cú nhấp
• Dịch nhanh văn bản ngay trong thanh bên

TAB VÀ BOOKMARK
• Lưu và mở lại phiên tab, kể cả nhóm tab có tên và màu
• Tab Bookmark: duyệt, tìm, kéo-thả, xóa có hoàn tác
• Liên kết hai chiều một thư mục bookmark với một không gian
• Gõ "p" trên thanh địa chỉ để mở nhanh trang đã ghim, "p +" để ghim tab hiện tại

GỌN GÀNG
• Dọn dẹp: tìm link hỏng, link đã chuyển địa chỉ và trang trùng
• 16 giao diện màu, chế độ chỉ biểu tượng, phím tắt Ctrl+M / Ctrl+Shift+Y
• Xuất/nhập JSON, hoàn tác khi xóa

RIÊNG TƯ
Dữ liệu lưu trong trình duyệt của bạn và chỉ đồng bộ qua tài khoản Edge/Chrome khi bạn bật. Không máy chủ riêng, không theo dõi, không quảng cáo. Quyền bookmark là tùy chọn, chỉ xin khi bạn cần.

**Danh mục:** Productivity (Năng suất)

## English

**Name:** Pinned Sidebar

**Summary (126/132 characters):**
Pin, search and organize your websites in the side panel. Save tab sessions and sync with bookmarks. Local-first, no tracking.

**Description:**

Pinned Sidebar turns the Edge and Chrome side panel into your personal workspace. The sites you use every day stay one click away and open right next to the page you are reading.

PIN AND ORGANIZE
• Pin the current tab in one click, from the right-click menu or by URL; drag and drop to reorder
• Collections (folders), tags, notes and favorites
• Separate workspaces for work, personal and project sites
• Instant search that ignores accents (press /)

OPEN SITES IN THE SIDE PANEL
• View a website in the side panel without leaving the page you are on
• Optional floating rail on any page: drag it anywhere, hide it in one click
• Built-in quick text translator

TABS AND BOOKMARKS
• Save and restore tab sessions, including named, colored tab groups
• Bookmarks tab: browse, search, drag and drop, delete with undo
• Two-way link between a bookmark folder and a workspace
• Type "p" in the address bar to open a pinned site, or "p +" to pin the current tab

STAY TIDY
• Cleanup finds dead links, moved links and duplicates
• 16 color themes, icon-only mode, shortcuts Ctrl+M / Ctrl+Shift+Y
• JSON export / import and undo for deletions

PRIVATE BY DESIGN
Your data stays in your browser and syncs through your Edge/Chrome account only if you turn sync on. No server, no tracking, no ads. The bookmarks permission is optional and only requested when you use it.

**Category:** Productivity

**Search terms (Edge, ≤7 terms, ≤30 characters each):** side panel, sidebar, pinned sites, workspaces, tab sessions, bookmarks manager, tab manager

## Hình ảnh (`store/assets`) — đúng kích thước store

| File | Kích thước | Dùng cho |
| --- | --- | --- |
| `icons/icon128.png` (trong gói zip) | 128×128 (art 96 + padding 16) | Chrome store icon, Edge icon |
| `logo-300x300.png` | 300×300 | Edge "Store logo" |
| `logo-512x512.png`, `logo.svg` | 512×512 / vector | Dự phòng, website, mạng xã hội |
| `screenshot-1…5-1280x800.png` | 1280×800 | Screenshots Chrome (1–5) và Edge (1–10) |
| `promo-small-440x280.png` | 440×280 | Chrome "Small promo tile" (bắt buộc) / Edge small tile |
| `promo-marquee-1400x560.png` | 1400×560 | Chrome "Marquee promo tile" / Edge large tile (tùy chọn) |

Tạo lại toàn bộ: `npm run screenshots` (logo + ảnh store). Chỉ vẽ lại icon: `npm run brand`. Logo gốc nằm ở `scripts/logo.cjs`.
