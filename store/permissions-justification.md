# Giải trình quyền (dán vào ô "Permission justification" / "Notes for certification")

Một mục đích duy nhất (single purpose): *Quản lý website ghim, bộ sưu tập và phiên tab trong thanh bên của trình duyệt.*

| Quyền | Lý do (EN, dán vào form) |
| --- | --- |
| `sidePanel` | Core UI: the extension is a browser side panel that shows the user's pinned sites. |
| `storage` | Stores the user's pins, folders, workspaces, sessions and settings locally, and optionally via browser sync. |
| `contextMenus` | Adds a right-click item to pin the current page / link. |
| `alarms` | Debounces uploads to browser sync storage (30s) so frequent edits do not exceed sync quota. |
| `declarativeNetRequestWithHostAccess` | Lets the user opt in, per website, to show a site inside the side panel by removing `X-Frame-Options`/`Content-Security-Policy` on that exact origin, for sub-frames initiated only by this extension. Rules are created only after the user enables "allow embedding" for that site and can be revoked. |
| `host_permissions: http://*/*, https://*/*` | (1) Required by the DNR rule above, since the user may pin any website. (2) Reading the title/URL of tabs the user chooses to pin or save into a session. (3) Content script that renders the optional floating rail of pinned sites. Page content is never read or transmitted. |
| Content script on `http(s)://*/*` | Shows the optional floating rail inside a Shadow DOM so page CSS cannot affect it; top frame only; no page data read. Users can hide it in settings. |

Remote code: **không dùng** (không eval, không tải script từ xa; gói được script kiểm tra tự động). Dữ liệu gửi ra ngoài: chỉ tên miền (favicon) và văn bản người dùng nhập vào trình dịch — khai báo đúng ở tab *Privacy practices*.

Quyền `tabs` đã được bỏ khỏi manifest vì host permission đã đủ để đọc tiêu đề/URL tab http(s) (giảm cảnh báo cài đặt, tránh bị từ chối vì quyền thừa).

## Tab "Privacy practices" (Chrome Web Store)

- Khuyến nghị khai **Web history** (URL các trang người dùng ghim; lưu cục bộ/đồng bộ trình duyệt, không gửi cho nhà phát triển), mục đích "App functionality".
- Các nhóm khác (PII, sức khỏe, tài chính, xác thực, giao tiếp cá nhân, vị trí, nội dung website): không thu thập.
- Tick 3 cam kết: không bán dữ liệu cho bên thứ ba; không dùng/chuyển dữ liệu ngoài mục đích chính; không dùng để xét tín dụng.
- Privacy policy URL: host file `store/privacy-policy.md` ở URL công khai (GitHub Pages, Notion công khai, website...).
