import { useEffect, useState } from 'react';
import type { Api } from '../api.js';

export function SettingsTab({ api }: { api: Api }) {
  const [cfg, setCfg] = useState<{ baseUrl: string; apiKey: string } | null>(null);

  useEffect(() => {
    void window.minizalo.getConfig().then(setCfg);
  }, []);

  const copy = (v: string) => void navigator.clipboard.writeText(v);

  return (
    <div className="stack">
      <div className="card">
        <h3>Kết nối API (cho AI Agent / n8n / CLI)</h3>
        <p className="muted">Chạy trên cùng máy. Mọi request cần header <code>X-API-Key</code>. Server chỉ bind 127.0.0.1.</p>
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="row">
            <input readOnly value={cfg?.baseUrl ?? ''} />
            <button onClick={() => cfg && copy(cfg.baseUrl)}>Copy URL</button>
          </div>
          <div className="row">
            <input readOnly type="password" value={cfg?.apiKey ?? ''} />
            <button onClick={() => cfg && copy(cfg.apiKey)}>Copy API key</button>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>CLI</h3>
        <p className="muted">
          Dùng <code>minizalo accounts</code>, <code>minizalo send …</code>, <code>minizalo listen</code>. CLI tự đọc kết nối từ
          <code> ~/.minizalo/config.json</code> và xác minh nonce trước khi gửi key.
        </p>
      </div>
      <p className="muted">
        ⚠ Đây là API không chính thức của Zalo — dùng có thể bị khóa tài khoản. Rủi ro do bạn tự chịu.
      </p>
    </div>
  );
}
