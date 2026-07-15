# Hướng dẫn sử dụng MiniZalo

Hướng dẫn cài đặt và sử dụng cho **cả người dùng lẫn AI Agent**. MiniZalo là công
cụ desktop mã nguồn mở giúp chạy tối đa **6 tài khoản Zalo cá nhân** cùng lúc, kèm
một **cổng API cục bộ** (REST + WebSocket + Webhook + CLI) để AI Agent / n8n gửi–nhận
tin tự động. Dựng trên thư viện không chính thức [`zca-js`](https://github.com/RFS-ADRENO/zca-js).

> ⚠️ **Cảnh báo rủi ro.** Đây là API **không chính thức** của Zalo — dùng để tự động
> hóa tài khoản cá nhân **có thể bị khóa/ban tài khoản**. Chỉ dùng tài khoản bạn chấp
> nhận rủi ro mất. Không bảo hành. Tự chịu trách nhiệm.

Mọi thứ chạy **cục bộ trên máy bạn** — không có server, không cloud, không thu thập
dữ liệu. Cổng API chỉ mở trên `127.0.0.1` và yêu cầu API key.

---

# Phần A — Dành cho người dùng

## 1. Cài đặt

Tải bản cài cho hệ điều hành của bạn tại trang
[**Releases**](https://github.com/vuongnguyenbinh/minizalo/releases):

| Hệ điều hành | File tải | Ghi chú |
|---|---|---|
| Windows | `MiniZalo-Setup-0.1.0.exe` | Chạy để cài (NSIS). |
| macOS (Apple Silicon) | `MiniZalo-0.1.0-arm64.dmg` | Chỉ máy M1/M2/M3… (chưa có bản Intel). |
| Linux | `MiniZalo-0.1.0.AppImage` | `chmod +x` rồi chạy trực tiếp. |
| Linux (Debian/Ubuntu) | `minizalo_0.1.0_amd64.deb` | `sudo dpkg -i minizalo_0.1.0_amd64.deb` |

**macOS — mở app chưa ký (unsigned):** lần đầu macOS sẽ chặn "không kiểm tra được nhà
phát triển". Chuột phải vào app → **Open** → **Open** lần nữa (hoặc *System Settings →
Privacy & Security → Open Anyway*).

> Muốn tự build từ mã nguồn: xem [deployment-guide.md](deployment-guide.md).

## 2. Đăng nhập tài khoản Zalo

1. Mở MiniZalo → tab **Tài khoản**.
2. Nhập tên gợi nhớ vào ô "Tên tài khoản mới" → bấm **+ Thêm** (tối đa 6, hiện `n/6`).
3. Bấm **Đăng nhập (QR)** → hiện mã QR.
4. Trên điện thoại: mở **Zalo → Cài đặt → Quét mã QR** → quét mã.
5. Trạng thái đổi sang **online** ngay, không cần refresh. Lặp lại cho tối đa 6 tài khoản.

Trạng thái tài khoản: `online` (đang chạy), `offline`/`dead` (cần đăng nhập lại QR).

## 3. Nhắn tin

1. Ở thẻ tài khoản `online`, bấm **Chat**.
2. Nhập **Thread ID** (uid người dùng, hoặc groupId nhóm) và chọn loại **User/Group**.
3. Xem lịch sử (hiển thị dạng văn bản thuần, an toàn) và gõ tin → **Gửi**.
4. Tin đến hiện realtime trong khung chat đang mở.

> Gửi ảnh: hỗ trợ qua CLI/API (xem Phần B). Kết bạn / tạo nhóm / video / file / voice
> nằm ở vòng 2 (chưa có ở bản MVP này).

## 4. Bảng "Tình huống cải tiến" (kho tri thức)

Tab **Tình huống** = một bảng để ghi lại kinh nghiệm xử lý, cột: *Tên tình huống /
Danh mục / Thực tế / Cách tôi làm / Tóm tắt & rút kinh nghiệm / Trạng thái*.

- Thêm: điền form → **Lưu**. Trạng thái: `moi`, `dang_xu_ly`, `da_xong`, `bo`.
- Tìm: gõ từ khóa → **Tìm** (cũng là nguồn tri thức cho AI, xem Phần B).
- Xóa: nút **Xóa** trên mỗi dòng.

## 5. Webhook (đẩy sự kiện ra n8n / hệ thống khác)

Tab **Webhook** → nhập URL (vd webhook n8n) + loại sự kiện (`*` = tất cả) → **Thêm**.
Bấm **Test** để gửi thử. MiniZalo chỉ chấp nhận `http/https` và chặn địa chỉ
link-local/metadata (chống SSRF).

## 6. Cài đặt / lấy khóa kết nối

Tab **Cài đặt** hiện **Base URL** và **API key** (nút copy). Đây là thứ AI Agent / n8n
cần để gọi API. Máy tự ghi file `~/.minizalo/config.json` (quyền 0600) chứa
`baseUrl`, `port`, `apiKey`, `nonce`.

## 7. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
|---|---|
| Banner "Listener của một tài khoản đã dừng" | Bạn mở **Zalo Web** cùng tài khoản ở nơi khác (Zalo chỉ cho 1 listener). Đóng Zalo Web, đăng nhập lại QR nếu cần. |
| Tài khoản chuyển `dead` | Session hết hạn hoặc bị Zalo ngắt → bấm **Đăng nhập lại (QR)**. |
| Banner "Core đang tắt" | App đang thoát. Mở lại app. |
| Bị khóa tài khoản | Rủi ro cố hữu của API không chính thức — giảm tần suất gửi, hạn chế spam. |

---

# Phần B — Dành cho AI Agent / tự động hóa

Mục tiêu: để AI Agent (Claude Code, script, n8n…) đọc/ghi **database** của MiniZalo
(tài khoản, lịch sử tin nhắn, kho tình huống) một cách an toàn.

## Nguyên tắc số 1

**KHÔNG mở file SQLite trực tiếp.** App đang chạy giữ khóa WAL; đọc thẳng sẽ bỏ qua
xác thực + kiểm tra dữ liệu và có thể hỏng DB. Database chỉ truy cập **qua API
localhost của app đang chạy**.

```
App MiniZalo chạy            ~/.minizalo/config.json (0600)
 ├─ core + SQLite          → { baseUrl, port, apiKey, nonce }
 └─ REST/WS trên 127.0.0.1        │
                                  ▼
      AI Agent → đọc config → CLI `minizalo` / REST (header X-API-Key)
```

## Điều kiện & cài CLI

1. **Core phải đang chạy**: hoặc mở app desktop, hoặc chạy bản headless không GUI
   (trên server): `npx --package minizalo-core minizalo-core`. Cả hai đều ghi cùng
   file `~/.minizalo/config.json`.
2. **Cài CLI** (cần Node.js). Cài thẳng từ tarball đính kèm Release — **không cần
   tài khoản npm**:
   ```bash
   npm i -g https://github.com/vuongnguyenbinh/minizalo/releases/latest/download/minizalo-cli.tgz
   ```
   Hoặc build từ mã nguồn:
   ```bash
   git clone https://github.com/vuongnguyenbinh/minizalo && cd minizalo && npm ci
   npm run build --workspace minizalo-cli && npm i -g ./cli
   ```
   CLI tự đọc `~/.minizalo/config.json`, xác minh `nonce` rồi mới gửi key. Không cần
   cấu hình tay. Có thể ghi đè bằng `--url` / `--key` hoặc biến `MINIZALO_URL` / `MINIZALO_KEY`.

## Bảng lệnh CLI

Mỗi lệnh in **một dòng JSON** ra stdout (lỗi in `{"error":...}` ra stderr) — dễ cho LLM parse.

| Lệnh | Chức năng |
|---|---|
| `minizalo accounts` | liệt kê tài khoản + trạng thái |
| `minizalo messages --account <id> [--thread <id>] [--limit N] [--before <ms>]` | đọc lịch sử tin nhắn |
| `minizalo send --account <id> --to <threadId> [--type user\|group] [--text ..] [--image path]` | gửi tin (text/ảnh) |
| `minizalo listen [--account <id>]` | stream sự kiện realtime (JSON theo dòng) |
| `minizalo scenario list [--status <s>] [--category <c>]` | liệt kê kho tình huống |
| `minizalo scenario search --q "<từ khóa>"` | tìm kiếm tri thức (kèm `score`) |
| `minizalo scenario add --ten "..." [--danh-muc ..] [--thuc-te ..] [--cach-lam ..] [--rut-kinh-nghiem ..] [--trang-thai ..]` | ghi tình huống mới |
| `minizalo scenario update --id <id> [--trang-thai da_xong] [...]` | sửa; chỉ field truyền vào mới đổi |
| `minizalo scenario delete --id <id>` | xóa tình huống |
| `minizalo webhook list` / `webhook add --url <url> [--events ..]` | quản lý webhook |

## Kho "tình huống" làm bộ nhớ cho agent

```bash
# 1. Trước khi hành động, truy hồi kinh nghiệm cũ (RAG):
minizalo scenario search --q "khách phàn nàn giao hàng chậm"

# 2. Sau khi xử lý xong, ghi lại bài học:
minizalo scenario add --ten "Khách phàn nàn giao chậm" \
  --cach-lam "Xin lỗi + tặng voucher + hẹn lại mốc giao" \
  --rut-kinh-nghiem "Chủ động báo trễ trước khi khách hỏi" --trang-thai moi

# 3. Đánh dấu đã xong (chỉ đổi trạng thái, các field khác giữ nguyên):
minizalo scenario update --id scn_ab12cd34 --trang-thai da_xong
```

## System prompt dán thẳng vào agent

```
Bạn điều khiển một cổng Zalo cá nhân qua CLI `minizalo` (đã cấu hình sẵn, tự đọc
~/.minizalo/config.json). Mọi output là JSON.

Đọc lịch sử:      minizalo messages --account <id> --thread <threadId> --limit 50
Gửi trả lời:      minizalo send --account <id> --to <threadId> --text "<tin>"
Truy hồi kinh nghiệm: minizalo scenario search --q "<từ khóa tình huống>"
Ghi bài học mới:  minizalo scenario add --ten "<tiêu đề>" --cach-lam "<đã làm gì>" --rut-kinh-nghiem "<rút ra>"

Quy tắc:
- Luôn `scenario search` tìm kinh nghiệm trước khi quyết định cách trả lời.
- Sau khi xử lý xong tình huống đáng chú ý, `scenario add` một bài học ngắn.
- KHÔNG mở file database trực tiếp; chỉ dùng các lệnh này.
```

## REST cho n8n / agent không dùng shell

```bash
KEY=$(jq -r .apiKey ~/.minizalo/config.json); URL=$(jq -r .baseUrl ~/.minizalo/config.json)
curl -H "X-API-Key: $KEY" "$URL/scenarios/search?q=giao+hang"
curl -X POST "$URL/accounts/$ACC/messages" -H "X-API-Key: $KEY" \
     -H 'content-type: application/json' -d '{"to":"<threadId>","threadType":"user","text":"Xin chào"}'
```

Chi tiết đầy đủ (mọi endpoint, headless, an toàn): xem
[ai-agent-integration.md](ai-agent-integration.md).

---

# Phần C — Bảo mật & lưu ý

- API chỉ bind `127.0.0.1` + cần header `X-API-Key`. Agent ở máy khác cần SSH tunnel /
  reverse proxy — đừng mở cổng ra ngoài.
- API key nằm ở `~/.minizalo/config.json` (0600). Đọc từ đó, **không** hardcode/commit.
- Gửi ảnh chỉ nhận base64 qua mạng (API từ chối đường dẫn file trên máy).
- **Không commit** file config, database (`*.db`), hay `.env`.

## Tài liệu liên quan

- [Tích hợp AI Agent (chi tiết)](ai-agent-integration.md)
- [Kiến trúc hệ thống](system-architecture.md)
- [Hướng dẫn build & đóng gói](deployment-guide.md)
