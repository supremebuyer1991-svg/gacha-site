// 商品ページが在庫を読むための窓口：/api/stock/商品id → D1 に保存された最新の取扱店
export async function onRequestGet({ params, env }) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" };
  if (!env.DB) return new Response("null", { status: 503, headers });
  const row = await env.DB.prepare("SELECT data FROM stock WHERE item_id = ?1").bind(String(params.id)).first();
  if (!row) return new Response("null", { status: 404, headers });
  return new Response(row.data, { status: 200, headers });
}
