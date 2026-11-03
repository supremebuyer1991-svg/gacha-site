// サイトを作るとき（1日数回）に読む：全部のお店と、公式の取扱ガチャ、みんなの報告の数
import { json } from "../../lib/api-util.js";
export async function onRequestGet({ env }) {
  if (!env.DB) return json({}, 503, 0);
  const shops = (await env.DB.prepare("SELECT id, name, pref, address, lat, lng, src, hidden, created_at FROM shops").all()).results || [];
  const off = (await env.DB.prepare("SELECT lower(shop) s, item_id FROM seen WHERE in_now = 1").all()).results || [];
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const rep = (await env.DB.prepare("SELECT shop_id s, count(*) n, max(created_at) last FROM reports WHERE created_at >= ?1 GROUP BY shop_id").bind(since).all()).results || [];
  const official = {};
  for (const r of off) (official[r.s] ||= []).push(r.item_id);
  const reports = {};
  for (const r of rep) reports[r.s] = { n: r.n, last: r.last };
  return json({ generated: new Date().toISOString(), shops, official, reports }, 200, 0);
}
