# Chính sách quyền riêng tư — Pinned Sidebar

Cập nhật lần cuối: 2026-10-10

Pinned Sidebar ("Tiện ích") là tiện ích trình duyệt cho Microsoft Edge và Google Chrome, giúp ghim, tìm và sắp xếp website, lưu phiên tab trong thanh bên.

## Dữ liệu Tiện ích xử lý

- **Danh sách website đã ghim, thư mục, không gian làm việc, phiên tab, cài đặt**: lưu trong bộ nhớ của trình duyệt (`chrome.storage.local`). Nếu bạn bật đồng bộ trình duyệt, một bản sao được gửi qua bộ nhớ đồng bộ của Edge/Chrome (`chrome.storage.sync`) và do Microsoft/Google quản lý theo chính sách của họ.
- **URL và tiêu đề tab**: chỉ đọc khi bạn chủ động ghim tab, lưu phiên tab hoặc mở trang tab. Không đọc nội dung trang.
- **Nhà phát triển không có máy chủ riêng, không thu thập, không bán, không chia sẻ dữ liệu của bạn, không dùng phân tích hay quảng cáo.**

## Dịch vụ bên thứ ba mà Tiện ích gọi tới

| Dịch vụ | Khi nào | Dữ liệu gửi đi |
| --- | --- | --- |
| Google Favicon (`www.google.com/s2/favicons`) | Hiển thị biểu tượng website ghim | Tên miền của website ghim |
| Google Translate (`translate.googleapis.com`) | Chỉ khi bạn dùng công cụ dịch trong thanh bên | Văn bản bạn nhập để dịch |

Các dịch vụ này xử lý dữ liệu theo chính sách quyền riêng tư của Google.

## Nội dung trang web

- Tiện ích chèn một thanh nổi nhỏ (content script) vào trang http/https để hiển thị các website bạn đã ghim; nó không đọc, lưu hay gửi nội dung trang.
- Với website bạn **tự bật** "cho phép nhúng", Tiện ích gỡ tiêu đề `X-Frame-Options` và `Content-Security-Policy` của đúng website đó, chỉ cho khung hiển thị bên trong thanh bên của Tiện ích. Bạn có thể thu hồi bất cứ lúc nào.

## Kiểm soát của bạn

Bạn có thể xuất, nhập, xóa dữ liệu trong Tiện ích, hoặc gỡ cài đặt Tiện ích để xóa toàn bộ dữ liệu cục bộ. Dữ liệu đồng bộ xóa được qua cài đặt đồng bộ của trình duyệt.

## Trẻ em

Tiện ích không nhắm tới trẻ em và không thu thập thông tin cá nhân.

## Thay đổi và liên hệ

Thay đổi chính sách sẽ được cập nhật tại trang này kèm ngày mới. Liên hệ: **[EMAIL LIÊN HỆ CỦA BẠN]**.

---

# Privacy Policy — Pinned Sidebar (English)

Last updated: 2026-10-10

Pinned Sidebar is a browser extension for Microsoft Edge and Google Chrome that lets you pin, search and organize websites and save tab sessions in a side panel.

**Data handled.** Pinned sites, folders, workspaces, tab sessions and settings are stored in your browser (`chrome.storage.local`). If browser sync is on, a copy goes through the browser's own sync storage (`chrome.storage.sync`), managed by Microsoft/Google. Tab URLs and titles are read only when you pin a tab or save a session; page content is never read. The developer runs no server and does not collect, sell or share your data, and uses no analytics or ads.

**Third-party requests.** (1) The Google Favicon service receives the domain of pinned sites to display icons. (2) Google Translate receives the text you type, only when you use the built-in translator. Both are governed by Google's privacy policy.

**Web pages.** A small floating rail (content script) is injected into http/https pages to show your pinned sites; it does not read, store or transmit page content. For websites you explicitly allow to be embedded, the extension removes `X-Frame-Options` and `Content-Security-Policy` response headers for that exact site, only for frames shown inside the extension's side panel; you can revoke this at any time.

**Your controls.** Export, import or delete data in the extension, or uninstall it to remove local data. **Children:** not directed to children. **Contact:** [YOUR CONTACT EMAIL].
