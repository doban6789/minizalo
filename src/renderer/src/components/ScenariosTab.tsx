import { useEffect, useState } from 'react';
import type { Api } from '../api.js';

interface Scenario {
  id: string;
  ten: string;
  danhMuc: string;
  thucTe: string;
  cachLam: string;
  rutKinhNghiem: string;
  trangThai: string;
}

const STATUSES = ['moi', 'dang_xu_ly', 'da_xong', 'bo'];
const empty = { ten: '', danhMuc: '', thucTe: '', cachLam: '', rutKinhNghiem: '', trangThai: 'moi' };

export function ScenariosTab({ api }: { api: Api }) {
  const [items, setItems] = useState<Scenario[]>([]);
  const [form, setForm] = useState<Record<string, string>>(empty);
  const [q, setQ] = useState('');

  const refresh = async () => setItems((await api.getScenarios()).scenarios);
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const search = async () => {
    if (!q.trim()) return refresh();
    setItems((await api.searchScenarios(q)).results);
  };
  const add = async () => {
    if (!form.ten?.trim()) return;
    await api.addScenario(form);
    setForm(empty);
    await refresh();
  };

  const field = (k: string, ph: string) => (
    <input placeholder={ph} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  );

  return (
    <div className="stack">
      <div className="card">
        <h3>Thêm tình huống cải tiến</h3>
        <div className="stack" style={{ marginTop: 8 }}>
          {field('ten', 'Tên tình huống *')}
          <div className="row">{field('danhMuc', 'Danh mục')}
            <select value={form.trangThai} onChange={(e) => setForm({ ...form, trangThai: e.target.value })} style={{ maxWidth: 140 }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {field('thucTe', 'Thực tế')}
          {field('cachLam', 'Cách tôi làm')}
          {field('rutKinhNghiem', 'Tóm tắt & rút kinh nghiệm')}
          <button className="primary" onClick={add}>Lưu</button>
        </div>
      </div>

      <div className="row">
        <input placeholder="Tìm kiếm…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button onClick={search}>Tìm</button>
        <button onClick={refresh}>Tất cả</button>
      </div>

      <table>
        <thead>
          <tr><th>Tên</th><th>Danh mục</th><th>Thực tế</th><th>Cách làm</th><th>Rút kinh nghiệm</th><th>Trạng thái</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td>{s.ten}</td><td>{s.danhMuc}</td><td>{s.thucTe}</td><td>{s.cachLam}</td><td>{s.rutKinhNghiem}</td><td>{s.trangThai}</td>
              <td><button className="danger" onClick={async () => { await api.deleteScenario(s.id); await refresh(); }}>Xóa</button></td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={7} className="muted">Chưa có dữ liệu.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
