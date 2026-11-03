// ガチャ活のルートに出たお店の☆評価と、新しいコメント（最大15店まとめて）
import { json } from "../../lib/api-util.js";
export async function onRequestGet({ env, request }) {
  if (!env.DB) return json({}, 503);
  const ids = (new URL(request.url).searchParams.get("ids") || "").toLowerCase().split(",").filter((x) => /^[a-z0-9-]{3,40}$/.test(x)).slice(0, 15);
  if (!ids.length) return json({}, 200, 60);
  const ph = ids.map((_, i) => `?${i + 1}`).join(",");
  const rt = (await env.DB.prepare(`SELECT shop_id s, avg(stars) a, count(*) n FROM ratings WHERE shop_id IN (${ph}) GROUP BY shop_id`).bind(...ids).all()).results || [];
  const cm = (await env.DB.prepare(`SELECT shop_id s, body, created_at FROM comments WHERE hidden = 0 AND shop_id IN (${ph}) ORDER BY created_at DESC LIMIT 120`).bind(...ids).all()).results || [];
  const out = {};
  for (const id of ids) out[id] = { avg: null, n: 0, comments: [] };
  for (const r of rt) out[r.s] = { ...out[r.s], avg: Math.round(r.a * 10) / 10, n: r.n };
  for (const c of cm) if (out[c.s].comments.length < 5) out[c.s].comments.push({ body: c.body, at: c.created_at });
  return json(out, 200, 60);
}
