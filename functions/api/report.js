// ガチャマップ：みんなの報告（在庫あり／なし・台数・閉店・ここに無い）
import { json, whoHash, todayJST, cleanText } from "../../lib/api-util.js";
const KINDS = new Set(["in", "out", "machines", "closed", "wrong"]);
const MACHINES = new Set(["~10", "~50", "~100", "100+"]);
export async function onRequestPost({ env, request }) {
  if (!env.DB) return json({ ok: false }, 503, 0);
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: "bad" }, 400, 0); }
  const shop = String(b.shop || "").toLowerCase(), kind = String(b.kind || "");
  if (!/^[a-z0-9-]{3,40}$/.test(shop) || !KINDS.has(kind)) return json({ ok: false, error: "bad" }, 400, 0);
  const s = await env.DB.prepare("SELECT id, src FROM shops WHERE id = ?1").bind(shop).first();
  if (!s) return json({ ok: false, error: "shop" }, 404, 0);
  let itemId = null, itemName = null, value = null;
  if (kind === "in" || kind === "out") {
    itemId = b.item_id && /^[a-z0-9-]{3,80}$/.test(b.item_id) ? b.item_id : null;
    itemName = itemId ? null : cleanText(b.item_name, 60);
    if (!itemId && !itemName) return json({ ok: false, error: "item" }, 400, 0);
  }
  if (kind === "machines") { value = String(b.value || ""); if (!MACHINES.has(value)) return json({ ok: false, error: "value" }, 400, 0); }
  const who = await whoHash(request, "report");
  const c = await env.DB.prepare("SELECT count(*) n FROM reports WHERE who = ?1 AND created_at >= ?2").bind(who, todayJST()).first();
  if (c && c.n >= 40) return json({ ok: false, error: "limit" }, 429, 0);
  // 同じ人が同じお店・同じガチャ・同じ種類を2時間以内に重ねて報告したら数えない
  const recent = new Date(Date.now() - 2 * 3600e3).toISOString();
  const d = await env.DB.prepare("SELECT id FROM reports WHERE who = ?1 AND shop_id = ?2 AND kind = ?3 AND IFNULL(item_id, IFNULL(item_name, '')) = ?4 AND created_at >= ?5").bind(who, shop, kind, itemId || itemName || "", recent).first();
  if (d) return json({ ok: true, dup: true }, 200, 0);
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO reports (shop_id, kind, item_id, item_name, value, created_at, who) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(shop, kind, itemId, itemName, value, now, who).run();
  // みんなが足したお店は、「閉店」「ここに無い」が3人から来たら隠す
  if ((kind === "closed" || kind === "wrong") && s.src === "user") {
    const k = await env.DB.prepare("SELECT count(DISTINCT who) n FROM reports WHERE shop_id = ?1 AND kind IN ('closed','wrong')").bind(shop).first();
    if (k && k.n >= 3) await env.DB.prepare("UPDATE shops SET hidden = 1 WHERE id = ?1").bind(shop).run();
  }
  return json({ ok: true }, 200, 0);
}
