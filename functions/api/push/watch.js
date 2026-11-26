// お店のお知らせ（お店×商品／お店×キーワード）の一覧・追加・削除。POST だけ。
// だれの設定かは「通知の送り先（endpoint）」で見分ける（お知らせを受け取っている人だけが使える）。名前などは受け取らない
//   { endpoint, op: "list" }
//   { endpoint, op: "add", kind: "item", shop, item_id, item_name }   このお店にこの商品が入荷・在庫復活したら
//   { endpoint, op: "add", kind: "kw", shop, kw }                     このお店に、名前に kw を含む商品が初めて入荷したら
//   { endpoint, op: "del", id }
import { json, cleanText } from "../../../lib/api-util.js";
import { validEndpoint } from "../../../lib/webpush.js";
import { normKw, WATCH_MAX } from "../../../lib/pushwatch.js";
const MAX_BODY = 4 * 1024;

async function list(DB, endpoint) {
  const { results } = await DB.prepare("SELECT id, kind, shop, item_id, kw, shop_name, item_name FROM push_watch WHERE endpoint = ?1 ORDER BY id DESC LIMIT 60").bind(endpoint).all();
  return results || [];
}

export async function onRequestPost({ env, request }) {
  if (!env.DB) return json({ ok: false }, 503, 0);
  let b = null;
  try { const text = await request.text(); if (text && text.length <= MAX_BODY) b = JSON.parse(text); } catch {}
  if (!b || typeof b !== "object" || !validEndpoint(b.endpoint)) return json({ ok: false, error: "bad" }, 400, 0);
  const DB = env.DB, endpoint = b.endpoint;
  const sub = await DB.prepare("SELECT endpoint FROM push_subs WHERE endpoint = ?1").bind(endpoint).first();
  if (!sub) return json({ ok: false, error: "nosub" }, 404, 0);

  if (b.op === "list") return json({ ok: true, watches: await list(DB, endpoint) }, 200, 0);

  if (b.op === "del") {
    const id = Number(b.id);
    if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: "bad" }, 400, 0);
    await DB.prepare("DELETE FROM push_watch WHERE id = ?1 AND endpoint = ?2").bind(id, endpoint).run();
    return json({ ok: true, watches: await list(DB, endpoint) }, 200, 0);
  }

  if (b.op === "add") {
    const shop = String(b.shop || "").toLowerCase();
    if (!/^s\d{1,12}$/.test(shop)) return json({ ok: false, error: "shop" }, 400, 0);
    let itemId = "", kw = "", itemName = "";
    if (b.kind === "item") {
      itemId = String(b.item_id || "");
      if (!/^[a-z0-9-]{3,80}$/.test(itemId)) return json({ ok: false, error: "item" }, 400, 0);
      itemName = cleanText(b.item_name, 80) || "";
    } else if (b.kind === "kw") {
      kw = cleanText(b.kw, 20) || "";
      if (normKw(kw).length < 2) return json({ ok: false, error: "kw" }, 400, 0);
    } else return json({ ok: false, error: "kind" }, 400, 0);
    // 在庫のデータ（バンダイ公式の取扱店）があるお店だけ
    const sh = await DB.prepare("SELECT name FROM shops WHERE id = ?1").bind(shop).first();
    const seen = sh && await DB.prepare("SELECT 1 x FROM seen WHERE lower(shop) = ?1 LIMIT 1").bind(shop).first();
    if (!sh || !seen) return json({ ok: false, error: "nostock" }, 400, 0);
    const c = await DB.prepare("SELECT count(*) n FROM push_watch WHERE endpoint = ?1").bind(endpoint).first();
    if (c && c.n >= WATCH_MAX) return json({ ok: false, error: "max" }, 400, 0);
    const now = new Date().toISOString();
    await DB.prepare("INSERT OR IGNORE INTO push_watch (endpoint, kind, shop, item_id, kw, shop_name, item_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
      .bind(endpoint, b.kind, shop, itemId, kw, String(sh.name || "").slice(0, 80), itemName, now).run();
    return json({ ok: true, watches: await list(DB, endpoint) }, 200, 0);
  }
  return json({ ok: false, error: "op" }, 400, 0);
}
