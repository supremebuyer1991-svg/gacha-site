// ピン直しの記録（毎晩の見回り用）。?days=1 で直近1日分
import { json } from "../../lib/api-util.js";
export async function onRequestGet({ env, request }) {
  if (!env.DB) return json([], 503);
  const days = Math.min(7, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 1));
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const r = (await env.DB.prepare("SELECT m.id, m.shop_id, s.name, s.pref, m.from_lat, m.from_lng, m.lat, m.lng, m.created_at, substr(m.who, 1, 6) who, (s.lat = m.lat AND s.lng = m.lng) is_now FROM pin_moves m LEFT JOIN shops s ON s.id = m.shop_id WHERE m.created_at >= ?1 ORDER BY m.id").bind(since).all().catch(() => ({ results: [] }))).results || [];
  return json(r, 200, 0);
}
