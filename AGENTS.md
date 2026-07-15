# AGENTS.md — MiniZalo cho AI Agent

MiniZalo mở một cổng cục bộ (REST + WebSocket + CLI) để AI agent gửi/nhận tin Zalo và
đọc/ghi kho tri thức. Tài liệu này là điểm vào cho agent; chi tiết đầy đủ ở
[`docs/ai-agent-integration.md`](docs/ai-agent-integration.md).

## Cách kết nối (bắt buộc đọc)

- **Không mở file SQLite trực tiếp.** Chỉ truy cập database qua API localhost của app
  đang chạy — nếu không sẽ bỏ qua xác thực/kiểm tra dữ liệu và có thể hỏng DB.
- App đang chạy ghi `~/.minizalo/config.json` (0600): `{ baseUrl, port, apiKey, nonce }`.
- Gọi qua CLI `minizalo` (tự đọc config) hoặc REST với header `X-API-Key`.
- Core phải chạy: mở app desktop, **hoặc** headless `npx --package minizalo-core minizalo-core`.

## Lệnh CLI hay dùng

```bash
minizalo accounts                                              # trạng thái tài khoản
minizalo messages --account <id> --thread <tid> --limit 50    # đọc lịch sử
minizalo send --account <id> --to <tid> --text "..."          # gửi tin
minizalo scenario search --q "<từ khóa>"                      # truy hồi kinh nghiệm (RAG)
minizalo scenario add --ten "..." --cach-lam "..." --rut-kinh-nghiem "..."   # ghi bài học
minizalo scenario update --id <id> --trang-thai da_xong       # cập nhật trạng thái
```

Mọi lệnh in một dòng JSON. Trạng thái tình huống: `moi`, `dang_xu_ly`, `da_xong`, `bo`.

## Cài CLI (cần Node.js)

```bash
# từ tarball Release (không cần tài khoản npm):
npm i -g https://github.com/vuongnguyenbinh/minizalo/releases/latest/download/minizalo-cli.tgz
# hoặc từ nguồn:
git clone https://github.com/vuongnguyenbinh/minizalo && cd minizalo && npm ci && npm run build --workspace minizalo-cli && npm i -g ./cli
```

## Tài liệu

- Hướng dẫn người dùng + agent: [`docs/huong-dan-su-dung.md`](docs/huong-dan-su-dung.md)
- Tích hợp AI agent (chi tiết): [`docs/ai-agent-integration.md`](docs/ai-agent-integration.md)
- Kiến trúc: [`docs/system-architecture.md`](docs/system-architecture.md)
