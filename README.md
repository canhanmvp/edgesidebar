# Pinned Sidebar — Extension cho Microsoft Edge

Hiển thị thanh **sidebar** với icon của các website bạn đã ghim — tái tạo lại
tính năng sidebar ghim trang mà Edge đã gỡ bỏ.

Dùng **Side Panel API** (Manifest V3), nên hoạt động trên Edge và cả Chrome.

## Tính năng

- 📌 Ghim website yêu thích, hiển thị kèm favicon
- ➕ Thêm / ✎ sửa / 🗑 xóa trang ghim
- ↕️ Kéo thả để sắp xếp lại thứ tự
- 🔄 Đồng bộ qua `chrome.storage.sync` (theo tài khoản đăng nhập trình duyệt)
- 🌗 Tự động sáng/tối theo giao diện hệ thống

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
| `manifest.json` | Khai báo extension, quyền, side panel                |
| `background.js` | Service worker: bật side panel, tạo dữ liệu mẫu      |
| `sidebar.html`  | Giao diện sidebar                                    |
| `sidebar.css`   | Style (hỗ trợ dark mode)                             |
| `sidebar.js`    | Logic: ghim, sửa, xóa, sắp xếp, lưu trữ              |
| `icons/`        | Icon extension                                       |

## Tùy biến

- Đổi màu chủ đạo: sửa biến `--accent` trong `sidebar.css`
- Đổi danh sách mẫu ban đầu: sửa mảng `pins` trong `background.js`
