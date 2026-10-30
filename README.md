# Pinned Sidebar 4.1

Extension Manifest V3 cho Edge/Chrome: biến sidebar thành không gian làm việc cá nhân để ghim, tìm, sắp xếp website và lưu lại các phiên tab. Giao diện tiếng Việt gọn trong một màn hình (thanh công cụ cố định, chỉ danh sách cuộn), 16 giao diện màu: theo hệ thống, Sáng, Tối, Đen, Pastel, Đại dương, Hoàng hôn, Oải hương, Hồng đào, Cát, Nửa đêm, Rừng, Nord, Mocha, Mận, Dracula; có chế độ chỉ biểu tượng.

## Có gì mới trong 4.1

- **Tab Bookmark:** tab thứ ba cạnh Ghim/Phiên để duyệt bookmark (Favorites trên Edge) theo từng thư mục, tìm không dấu và ghim nhanh vào không gian đang chọn. Khi tìm ở tab Ghim, bookmark khớp hiện thêm trong nhóm **Từ bookmark**. Kéo thả để sắp xếp bookmark, thả vào giữa một thư mục (hoặc vào tên thư mục trên thanh đường dẫn) để chuyển chỗ; `Alt+↑/↓` di chuyển bằng bàn phím. Xóa bookmark hoặc thư mục (phím `Delete` hoặc menu `⋯`) đều có **Hoàn tác**; xóa thư mục đang liên kết sẽ hủy liên kết trước, trang ghim được giữ. Thư mục gốc của trình duyệt và bookmark do tổ chức quản lý không sửa được.
- **Liên kết sống hai chiều:** liên kết một thư mục bookmark với một không gian. Thêm, sửa, bỏ ghim hay sắp xếp trong sidebar sẽ cập nhật thư mục bookmark; sửa bookmark trong trình duyệt cũng cập nhật không gian. Nhãn, ghi chú và yêu thích vẫn được giữ. Có chế độ **Chỉ kéo về** và **Sao chép một lần**; không gian cũng **xuất ra bookmark** được.
- **Omnibox:** gõ `p`, phím cách rồi từ khóa trên thanh địa chỉ để tìm và mở trang ghim của mọi không gian. Gõ `p +` để ghim tab hiện tại.
- **Nhóm tab:** mở thư mục, không gian hoặc thư mục bookmark thành một nhóm tab có tên và màu theo không gian. Lưu cả cửa sổ hoặc chỉ một nhóm thành phiên; mở lại phiên thì nhóm tab cũng được tạo lại.
- **Dọn dẹp:** kiểm tra link hỏng (404/410), link đã chuyển địa chỉ (có nút cập nhật), website không truy cập được và trang gần trùng (bỏ qua `utm_*`, `www`, dấu `/` cuối…). Trang hỏng có dấu ⚠ trong danh sách.
- **Quyền bookmark là tùy chọn:** chỉ xin khi bạn bấm **Cho phép truy cập bookmark**, nên cập nhật từ 4.0 không bị trình duyệt tạm tắt và không hiện cảnh báo quyền mới. Có thể tắt lại trong Cài đặt.

### Liên kết bookmark hoạt động thế nào

- Mở tab **Bookmark**, vào thư mục cần dùng, bấm `⋯` → **Liên kết với không gian…**, chọn không gian (mới hoặc có sẵn) và cách đồng bộ. Hộp thoại cho xem trước số trang sẽ thêm, cập nhật và đẩy sang bookmark.
- Link nằm ngay trong thư mục gốc là **Chưa phân nhóm**; mỗi thư mục con cấp 1 là một bộ sưu tập; thư mục sâu hơn được gộp vào bộ sưu tập cấp 1 chứa nó (bookmark vẫn nằm nguyên chỗ cũ).
- URL trùng trong cây bookmark: mục đầu tiên được dùng, các mục sau được bỏ qua và không bao giờ bị sửa hay xóa. Link không phải http/https (javascript:, chrome://, file:…) cũng bị bỏ qua.
- Extension chỉ xóa bookmark mà nó đã ghép với trang ghim, không bao giờ xóa thư mục còn nội dung. Bỏ ghim vẫn có **Hoàn tác** 10 giây; trước khi liên kết, bản dự phòng danh sách và ảnh chụp cây bookmark được lưu trên máy.
- Liên kết lưu **theo từng máy** vì ID bookmark khác nhau giữa các máy. Không gian và trang ghim vẫn đồng bộ như cũ; muốn liên kết trên máy khác thì liên kết lại ở máy đó. Xóa không gian chỉ hủy liên kết, không xóa bookmark. Nếu thư mục bookmark bị xóa, dải liên kết báo lỗi và trang ghim được giữ nguyên.
- Giới hạn: một thư mục liên kết tối đa 2.000 bookmark và 100 thư mục con cấp 1.

## Có gì mới trong 4.0

- **Điều hướng hai khu vực:** chuyển nhanh giữa Trang ghim và Phiên tab; phiên có thể mở rộng thành danh sách riêng, đổi tên, xóa và hoàn tác.
- **Bộ lọc nhanh:** lọc website yêu thích, tìm kiếm không dấu theo tên, miền, thư mục, nhãn và ghi chú.
- **Không gian độc lập:** một website có thể xuất hiện một lần trong mỗi không gian; vẫn ngăn trùng URL trong cùng không gian.
- **Thanh nổi ổn định:** không biến mất khi service worker khởi động lại hoặc khi đang lưu vị trí kéo thả.

- **Không gian làm việc:** tách website và thư mục theo từng ngữ cảnh như Công việc, Cá nhân hoặc Dự án. Có thể tạo, đổi tên, đổi màu và xóa không gian; thao tác xóa yêu cầu xác nhận.
- **Quản lý website:** thêm nhãn, ghi chú ngắn và đánh dấu yêu thích; tìm kiếm không dấu bao gồm tên, miền, thư mục, nhãn và ghi chú.
- **Phiên làm việc:** lưu tối đa 20 phiên, mỗi phiên tối đa 100 tab HTTP/HTTPS. Phiên chỉ lưu trên thiết bị này để tránh đưa danh sách tab cá nhân lên bộ nhớ đồng bộ; bấm một lần để mở lại hoặc xuất/nhập file phiên riêng.
- **Dữ liệu bền vững:** schema 3 giữ ID ổn định cho website, thư mục và không gian; bản nâng cấp tự chuyển dữ liệu cũ và giữ bản dự phòng trước khi ghi.
- **Trải nghiệm sidebar:** kéo sắp xếp bộ sưu tập theo từng không gian, hoàn tác xóa, favicon theo URL và thanh icon nổi có thể kéo, đổi rộng, bám góc hoặc tắt.

## Cập nhật từ bản 1.2.0

Nếu bản cũ đang được tải từ **chính thư mục dự án này**, vào `edge://extensions` hoặc `chrome://extensions`, tìm Pinned Sidebar và bấm **Tải lại / Reload**. Giữ nguyên thư mục và extension ID để chuyển dữ liệu cũ tự động. Sau đó tải lại các tab website đang mở để thay thanh nổi cũ.

Bản 2.0 đọc `pins` và `settings` từ bộ nhớ sync cũ, chuyển thư mục thành đối tượng riêng và lưu bản gốc trong bộ nhớ local. Mục trùng URL hoặc URL không hợp lệ được bỏ qua có thông báo; bản gốc vẫn được giữ. Mã nguồn 1.2.0 đã được sao lưu trong `.backup/pinned-sidebar-1.2.0.zip`.

**Nếu đổi thư mục cài hoặc cài thành extension khác:** xuất JSON từ extension cũ trước, rồi nhập vào bản mới. Tiện ích mới có ID khác không thể tự đọc dữ liệu của tiện ích cũ. Không gỡ extension cũ trước khi sao lưu dữ liệu.

## Cài mới

1. Mở `edge://extensions` hoặc `chrome://extensions`, bật **Developer mode**.
2. Chọn **Load unpacked**, trỏ tới thư mục chứa `manifest.json`.
3. Bấm biểu tượng extension, `Ctrl+M` hoặc `Ctrl+Shift+Y` để mở sidebar. Nếu Edge giữ phím `Ctrl+M` cho chức năng hệ thống, vào `edge://extensions/shortcuts` để đổi phím.

Bản đóng gói sạch ở `dist/pinned-sidebar/`; chỉ chứa các file chạy extension. File phát hành để chuyển máy là `release/pinned-sidebar-4.1.0.zip`: giải nén ZIP trước, rồi chọn thư mục đã giải nén trong **Load unpacked**. Khi cập nhật, chọn đúng thư mục cài cũ và bấm **Reload** để giữ extension ID và dữ liệu local. Dùng Chromium 120+ hoặc phiên bản Edge tương ứng có Side Panel API. Người sử dụng không cần Node.js.

## Sử dụng

- **Ghim tab hiện tại**, thêm bằng URL, hoặc dùng menu chuột phải trên trang/liên kết HTTP/HTTPS.
- Website trùng URL được ngăn ở mọi luồng nhập và ghim. Tên và URL được kiểm tra trước khi lưu.
- Chọn không gian ở đầu sidebar. Nút `⋯` cạnh bộ chọn cho phép đổi tên, đổi màu hoặc xóa không gian sau khi xác nhận; nút `+` tạo không gian mới.
- Tạo thư mục rỗng, đổi tên, chuyển website và xóa thư mục mà giữ lại website. Kéo cụm chấm trước tên bộ sưu tập để sắp xếp lên/xuống; menu `⋯` cũng có lệnh đưa lên hoặc xuống và hoàn tác.
- Khi thêm hoặc sửa website, có thể nhập nhãn phân tách bằng dấu phẩy, ghi chú tối đa 500 ký tự và đánh dấu yêu thích. Menu website có lệnh bật/tắt yêu thích.
- Tìm theo tên, URL hoặc thư mục; hỗ trợ gõ tiếng Việt không dấu. Nhấn `/` để tìm nhanh.
- Bấm **Lưu các tab** để lưu các tab website đang mở thành phiên của không gian hiện tại. Phiên được giữ local, có thể xóa từng phiên, bấm tên phiên để mở lại, hoặc dùng **Xuất phiên / Nhập phiên** trong Cài đặt.
- Kéo thả để đổi thứ tự/chuyển thư mục. Dữ liệu chỉ được ghi khi thả. Khi đang lọc, dùng menu để chuyển vị trí.
- Dùng menu `⋯` hoặc `Alt+↑/↓` khi focus vào website để sắp xếp bằng bàn phím.
- Bỏ ghim có nút **Hoàn tác** trong 10 giây.
- Cài đặt cách mở mặc định: **sidebar** hoặc **tab mới**, áp dụng cho cả danh sách và thanh nổi. `Ctrl/Cmd+click` hoặc chuột giữa mở tab nền.
- Thanh icon trên website dùng closed Shadow DOM để cách ly CSS; khi thu gọn chỉ hiện favicon/biểu tượng như Cốc Cốc. Bấm icon để mở website trong sidebar, rê chuột hoặc focus để xem tên. Thanh ở nửa phải bung sang trái, thanh ở nửa trái bung sang phải và luôn chừa khoảng cho thanh cuộn. Khi đóng sidebar lớn, thanh đang sát mép tự bám lại vào góc trang. Rê chuột lên thanh rồi bấm × nhỏ để tắt; bật lại trong Cài đặt. Kéo dấu ⠿ ở đầu thanh để đặt ở bất kỳ vị trí nào, hoặc kéo mép để đổi rộng; vị trí được nhớ. Chọn trái/phải hoặc tắt ngay trong cài đặt. Thanh hiển thị tối đa 100 website, số còn lại truy cập trong sidebar.
- Mỗi website có favicon theo chính URL của ghim, do dịch vụ favicon của Google trả về; khi không có favicon, extension hiển thị chữ cái dự phòng. Không tải script hoặc font bên ngoài.

## Lưu trữ, đồng bộ và phục hồi

`chrome.storage.local` là nguồn dữ liệu chính. Service worker xếp hàng mọi thay đổi để tránh hai cửa sổ cùng đọc rồi ghi đè danh sách. Giao diện nhận trạng thái sau khi lưu thành công; lỗi lưu hiện rõ và không thay bản dữ liệu đã lưu trước đó. Danh sách website, không gian, thư mục, nhãn, ghi chú và yêu thích dùng schema 3; ID ổn định giúp giữ liên kết khi gộp dữ liệu. Phiên tab nằm ở khóa local riêng và không gửi lên cloud.

Đồng bộ tự động gửi bản chụp sau khoảng 30 giây ngừng chỉnh sửa, thông qua alarm có thể đánh thức service worker. Dữ liệu được chia thành tối đa 12 phần, mỗi phần tối đa khoảng 7.000 byte JSON, thay vì đặt cả danh sách vào một khóa 8 KB. SHA-256 kiểm tra bản chụp đã nhận đủ trước khi áp dụng. Dung lượng local tối đa theo trình duyệt; extension giới hạn 5.000 website và 500 thư mục. Danh sách lớn có thể vượt dung lượng cloud nhưng vẫn lưu được trên máy.

Extension báo **đã gửi tới bộ nhớ đồng bộ của trình duyệt**, không xác nhận rằng thiết bị khác đã nhận. Việc chuyển qua tài khoản cần bật sync trong Edge/Chrome. Không có máy chủ riêng. Cloud dùng ngữ nghĩa đồng bộ của trình duyệt, không phải cơ sở dữ liệu cộng tác thời gian thực.

Khi nhận một bản cloud khác trong lúc máy có chỉnh sửa chưa gửi, extension giữ dữ liệu trên máy và yêu cầu chọn **Giữ bản trên máy** hoặc **Dùng bản tài khoản**. Bản không được chọn được lưu dự phòng. Cài đặt giao diện hiện tại của thiết bị được giữ khi nhận danh sách từ máy khác. Lỗi quota được báo trong Cài đặt; dùng **Đồng bộ ngay** để thử lại sau khi xử lý hoặc xuất JSON.

Nhập JSON hỗ trợ file 1.x, file 2.0 hoặc mảng các website. Có ba lựa chọn độc lập: **Hủy**, **Gộp thêm**, **Thay thế**. Escape/bấm ra ngoài luôn hủy. Thay thế lưu bản dự phòng trong cùng lần ghi dữ liệu. File lỗi bị từ chối trước khi thay đổi danh sách. Giới hạn file nhập là 5 MB.

**Xuất JSON** sao lưu website, không gian và thư mục. **Xuất phiên** tạo file riêng cho lịch sử tab; file này không đi qua đồng bộ trình duyệt. **Xuất bản dự phòng gần nhất** lấy bản trước lần thay thế/xử lý xung đột hoặc bản dữ liệu 1.x khi chuyển đổi. Phiên tab không nằm trong JSON website để tránh vô tình chia sẻ lịch sử tab; có thể nhập từng loại file bằng đúng nút tương ứng.

## Xem website trong sidebar

Khi mở một website trong sidebar, extension tự bật ngoại lệ nhúng cho đúng website đó rồi tải trang. Không cần bấm nút mở khóa.

- **Mở tab mới** để dùng website đầy đủ.
- Quyền nhúng tự bật cho website bạn đã chọn: gỡ `X-Frame-Options` và header `Content-Security-Policy`, đồng thời gửi `Sec-Fetch-Dest: document` thay cho `iframe` (một số máy chủ như Facebook, Instagram trả trang lỗi khi thấy yêu cầu đến từ khung nhúng), chỉ trên yêu cầu `sub_frame` có initiator là extension này và URL thuộc **chính origin đã chọn** (gồm giao thức, tên miền và cổng). Tên miền trần và bản `www` của cùng website được mở khóa cùng nhau vì website thường chuyển hướng qua lại (Facebook thêm `m.facebook.com`); extension không mở khóa subdomain khác hoặc iframe do trang web thông thường tạo. Có thể thu hồi trong Cài đặt.

Gỡ CSP là ngoại lệ có chủ đích và chỉ bật theo từng website. Sandbox iframe chặn điều hướng trang trên cùng. Cookie, đăng nhập, CSP qua thẻ meta hoặc cơ chế riêng của website vẫn có thể ngăn hoạt động. Google tải được sau khi bật quyền; ghim Google Dịch mở màn **Dịch nhanh** ngay trong sidebar cho văn bản, còn nút mở tab mới dùng giao diện Google đầy đủ để dịch ảnh/tài liệu. Facebook và Instagram hiển thị được trong sidebar từ bản 4.1; một số chức năng (gọi video, tải tệp…) vẫn nên dùng trong tab. ChatGPT có thể dừng ở trang kiểm tra Cloudflare và cần mở tab mới. Extension không cam kết mọi website đều nhúng được.

Do giới hạn khác nguồn, sidebar không đọc URL/lịch sử điều hướng bên trong website. Các nút được đặt tên đúng chức năng: **Tải lại trang ghim ban đầu**, **Mở liên kết ghim trong tab mới**. Sự kiện `load` của iframe không được dùng để kết luận website đã hiển thị thành công.

## Quyền sử dụng

| Quyền                                 | Mục đích                                                |
| ------------------------------------- | ------------------------------------------------------- |
| `sidePanel`                           | Hiện website và danh sách trong sidebar                 |
| `storage`                             | Lưu local, chuyển dữ liệu cũ và đồng bộ tùy chọn        |
| `tabs`                                | Đọc URL/tên tab hiện tại, mở tab và cập nhật thanh nổi  |
| `contextMenus`                        | Ghim trang hoặc liên kết từ menu chuột phải             |
| `alarms`                              | Hẹn gửi dữ liệu đồng bộ sau khi chỉnh sửa               |
| `tabGroups`                           | Lưu và mở lại phiên/thư mục thành nhóm tab              |
| `bookmarks` (tùy chọn)                | Tab Bookmark và liên kết thư mục; chỉ xin khi bạn bấm   |
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

- `core.js`: schema 3, workspace/session metadata, validation, migration, reducer bất biến, chia dữ liệu cloud, tìm kiếm xếp hạng, chuẩn hóa URL và phân loại kết quả kiểm tra link.
- `bookmarks-core.js`: đối chiếu thuần giữa thư mục bookmark và không gian (`planPull`, `planPush`, `applyOps`).
- `background.js`: một đầu mối ghi dữ liệu, sync, liên kết bookmark, omnibox, context menu, message và quy tắc nhúng.
- `sidebar.html`, `sidebar.js`, `sidebar.css`, `icons.js`: giao diện, dialog native, keyboard, drag/drop, viewer, nhóm tab.
- `sidebar-bookmarks.js`, `sidebar-cleanup.js`: tab Bookmark, hộp thoại liên kết và hộp thoại Dọn dẹp.
- `content.js`, `content.css`: thanh nổi cách ly CSS.
- `tests/`: unit/integration tests và kiểm thử extension thật bằng Chromium với profile tách biệt.
- `scripts/build.cjs`: sao chép đúng các file runtime sang `dist/pinned-sidebar`. Cờ `--grant-optional` (chỉ dùng cho kiểm thử browser) chuyển quyền tùy chọn thành quyền bắt buộc vì Chromium headless không bấm được hộp xin quyền.

### CI với runner Docker trên máy

`.github/workflows/test.yml` chạy `npm test` khi push lên `main` và khi có pull request, trên runner tự host có nhãn `edgesidebar`. Runner là container chính thức `ghcr.io/actions/actions-runner` trong `ci/runner/`:

1. Lấy token: repo **Settings → Actions → Runners → New self-hosted runner**, chép giá trị sau `--token` (cần quyền Admin, hết hạn sau 1 giờ, chỉ dùng một lần).
2. Chép `ci/runner/.env.example` thành `ci/runner/.env` và điền `RUNNER_TOKEN`. File `.env` không được commit.
3. `docker compose -f ci/runner/compose.yml up -d`. Đăng ký được giữ trong volume `runner-home`, khởi động lại máy không cần token mới. Gỡ hẳn: `docker compose -f ci/runner/compose.yml down -v` rồi xóa runner trong Settings.

Repo công khai nên workflow bỏ qua pull request từ fork, và container không có Docker socket hay `sudo`. Nên bật thêm **Settings → Actions → General → Fork pull request workflows → Require approval for all outside collaborators**, vì fork có thể sửa chính file workflow.

Bộ kiểm thử browser không đăng nhập tài khoản cá nhân; dùng HTTP server local có fixture chặn iframe. Ảnh QA và báo cáo nằm trong `test-results/`. Sync giữa hai tài khoản/thiết bị Edge thực tế cần kiểm tra thủ công; các bài tự động kiểm tra API, quota, bản chụp chưa đủ và xung đột trong môi trường kiểm thử.

Tài liệu tham chiếu: [Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [Declarative Net Request](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest), [Playwright extension testing](https://playwright.dev/docs/chrome-extensions).
