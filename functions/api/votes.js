// ハートの数（全商品）
import { json } from "../../lib/api-util.js";
export async function onRequestGet({ env }) {
  if (!env.DB) return json({}, 503);
  const { results } = await env.DB.prepare("SELECT item_id, n FROM votes WHERE n > 0").all();
  const out = {};
  for (const r of results || []) out[r.item_id] = r.n;
  return json(out, 200, 60);
}
