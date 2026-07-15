import type { Db } from '../db/database.js';
import type { ScenarioRecord } from '../types.js';

interface ScenarioRow {
  id: string;
  ten: string;
  danh_muc: string;
  thuc_te: string;
  cach_lam: string;
  rut_kinh_nghiem: string;
  trang_thai: string;
  created_ts: number;
  updated_ts: number;
}

const toModel = (r: ScenarioRow): ScenarioRecord => ({
  id: r.id,
  ten: r.ten,
  danhMuc: r.danh_muc,
  thucTe: r.thuc_te,
  cachLam: r.cach_lam,
  rutKinhNghiem: r.rut_kinh_nghiem,
  trangThai: r.trang_thai,
  createdTs: r.created_ts,
  updatedTs: r.updated_ts,
});

export interface ScenarioInput {
  /** Required on create (route enforces); optional on update to allow partial edits. */
  ten?: string;
  danhMuc?: string;
  thucTe?: string;
  cachLam?: string;
  rutKinhNghiem?: string;
  trangThai?: string;
}

export interface ScenarioSearchHit extends ScenarioRecord {
  score: number;
}

export class ScenarioRepository {
  constructor(private db: Db) {}

  list(filter: { danhMuc?: string; trangThai?: string; limit?: number; offset?: number }): ScenarioRecord[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.danhMuc) {
      clauses.push('danh_muc = @danhMuc');
      params.danhMuc = filter.danhMuc;
    }
    if (filter.trangThai) {
      clauses.push('trang_thai = @trangThai');
      params.trangThai = filter.trangThai;
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const offset = Math.max(filter.offset ?? 0, 0);
    const rows = this.db
      .prepare(`SELECT * FROM scenarios ${where} ORDER BY updated_ts DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit, offset }) as ScenarioRow[];
    return rows.map(toModel);
  }

  get(id: string): ScenarioRecord | undefined {
    const row = this.db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id) as ScenarioRow | undefined;
    return row ? toModel(row) : undefined;
  }

  create(id: string, input: ScenarioInput): ScenarioRecord {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO scenarios (id, ten, danh_muc, thuc_te, cach_lam, rut_kinh_nghiem, trang_thai, created_ts, updated_ts)
         VALUES (@id, @ten, @danhMuc, @thucTe, @cachLam, @rutKinhNghiem, @trangThai, @now, @now)`,
      )
      .run({
        id,
        ten: input.ten ?? '',
        danhMuc: input.danhMuc ?? '',
        thucTe: input.thucTe ?? '',
        cachLam: input.cachLam ?? '',
        rutKinhNghiem: input.rutKinhNghiem ?? '',
        trangThai: input.trangThai ?? 'moi',
        now,
      });
    return this.get(id)!;
  }

  update(id: string, input: ScenarioInput): ScenarioRecord | undefined {
    const cur = this.get(id);
    if (!cur) return undefined;
    this.db
      .prepare(
        `UPDATE scenarios SET ten=@ten, danh_muc=@danhMuc, thuc_te=@thucTe, cach_lam=@cachLam,
         rut_kinh_nghiem=@rutKinhNghiem, trang_thai=@trangThai, updated_ts=@now WHERE id=@id`,
      )
      .run({
        id,
        ten: input.ten ?? cur.ten,
        danhMuc: input.danhMuc ?? cur.danhMuc,
        thucTe: input.thucTe ?? cur.thucTe,
        cachLam: input.cachLam ?? cur.cachLam,
        rutKinhNghiem: input.rutKinhNghiem ?? cur.rutKinhNghiem,
        trangThai: input.trangThai ?? cur.trangThai,
        now: Date.now(),
      });
    return this.get(id);
  }

  remove(id: string): boolean {
    return this.db.prepare('DELETE FROM scenarios WHERE id = ?').run(id).changes > 0;
  }

  /**
   * LIKE-only search across columns (Red Team #15 — no FTS5 dual path).
   * `score` = number of columns matched (stable contract for AI few-shot).
   */
  search(q: string, limit = 20): ScenarioSearchHit[] {
    const term = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const cols = ['ten', 'danh_muc', 'thuc_te', 'cach_lam', 'rut_kinh_nghiem'];
    const scoreExpr = cols.map((c) => `(CASE WHEN ${c} LIKE @term ESCAPE '\\' THEN 1 ELSE 0 END)`).join(' + ');
    const whereExpr = cols.map((c) => `${c} LIKE @term ESCAPE '\\'`).join(' OR ');
    const rows = this.db
      .prepare(
        `SELECT *, (${scoreExpr}) AS _score FROM scenarios WHERE ${whereExpr}
         ORDER BY _score DESC, updated_ts DESC LIMIT @limit`,
      )
      .all({ term, limit: Math.min(Math.max(limit, 1), 100) }) as (ScenarioRow & { _score: number })[];
    return rows.map((r) => ({ ...toModel(r), score: r._score }));
  }
}
