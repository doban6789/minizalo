import { useEffect, useState } from 'react';
import type { Api } from '../api.js';
import type { Account } from '../App.js';

interface Message {
  id: number;
  threadId: string;
  threadType: string;
  direction: 'in' | 'out';
  sender: string | null;
  content: string;
  ts: number;
}

/**
 * Minimal chat panel. Message content is rendered as PLAIN TEXT via React (no
 * dangerouslySetInnerHTML), so hostile inbound HTML/script cannot execute
 * (Red Team #4).
 */
export function ChatPanel({ api, account, onClose }: { api: Api; account: Account; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [to, setTo] = useState('');
  const [type, setType] = useState('user');
  const [text, setText] = useState('');

  const refresh = async () => {
    const res = await api.getMessages(account.id, to || undefined);
    setMessages(res.messages.slice().reverse());
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, to]);

  const send = async () => {
    if (!to || !text.trim()) return;
    await api.send(account.id, { to, threadType: type, text });
    setText('');
    await refresh();
  };

  return (
    <div className="card">
      <div className="row">
        <h3>Chat — {account.label}</h3>
        <div className="spacer" />
        <button onClick={onClose}>Đóng</button>
      </div>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <input style={{ maxWidth: 260 }} placeholder="Thread ID (uid hoặc groupId)" value={to} onChange={(e) => setTo(e.target.value)} />
        <select style={{ maxWidth: 120 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="user">User</option>
          <option value="group">Group</option>
        </select>
      </div>
      <div style={{ maxHeight: 280, overflow: 'auto', margin: '10px 0' }}>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.direction}`}>
            <div className="muted">{m.sender ?? m.direction} · {new Date(m.ts).toLocaleTimeString()}</div>
            {m.content}
          </div>
        ))}
        {messages.length === 0 && <p className="muted">Chưa có tin nhắn.</p>}
      </div>
      <div className="row">
        <input placeholder="Nhập tin nhắn…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="primary" onClick={send}>Gửi</button>
      </div>
    </div>
  );
}
