// サイトを作るとき（1日数回）に読む：全部のお店と、公式の取扱ガチャ、みんなの報告の数
// どれかの読み込みに失敗しても、読めた分だけ返す（全部が 500 になって、お店のページが空になるのを防ぐ）
import { json } from "../../lib/api-util.js";
const q = async (env, sql, ...bind) => { try { const st = env.DB.prepare(sql); return ((await (bind.length ? st.bind(...bind) : st).all()).results) || []; } catch (e) { return null; } };
export async function onRequestGet({ env, request }) {
  if (!env.DB) return json({}, 503, 0);
  // 重い（全部の取扱を読む）ので、結果を3時間キャッシュする。D1 の無料枠（1日の読み込み行数）を使い切らないため
  const cache = caches.default, key = new Request(new URL("/api/shopdump?v=2", request.url).toString());
  const hit = await cache.match(key);
  if (hit && !new URL(request.url).searchParams.has("fresh")) return hit;
  const errors = [];
  const shopsRaw = await q(env, "SELECT * FROM shops");
  if (!shopsRaw) errors.push("shops");
  const shops = (shopsRaw || []).map((r) => { delete r.who; delete r.flags; return r; });
  const off = await q(env, "SELECT shop, item_id FROM seen WHERE in_now = 1");
  if (!off) errors.push("seen");
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const rep = await q(env, "SELECT shop_id s, count(*) n, max(created_at) last FROM reports WHERE created_at >= ?1 GROUP BY shop_id", since);
  if (!rep) errors.push("reports");
  const rts = (await q(env, "SELECT shop_id s, avg(stars) a, count(*) n FROM ratings GROUP BY shop_id")) || [];
  const ratings = {};
  for (const r of rts) ratings[r.s] = { avg: Math.round(r.a * 10) / 10, n: r.n };
  const official = {};
  for (const r of off || []) (official[String(r.shop).toLowerCase()] ||= []).push(r.item_id);
  const reports = {};
  for (const r of rep || []) reports[r.s] = { n: r.n, last: r.last };
  // 商品ごとの入荷の記録（商品ページに「初めて店頭で確認した日・補充の回数・今の在庫店数」を文字で出すため）
  const obs = (await q(env, "SELECT item_id, first_seen, restocks, in_count FROM item_obs")) || [];
  const arrivals = {};
  for (const r of obs) arrivals[r.item_id] = { f: r.first_seen, r: r.restocks || 0, n: r.in_count || 0 };
  const res = json({ generated: new Date().toISOString(), shops, official, reports, ratings, arrivals, errors }, 200, 0);
  if (!errors.length) { const c = new Response(res.clone().body, res); c.headers.set("Cache-Control", "public, max-age=10800"); await cache.put(key, c); }
  return res;
}
