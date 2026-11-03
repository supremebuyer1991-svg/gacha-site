// お店へのコメント（POST で書く）／通報（POST {flag: コメントの番号}）
import { json, whoHash, todayJST } from "../../lib/api-util.js";
import { ngCheck } from "../../lib/ngwords.js";
export async function onRequestPost({ env, request }) {
  if (!env.DB) return json({ ok: false }, 503, 0);
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: "bad" }, 400, 0); }
  const who = await whoHash(request, "comment");
  if (b.flag) {
    const id = Number(b.flag);
    if (!Number.isInteger(id)) return json({ ok: false }, 400, 0);
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO comment_flags (comment_id, who) VALUES (?1, ?2)").bind(id, who).run();
    if (ins.meta && ins.meta.changes) await env.DB.prepare("UPDATE comments SET flags = flags + 1, hidden = CASE WHEN flags + 1 >= 3 THEN 1 ELSE hidden END WHERE id = ?1").bind(id).run();
    return json({ ok: true }, 200, 0);
  }
  const shop = String(b.shop || "").toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(shop)) return json({ ok: false, error: "bad" }, 400, 0);
  const body = String(b.body || "").normalize("NFKC").replace(/[\u0000-\u0009\u000b-\u001f<>]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (body.length < 2 || body.length > 140) return json({ ok: false, error: "length" }, 400, 0);
  if (ngCheck(body)) return json({ ok: false, error: "ng" }, 400, 0);
  const s = await env.DB.prepare("SELECT id FROM shops WHERE id = ?1").bind(shop).first();
  if (!s) return json({ ok: false, error: "shop" }, 404, 0);
  const c = await env.DB.prepare("SELECT count(*) n FROM comments WHERE who = ?1 AND created_at >= ?2").bind(who, todayJST()).first();
  if (c && c.n >= 5) return json({ ok: false, error: "limit" }, 429, 0);
  const same = await env.DB.prepare("SELECT id FROM comments WHERE who = ?1 AND body = ?2").bind(who, body).first();
  if (same) return json({ ok: false, error: "dup" }, 409, 0);
  await env.DB.prepare("INSERT INTO comments (shop_id, body, created_at, who) VALUES (?1, ?2, ?3, ?4)").bind(shop, body, new Date().toISOString(), who).run();
  return json({ ok: true }, 200, 0);
}
