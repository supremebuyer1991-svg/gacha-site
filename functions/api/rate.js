// お店の☆評価（1〜5）。1人1店1つで、つけ直すと上書き
import { json, whoHash, todayJST } from "../../lib/api-util.js";
export async function onRequestPost({ env, request }) {
  if (!env.DB) return json({ ok: false }, 503, 0);
  let b; try { b = await request.json(); } catch { return json({ ok: false }, 400, 0); }
  const shop = String(b.shop || "").toLowerCase(), stars = Number(b.stars);
  if (!/^[a-z0-9-]{3,40}$/.test(shop) || !(stars >= 1 && stars <= 5 && Number.isInteger(stars))) return json({ ok: false, error: "bad" }, 400, 0);
  const s = await env.DB.prepare("SELECT id FROM shops WHERE id = ?1").bind(shop).first();
  if (!s) return json({ ok: false, error: "shop" }, 404, 0);
  const who = await whoHash(request, "rate");
  const c = await env.DB.prepare("SELECT count(*) n FROM ratings WHERE who = ?1 AND updated_at >= ?2").bind(who, todayJST()).first();
  if (c && c.n >= 30) return json({ ok: false, error: "limit" }, 429, 0);
  await env.DB.prepare("INSERT INTO ratings (shop_id, who, stars, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(shop_id, who) DO UPDATE SET stars = ?3, updated_at = ?4").bind(shop, who, stars, new Date().toISOString()).run();
  const r = await env.DB.prepare("SELECT avg(stars) a, count(*) n FROM ratings WHERE shop_id = ?1").bind(shop).first();
  return json({ ok: true, avg: r ? Math.round(r.a * 10) / 10 : stars, n: r ? r.n : 1 }, 200, 0);
}
