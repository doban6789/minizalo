import { useEffect, useState } from 'react';
import type { Api } from '../api.js';

interface Webhook {
  id: string;
  url: string;
  events: string;
  enabled: boolean;
}

export function WebhooksTab({ api }: { api: Api }) {
  const [items, setItems] = useState<Webhook[]>([]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('*');
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => setItems((await api.getWebhooks()).webhooks);
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    setErr(null);
    try {
      await api.addWebhook(url.trim(), events.trim() || '*');
      setUrl('');
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="stack">
      <div className="card">
        <h3>Thêm webhook (đẩy sự kiện ra n8n / AI agent)</h3>
        <div className="row wrap" style={{ marginTop: 8 }}>
          <input placeholder="https://n8n.example/webhook/..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <input style={{ maxWidth: 200 }} placeholder="events (vd: message hoặc *)" value={events} onChange={(e) => setEvents(e.target.value)} />
          <button className="primary" onClick={add}>Thêm</button>
        </div>
        {err && <p className="muted" style={{ color: 'var(--danger)' }}>{err}</p>}
        <p className="muted">Chỉ chấp nhận http/https; địa chỉ link-local/metadata bị chặn (chống SSRF).</p>
      </div>

      <table>
        <thead><tr><th>URL</th><th>Events</th><th>Bật</th><th></th></tr></thead>
        <tbody>
          {items.map((w) => (
            <tr key={w.id}>
              <td>{w.url}</td><td>{w.events}</td><td>{w.enabled ? '✓' : '—'}</td>
              <td className="row">
                <button onClick={async () => { const r = await api.testWebhook(w.id); alert('Test: ' + JSON.stringify(r)); }}>Test</button>
                <button className="danger" onClick={async () => { await api.deleteWebhook(w.id); await refresh(); }}>Xóa</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={4} className="muted">Chưa có webhook.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
