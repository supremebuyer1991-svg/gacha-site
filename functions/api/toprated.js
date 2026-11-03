// ☆評価の高いお店（評価が少ないお店が上に来すぎないよう、平均3.5を3人分足して計算）
import { json } from "../../lib/api-util.js";
export async function onRequestGet({ env }) {
  if (!env.DB) return json([], 503);
  const r = (await env.DB.prepare(
    "SELECT r.shop_id id, avg(r.stars) a, count(*) n, (sum(r.stars) + 10.5) / (count(*) + 3.0) score, s.name, s.pref FROM ratings r JOIN shops s ON s.id = r.shop_id WHERE coalesce(s.hidden, 0) = 0 GROUP BY r.shop_id ORDER BY score DESC, n DESC LIMIT 1000"
  ).all()).results || [];
  return json(r.map((x) => ({ id: x.id, name: x.name, pref: x.pref, avg: Math.round(x.a * 10) / 10, n: x.n })), 200, 300);
}
