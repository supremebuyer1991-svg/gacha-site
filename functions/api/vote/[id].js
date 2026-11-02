// ハートを押す：1人1商品につき1日1回まで（同じ人かどうかは、IPアドレスなどを元に作った読めない符号で判定。IPそのものは保存しない）
import { json } from "../../../lib/api-util.js";
export async function onRequestPost({ params, env, request }) {
  if (!env.DB) return json({ ok: false }, 503, 0);
  const id = String(params.id);
  if (!/^[a-z0-9-]{3,80}$/.test(id)) return json({ ok: false }, 400, 0);
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const raw = `${request.headers.get("CF-Connecting-IP") || ""}|${request.headers.get("User-Agent") || ""}|${day}|gacha-planet`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const who = [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ins = await env.DB.prepare("INSERT OR IGNORE INTO vote_log (item_id, who, day) VALUES (?1, ?2, ?3)").bind(id, who, day).run();
  if (ins.meta && ins.meta.changes) {
    await env.DB.prepare("INSERT INTO votes (item_id, n) VALUES (?1, 1) ON CONFLICT(item_id) DO UPDATE SET n = n + 1").bind(id).run();
  }
  const row = await env.DB.prepare("SELECT n FROM votes WHERE item_id = ?1").bind(id).first();
  return json({ ok: true, counted: !!(ins.meta && ins.meta.changes), n: row ? row.n : 0 }, 200, 0);
}
