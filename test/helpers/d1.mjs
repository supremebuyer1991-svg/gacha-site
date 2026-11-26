// テスト用：node:sqlite で D1 のまねをする（prepare / bind / first / all / run / batch）
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

export function makeD1(...sqlFiles) {
  const db = new DatabaseSync(":memory:");
  for (const f of sqlFiles) db.exec(fs.readFileSync(f, "utf8"));
  const stats = { reads: 0, writes: 0 };
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    async first() { stats.reads++; const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; },
    async all() { stats.reads++; return { results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }; },
    async run() { stats.writes++; const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return {
    raw: db, stats,
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec("BEGIN");
      try { const out = []; for (const s of list) { stats.writes++; out.push(db.prepare(s.sql).run(...s.args)); } db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    rows: (sql, ...a) => db.prepare(sql).all(...a).map((r) => ({ ...r })),
  };
}
