// 商品ページの「入荷の速さ」：/api/arrivals/商品id
import { json } from "../../../lib/api-util.js";
const H = 3600e3;
export async function onRequestGet({ params, env }) {
  if (!env.DB) return json(null, 503);
  const id = String(params.id);
  const obs = await env.DB.prepare("SELECT first_seen, restocks, in_count FROM item_obs WHERE item_id = ?1").bind(id).first();
  if (!obs) return json(null, 404);
  const { results } = await env.DB.prepare("SELECT pref, name, first_seen, in_now, baseline FROM seen WHERE item_id = ?1").bind(id).all();
  const t0 = Date.parse(obs.first_seen);
  const rows = (results || []).map((r) => ({ name: r.name, pref: r.pref, at: r.first_seen, in: !!r.in_now, lag: r.baseline ? null : (Date.parse(r.first_seen) - t0) / H }));
  const timed = rows.filter((r) => r.lag != null).sort((a, b) => a.lag - b.lag);
  const byPref = {};
  for (const r of rows) (byPref[r.pref] ||= { pref: r.pref, n: 0, lags: [] }).n++;
  for (const r of timed) if (r.lag <= 14 * 24) byPref[r.pref].lags.push(r.lag);
  const prefs = Object.values(byPref).map((p) => {
    const top = p.lags.slice(0, 10);
    return { pref: p.pref, n: p.n, avg_days: top.length ? Math.round((top.reduce((a, b) => a + b, 0) / top.length / 24) * 10) / 10 : null };
  });
  return json({ first_seen: obs.first_seen, restocks: obs.restocks, in_count: obs.in_count, total: rows.length, fastest: timed.slice(0, 15), prefs }, 200, 600);
}
