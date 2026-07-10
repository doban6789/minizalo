import { useState } from 'react';
import type { Api } from '../api.js';
import type { Account } from '../App.js';
import { ChatPanel } from './ChatPanel.js';

const MAX = 6;

export function AccountsTab({
  api,
  accounts,
  onChange,
}: {
  api: Api;
  accounts: Account[];
  onChange: () => void;
}) {
  const [label, setLabel] = useState('');
  const [qr, setQr] = useState<{ id: string; image: string | null } | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!label.trim()) return;
    await api.createAccount(label.trim());
    setLabel('');
    onChange();
  };

  const login = async (id: string) => {
    setQr({ id, image: null });
    setBusy(true);
    try {
      const res = await api.loginQr(id);
      setQr({ id, image: res.image });
    } catch (e) {
      setQr(null);
      alert('Login lỗi: ' + (e as Error).message);
    } finally {
      setBusy(false);
      onChange();
    }
  };

  return (
    <div className="stack">
      <div className="row wrap">
        <input
          style={{ maxWidth: 240 }}
          placeholder="Tên tài khoản mới"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button className="primary" onClick={add} disabled={accounts.length >= MAX}>
          + Thêm ({accounts.length}/{MAX})
        </button>
      </div>

      <div className="grid">
        {accounts.map((a) => (
          <div className="card" key={a.id}>
            <div className="row">
              <h3>{a.label}</h3>
              <div className="spacer" />
              <span className={`badge ${a.status}`}>{a.status}</span>
            </div>
            <p className="muted">{a.phone ?? a.ownId ?? '—'}</p>
            {a.note && <p className="muted">ℹ {a.note}</p>}
            <div className="row wrap" style={{ marginTop: 8 }}>
              {a.status === 'online' ? (
                <>
                  <button onClick={() => setSelected(a)}>Chat</button>
                  <button onClick={async () => { await api.logout(a.id); onChange(); }}>Đăng xuất</button>
                </>
              ) : (
                <button className="primary" onClick={() => login(a.id)} disabled={busy}>
                  {a.status === 'dead' ? 'Đăng nhập lại (QR)' : 'Đăng nhập (QR)'}
                </button>
              )}
              <button className="danger" onClick={async () => { await api.removeAccount(a.id); onChange(); }}>Xóa</button>
            </div>
          </div>
        ))}
      </div>

      {selected && <ChatPanel api={api} account={selected} onClose={() => setSelected(null)} />}

      {qr && (
        <div className="modal-backdrop" onClick={() => setQr(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Quét mã QR bằng Zalo</h3>
            {qr.image ? <img src={qr.image} alt="QR" /> : <p className="muted">Đang tạo mã QR…</p>}
            <p className="muted">Mở Zalo → Cài đặt → Quét mã QR</p>
            <button onClick={() => setQr(null)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
