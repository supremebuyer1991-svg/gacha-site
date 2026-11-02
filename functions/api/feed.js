// トップページの「入荷速報」：最近、新しく入荷・在庫復活した商品
import { json } from "../../lib/api-util.js";
export async function onRequestGet({ env }) {
  if (!env.DB) return json([], 503);
  const { results } = await env.DB.prepare("SELECT item_id, restocks, in_count, last_change, last_kind FROM item_obs WHERE last_kind IN ('new','restock') AND in_count > 0 ORDER BY last_change DESC LIMIT 24").all();
  return json(results || [], 200, 300);
}
