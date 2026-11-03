// ガチャマップ：1つのお店の情報（公式の取扱ガチャと、みんなの報告）
import { json } from "../../../lib/api-util.js";
export async function onRequestGet({ env, params }) {
  if (!env.DB) return json(null, 503);
  const id = String(params.id).toLowerCase();
  const shop = await env.DB.prepare("SELECT id, name, pref, address, lat, lng, src, hidden, created_at FROM shops WHERE id = ?1").bind(id).first();
  if (!shop) return json(null, 404);
  const off = await env.DB.prepare("SELECT item_id, first_seen, in_now FROM seen WHERE lower(shop) = ?1").bind(id).all();
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const rep = await env.DB.prepare("SELECT kind, item_id, item_name, value, created_at FROM reports WHERE shop_id = ?1 AND created_at >= ?2 ORDER BY created_at DESC LIMIT 300").bind(id, since).all();
  return json({ shop, official: (off.results || []).map((r) => ({ id: r.item_id, in: !!r.in_now, since: r.first_seen })), reports: rep.results || [] }, 200, 60);
}
