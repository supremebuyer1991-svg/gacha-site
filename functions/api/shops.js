// ガチャマップ：お店の一覧（GET）と、お店を追加（POST）
import { json, whoHash, todayJST, cleanText } from "../../lib/api-util.js";
import { ngCheck } from "../../lib/ngwords.js";
export async function onRequestGet({ env }) {
  if (!env.DB) return json([], 503);
  const { results } = await env.DB.prepare("SELECT * FROM shops WHERE hidden = 0").all();
  return json((results || []).map((r) => [r.id, r.name, r.pref, r.lat, r.lng, r.src === "user" ? 1 : 0, r.kind || ""]), 200, 300);
}
export async function onRequestPost({ env, request }) {
  if (!env.DB) return json({ ok: false }, 503, 0);
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: "bad" }, 400, 0); }
  const name = cleanText(b.name, 60), address = b.address ? cleanText(b.address, 120) : "";
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!name || name.length < 2) return json({ ok: false, error: "name" }, 400, 0);
  if (address === null) return json({ ok: false, error: "address" }, 400, 0);
  if (!(lat > 20 && lat < 46 && lng > 122 && lng < 154)) return json({ ok: false, error: "place" }, 400, 0);
  const who = await whoHash(request, "shop");
  const day = todayJST();
  const c = await env.DB.prepare("SELECT count(*) n FROM shops WHERE who = ?1 AND created_at >= ?2").bind(who, day).first();
  if (c && c.n >= 3) return json({ ok: false, error: "limit" }, 429, 0);
  // すぐ近く（約50m以内）に同じ名前のお店があれば追加しない
  const near = await env.DB.prepare("SELECT id, name FROM shops WHERE lat BETWEEN ?1 AND ?2 AND lng BETWEEN ?3 AND ?4").bind(lat - 0.0005, lat + 0.0005, lng - 0.0006, lng + 0.0006).all();
  const n0 = name.replace(/\s/g, "");
  const dup = (near.results || []).find((r) => r.name.replace(/\s/g, "") === n0);
  if (dup) return json({ ok: false, error: "dup", id: dup.id }, 409, 0);
  const id = "u-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const pref = cleanText(b.pref, 6) || "";
  const KINDS = ["gacha", "game", "mall", "station", "shop", "other"];
  const kind = KINDS.includes(b.kind) ? b.kind : "other";
  const memo = b.memo ? String(b.memo).normalize("NFKC").trim().slice(0, 140) : "";
  if (memo && ngCheck(memo)) return json({ ok: false, error: "ng" }, 400, 0);
  if (ngCheck(name) || (address && ngCheck(address))) return json({ ok: false, error: "ng" }, 400, 0);
  const now = new Date().toISOString();
  try {
    await env.DB.prepare("INSERT INTO shops (id, name, pref, address, lat, lng, src, created_at, who, kind) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'user', ?7, ?8, ?9)")
      .bind(id, name, pref, address, lat, lng, now, who, kind).run();
  } catch {
    await env.DB.prepare("INSERT INTO shops (id, name, pref, address, lat, lng, src, created_at, who) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'user', ?7, ?8)")
      .bind(id, name, pref, address, lat, lng, now, who).run();
  }
  if (memo) await env.DB.prepare("INSERT INTO comments (shop_id, body, created_at, who) VALUES (?1, ?2, ?3, ?4)").bind(id, memo, now, who).run().catch(() => {});
  return json({ ok: true, id }, 200, 0);
}
