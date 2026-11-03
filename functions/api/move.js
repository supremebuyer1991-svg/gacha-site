// ピンの位置を直す（みんなが追加したピンだけ。公式のお店は固定）。いたずら防止：1回で動かせるのは1kmまで・1人1日5回・同じお店は1人1日1回
import { json, whoHash, todayJST } from "../../lib/api-util.js";
const km = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
export async function onRequestPost({ env, request }) {
  if (!env.DB) return json({ ok: false }, 503, 0);
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: "bad" }, 400, 0); }
  const shop = String(b.shop || "").toLowerCase(), lat = Number(b.lat), lng = Number(b.lng);
  if (!/^[a-z0-9-]{3,40}$/.test(shop) || !(lat > 20 && lat < 46 && lng > 122 && lng < 154)) return json({ ok: false, error: "bad" }, 400, 0);
  const s = await env.DB.prepare("SELECT id, lat, lng, src FROM shops WHERE id = ?1 AND hidden = 0").bind(shop).first();
  if (!s) return json({ ok: false, error: "shop" }, 404, 0);
  if (s.src !== "user") return json({ ok: false, error: "official" }, 403, 0);
  const d = km(s.lat, s.lng, lat, lng);
  if (d > 1) return json({ ok: false, error: "far" }, 400, 0);
  if (d < 0.005) return json({ ok: true, lat: s.lat, lng: s.lng, same: true }, 200, 0);
  const who = await whoHash(request, "move"), day = todayJST();
  const c = await env.DB.prepare("SELECT count(*) n, sum(shop_id = ?2) m FROM pin_moves WHERE who = ?1 AND created_at >= ?3").bind(who, shop, day).first();
  if (c && c.n >= 5) return json({ ok: false, error: "limit" }, 429, 0);
  if (c && c.m >= 1) return json({ ok: false, error: "again" }, 429, 0);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO pin_moves (shop_id, who, from_lat, from_lng, lat, lng, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(shop, who, s.lat, s.lng, lat, lng, new Date().toISOString()),
    env.DB.prepare("UPDATE shops SET lat = ?2, lng = ?3 WHERE id = ?1").bind(shop, lat, lng),
  ]);
  return json({ ok: true, lat, lng }, 200, 0);
}
