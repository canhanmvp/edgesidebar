# Đăng lên Chrome Web Store và Microsoft Edge Add-ons

Cùng một gói MV3 dùng cho cả hai store.

```bash
npm install
npm test && npm run test:browser
npm run package      # -> release/pinned-sidebar-<version>.zip (đã validate)
npm run screenshots  # -> store/assets/*.png (tùy chọn)
```

Trước khi gửi: **tăng `version`** trong `manifest.json` và `package.json` (store từ chối version trùng hoặc thấp hơn), và host `store/privacy-policy.md` tại một URL công khai (điền email liên hệ).

## Chrome Web Store
1. Đăng ký tại https://chrome.google.com/webstore/devconsole (phí 5 USD một lần, cần bật xác minh 2 bước).
2. *Add new item* → upload `release/pinned-sidebar-<version>.zip`.
3. **Store listing**: dán mô tả từ `listing.md`, chọn Productivity, upload icon 128, 5 screenshot 1280×800, small promo tile 440×280, marquee 1400×560.
4. **Privacy**: single purpose + justification từ `permissions-justification.md`; khai báo dữ liệu; nhập URL privacy policy.
5. **Distribution**: Public hoặc Unlisted, chọn khu vực → *Submit for review*.

Review sẽ xem kỹ quyền `http(s)://*/*` và việc gỡ header X-Frame-Options/CSP (có thể mất vài ngày đến vài tuần). Hãy nhấn mạnh trong giải trình: opt-in theo từng website, chỉ áp dụng cho khung do chính extension khởi tạo.

## Microsoft Edge Add-ons
1. Đăng ký (miễn phí) tại https://partner.microsoft.com/dashboard/microsoftedge/overview.
2. *Create new extension* → upload cùng file zip.
3. **Availability/Properties**: Category Productivity, privacy policy URL.
4. **Store listings**: mô tả (VI/EN), logo 300×300, screenshots 1280×800, large tile 1400×560 (tùy chọn), search terms.
5. **Notes for certification**: dán bảng quyền từ `permissions-justification.md`, nêu cách test (ghim tab, bật nhúng cho 1 website).
6. Publish.
