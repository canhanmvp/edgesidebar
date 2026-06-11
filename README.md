# Pinned Sidebar — Extension cho Microsoft Edge

Hiển thị thanh **sidebar** với icon của các website bạn đã ghim — tái tạo lại
tính năng sidebar ghim trang mà Edge đã gỡ bỏ.

Dùng **Side Panel API** (Manifest V3), nên hoạt động trên Edge và cả Chrome.

## Tính năng

- 📌 Ghim website yêu thích, hiển thị kèm favicon
- 📱 **Mở website ngay trong sidebar** dạng cột hẹp (giao diện mobile), không cần
  rời tab hiện tại — bấm vào pin để xem, có nút quay lại / tải lại / mở tab mới
- ⚡ **Ghim tab hiện tại** bằng 1 nút, hoặc **menu chuột phải** "Ghim trang này"
  trên bất kỳ trang/liên kết nào
- 🔍 **Tìm kiếm / lọc** nhanh theo tên hoặc URL
- 📁 **Thư mục / nhóm** có thể thu gọn để sắp xếp pin
- ↕️ Kéo thả để sắp xếp lại thứ tự (kéo sang nhóm khác để đổi thư mục)
- ⬇⬆ **Nhập / Xuất** danh sách ra file JSON để sao lưu, chuyển máy
- ▦ **Chế độ chỉ icon** (compact) gọn gàng
- 🧭 **Thanh nổi trên trang web**: thanh hẹp ~48px chỉ hiện icon, **rê chuột vào tự
  bung rộng** hiện tên — đúng kiểu "nhỏ xíu khi không xài". Bật/tắt và đổi bên
  trái/phải trong menu ⋯. (Chỉ hiện trên trang web thường, không hiện ở tab
  trống/`edge://`.)
- ⌨️ **Phím tắt** mở/đóng sidebar: `Ctrl+Shift+Y` (đổi được trong
  `edge://extensions/shortcuts`)
- ➕ Thêm / ✎ sửa / 🗑 xóa trang ghim
- 🔄 Đồng bộ qua `chrome.storage.sync` (theo tài khoản đăng nhập trình duyệt)
- 🌗 Tự động sáng/tối theo giao diện hệ thống

### Về việc xem trong sidebar

Nhiều website chặn nhúng vào khung (iframe) bằng header `X-Frame-Options` và
`Content-Security-Policy`. Extension dùng `declarativeNetRequest` (`rules.json`)
để gỡ các header này cho khung con, nhờ vậy hầu hết site hiển thị được. Cột hẹp
của sidebar thường tự kích hoạt bố cục mobile của trang.

Lưu ý: một số ít site (vd cổng đăng nhập có bảo mật chặt) vẫn có thể từ chối hiển
thị trong khung — khi đó dùng nút **↗ Mở trong tab mới**.

## Cài đặt (chế độ nhà phát triển)

1. Mở Edge, vào `edge://extensions`
2. Bật **Developer mode** (Chế độ nhà phát triển) ở góc trái dưới
3. Bấm **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục dự án này
4. Bấm vào icon extension trên thanh công cụ để mở/đóng sidebar
5. (Tùy chọn) Ghim icon extension để luôn truy cập nhanh

## Mở sidebar tự động

Edge/Chrome không cho extension tự bung side panel khi khởi động vì lý do bảo
mật — nó cần một thao tác của người dùng. Extension này đã bật
`openPanelOnActionClick`, nên chỉ cần **bấm 1 lần vào icon** là sidebar mở và
giữ nguyên khi bạn chuyển tab/cửa sổ.

## Cấu trúc

| File            | Vai trò                                              |
| --------------- | ---------------------------------------------------- |
| `manifest.json` | Khai báo extension, quyền, side panel, phím tắt      |
| `background.js` | Service worker: bật side panel, menu chuột phải, mẫu |
| `rules.json`    | Quy tắc gỡ header chặn nhúng để xem trong sidebar    |
| `content.js`    | Thanh nổi hẹp chèn vào trang, hover để bung rộng     |
| `content.css`   | Style cho thanh nổi                                  |
| `sidebar.html`  | Giao diện sidebar                                    |
| `sidebar.css`   | Style (hỗ trợ dark mode, compact)                    |
| `sidebar.js`    | Logic: ghim, sửa, xóa, nhóm, tìm kiếm, nhập/xuất...  |
| `icons/`        | Icon extension                                       |

## Tùy biến

- Đổi màu chủ đạo: sửa biến `--accent` trong `sidebar.css`
- Đổi danh sách mẫu ban đầu: sửa mảng `pins` trong `background.js`
