# Pinned Sidebar 2.0

Extension Manifest V3 cho Edge/Chrome: ghim website, sắp xếp thư mục và mở nhanh trong sidebar. Giao diện tiếng Việt có Sáng, Tối, Đen, Pastel hoặc theo hệ thống; có chế độ chỉ biểu tượng.

## Cập nhật từ bản 1.2.0

Nếu bản cũ đang được tải từ **chính thư mục dự án này**, vào `edge://extensions` hoặc `chrome://extensions`, tìm Pinned Sidebar và bấm **Tải lại / Reload**. Giữ nguyên thư mục và extension ID để chuyển dữ liệu cũ tự động. Sau đó tải lại các tab website đang mở để thay thanh nổi cũ.

Bản 2.0 đọc `pins` và `settings` từ bộ nhớ sync cũ, chuyển thư mục thành đối tượng riêng và lưu bản gốc trong bộ nhớ local. Mục trùng URL hoặc URL không hợp lệ được bỏ qua có thông báo; bản gốc vẫn được giữ. Mã nguồn 1.2.0 đã được sao lưu trong `.backup/pinned-sidebar-1.2.0.zip`.

**Nếu đổi thư mục cài hoặc cài thành extension khác:** xuất JSON từ extension cũ trước, rồi nhập vào bản mới. Tiện ích mới có ID khác không thể tự đọc dữ liệu của tiện ích cũ. Không gỡ extension cũ trước khi sao lưu dữ liệu.

## Cài mới

1. Mở `edge://extensions` hoặc `chrome://extensions`, bật **Developer mode**.
2. Chọn **Load unpacked**, trỏ tới thư mục chứa `manifest.json`.
3. Bấm biểu tượng extension hoặc `Ctrl+Shift+Y` để mở sidebar.

Bản đóng gói sạch ở `dist/pinned-sidebar/`; chỉ chứa các file chạy extension. File phát hành để chuyển máy là `dist/pinned-sidebar-2.1.7.zip`: giải nén ZIP trước, rồi chọn thư mục đã giải nén trong **Load unpacked**. Dùng Chromium 120+ hoặc phiên bản Edge tương ứng có Side Panel API. Người sử dụng không cần Node.js.

## Sử dụng

- **Ghim tab hiện tại**, thêm bằng URL, hoặc dùng menu chuột phải trên trang/liên kết HTTP/HTTPS.
- Website trùng URL được ngăn ở mọi luồng nhập và ghim. Tên và URL được kiểm tra trước khi lưu.
- Tạo thư mục rỗng, đổi tên, chuyển website và xóa thư mục mà giữ lại website. Kéo cụm chấm trước tên bộ sưu tập để sắp xếp lên/xuống; menu `⋯` cũng có lệnh đưa lên hoặc xuống và hoàn tác.
- Tìm theo tên, URL hoặc thư mục; hỗ trợ gõ tiếng Việt không dấu. Nhấn `/` để tìm nhanh.
- Kéo thả để đổi thứ tự/chuyển thư mục. Dữ liệu chỉ được ghi khi thả. Khi đang lọc, dùng menu để chuyển vị trí.
- Dùng menu `⋯` hoặc `Alt+↑/↓` khi focus vào website để sắp xếp bằng bàn phím.
- Bỏ ghim có nút **Hoàn tác** trong 10 giây.
- Cài đặt cách mở mặc định: **sidebar** hoặc **tab mới**, áp dụng cho cả danh sách và thanh nổi. `Ctrl/Cmd+click` hoặc chuột giữa mở tab nền.
- Thanh icon trên website dùng closed Shadow DOM để cách ly CSS; khi thu gọn chỉ hiện favicon/biểu tượng như Cốc Cốc. Bấm icon để mở website trong sidebar, rê chuột hoặc focus để xem tên. Thanh ở nửa phải bung sang trái, thanh ở nửa trái bung sang phải và luôn chừa khoảng cho thanh cuộn. Khi đóng sidebar lớn, thanh đang sát mép tự bám lại vào góc trang. Rê chuột lên thanh rồi bấm × nhỏ để tắt; bật lại trong Cài đặt. Kéo dấu ⠿ ở đầu thanh để đặt ở bất kỳ vị trí nào, hoặc kéo mép để đổi rộng; vị trí được nhớ. Chọn trái/phải hoặc tắt ngay trong cài đặt. Thanh hiển thị tối đa 100 website, số còn lại truy cập trong sidebar.
- Mỗi website có favicon theo chính URL của ghim, do dịch vụ favicon của Google trả về; khi không có favicon, extension hiển thị chữ cái dự phòng. Không tải script hoặc font bên ngoài.

## Lưu trữ, đồng bộ và phục hồi

`chrome.storage.local` là nguồn dữ liệu chính. Service worker xếp hàng mọi thay đổi để tránh hai cửa sổ cùng đọc rồi ghi đè danh sách. Giao diện nhận trạng thái sau khi lưu thành công; lỗi lưu hiện rõ và không thay bản dữ liệu đã lưu trước đó.

Đồng bộ tự động gửi bản chụp sau khoảng 30 giây ngừng chỉnh sửa, thông qua alarm có thể đánh thức service worker. Dữ liệu được chia thành tối đa 12 phần, mỗi phần tối đa khoảng 7.000 byte JSON, thay vì đặt cả danh sách vào một khóa 8 KB. SHA-256 kiểm tra bản chụp đã nhận đủ trước khi áp dụng. Dung lượng local tối đa theo trình duyệt; extension giới hạn 5.000 website và 500 thư mục. Danh sách lớn có thể vượt dung lượng cloud nhưng vẫn lưu được trên máy.

Extension báo **đã gửi tới bộ nhớ đồng bộ của trình duyệt**, không xác nhận rằng thiết bị khác đã nhận. Việc chuyển qua tài khoản cần bật sync trong Edge/Chrome. Không có máy chủ riêng. Cloud dùng ngữ nghĩa đồng bộ của trình duyệt, không phải cơ sở dữ liệu cộng tác thời gian thực.

Khi nhận một bản cloud khác trong lúc máy có chỉnh sửa chưa gửi, extension giữ dữ liệu trên máy và yêu cầu chọn **Giữ bản trên máy** hoặc **Dùng bản tài khoản**. Bản không được chọn được lưu dự phòng. Cài đặt giao diện hiện tại của thiết bị được giữ khi nhận danh sách từ máy khác. Lỗi quota được báo trong Cài đặt; dùng **Đồng bộ ngay** để thử lại sau khi xử lý hoặc xuất JSON.

Nhập JSON hỗ trợ file 1.x, file 2.0 hoặc mảng các website. Có ba lựa chọn độc lập: **Hủy**, **Gộp thêm**, **Thay thế**. Escape/bấm ra ngoài luôn hủy. Thay thế lưu bản dự phòng trong cùng lần ghi dữ liệu. File lỗi bị từ chối trước khi thay đổi danh sách. Giới hạn file nhập là 5 MB.

**Xuất JSON** sao lưu website và thư mục. **Xuất bản dự phòng gần nhất** lấy bản trước lần thay thế/xử lý xung đột hoặc bản dữ liệu 1.x khi chuyển đổi. Có thể nhập file dự phòng như bình thường.

## Xem website trong sidebar

Khi mở một website trong sidebar, extension tự bật ngoại lệ nhúng cho đúng website đó rồi tải trang. Không cần bấm nút mở khóa.

- **Mở tab mới** để dùng website đầy đủ.
- Quyền nhúng tự bật cho website bạn đã chọn: gỡ `X-Frame-Options` và header `Content-Security-Policy` chỉ trên yêu cầu `sub_frame` có initiator là extension này và URL thuộc **chính origin đã chọn** (gồm giao thức, tên miền và cổng). YouTube, Google và Perplexity cũng gồm alias chuyển hướng chính thức giữa tên miền trần và `www`; extension không mở khóa subdomain khác hoặc iframe do trang web thông thường tạo. Có thể thu hồi trong Cài đặt.

Gỡ CSP là ngoại lệ có chủ đích và chỉ bật theo từng website. Sandbox iframe chặn điều hướng trang trên cùng. Cookie, đăng nhập, CSP qua thẻ meta hoặc cơ chế riêng của website vẫn có thể ngăn hoạt động. Google tải được sau khi bật quyền; ghim Google Dịch mở màn **Dịch nhanh** ngay trong sidebar cho văn bản, còn nút mở tab mới dùng giao diện Google đầy đủ để dịch ảnh/tài liệu. Facebook chủ động từ chối khung nhúng và hiện hướng dẫn mở tab thay vì trang lỗi của Facebook. ChatGPT có thể dừng ở trang kiểm tra Cloudflare và cần mở tab mới. Extension không cam kết mọi website đều nhúng được.

Do giới hạn khác nguồn, sidebar không đọc URL/lịch sử điều hướng bên trong website. Các nút được đặt tên đúng chức năng: **Tải lại trang ghim ban đầu**, **Mở liên kết ghim trong tab mới**. Sự kiện `load` của iframe không được dùng để kết luận website đã hiển thị thành công.

## Quyền sử dụng

| Quyền                                 | Mục đích                                                |
| ------------------------------------- | ------------------------------------------------------- |
| `sidePanel`                           | Hiện website và danh sách trong sidebar                 |
| `storage`                             | Lưu local, chuyển dữ liệu cũ và đồng bộ tùy chọn        |
| `tabs`                                | Đọc URL/tên tab hiện tại, mở tab và cập nhật thanh nổi  |
| `contextMenus`                        | Ghim trang hoặc liên kết từ menu chuột phải             |
| `alarms`                              | Hẹn gửi dữ liệu đồng bộ sau khi chỉnh sửa               |
| `declarativeNetRequestWithHostAccess` | Ngoại lệ nhúng tự bật cho website được mở trong sidebar |
| HTTP/HTTPS host access                | Chèn thanh nổi và thực hiện ngoại lệ nhúng đã chọn      |

Không chạy content script trên `edge://`, `chrome://`, `file://` hoặc trang nội bộ bị trình duyệt bảo vệ. Local/sync chỉ cho trusted extension contexts truy cập; content script nhận dữ liệu thanh nổi qua message, không được gửi lệnh xóa/nhập/chỉnh sửa danh sách hay sửa quy tắc nhúng. Shadow DOM dùng để cách ly giao diện, không được xem là ranh giới bảo mật với website chủ.

## Phát triển và kiểm tra

Không có thư viện runtime, không build framework. Node.js chỉ dùng cho kiểm thử/đóng gói:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

- `core.js`: schema, validation, migration, reducer bất biến và chia dữ liệu cloud.
- `background.js`: một đầu mối ghi dữ liệu, sync, context menu, message và quy tắc nhúng.
- `sidebar.html`, `sidebar.js`, `sidebar.css`, `icons.js`: giao diện, dialog native, keyboard, drag/drop, viewer.
- `content.js`, `content.css`: thanh nổi cách ly CSS.
- `tests/`: unit/integration tests và kiểm thử extension thật bằng Chromium với profile tách biệt.
- `scripts/build.cjs`: sao chép đúng các file runtime sang `dist/pinned-sidebar`.

Bộ kiểm thử browser không đăng nhập tài khoản cá nhân; dùng HTTP server local có fixture chặn iframe. Ảnh QA và báo cáo nằm trong `test-results/`. Sync giữa hai tài khoản/thiết bị Edge thực tế cần kiểm tra thủ công; các bài tự động kiểm tra API, quota, bản chụp chưa đủ và xung đột trong môi trường kiểm thử.

Tài liệu tham chiếu: [Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [Declarative Net Request](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest), [Playwright extension testing](https://playwright.dev/docs/chrome-extensions).
