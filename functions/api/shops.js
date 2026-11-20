// ガチャマップ：お店の一覧（GET）と、お店を追加（POST）
import { json, whoHash, todayJST, cleanText } from "../../lib/api-util.js";
import { ngCheck } from "../../lib/ngwords.js";
import { PREFS, prefFromText, prefFromLatLng } from "../../lib/prefs.js";
// みんなが追加したピンは「ピンさしに協力してくれた人」だけに見せる（2026-11-20 ユーザー指定）。
// 協力した人の見分け方：追加したときに渡す合言葉（t）か、追加したときと同じ回線・端末（whoHash）。
const ensureContrib = (DB) => DB.prepare("CREATE TABLE IF NOT EXISTS contrib (token TEXT PRIMARY KEY, who TEXT, created_at TEXT)").run().catch(() => {});
const newToken = () => crypto.randomUUID().replace(/-/g, "");
async function isContributor(env, request, t) {
  if (t && /^[0-9a-f]{32}$/.test(t)) {
    await ensureContrib(env.DB);
    const r = await env.DB.prepare("SELECT 1 FROM contrib WHERE token = ?1").bind(t).first().catch(() => null);
    if (r) return { ok: true };
  }
  const who = await whoHash(request, "shop");
  const r2 = await env.DB.prepare("SELECT 1 FROM shops WHERE who = ?1 AND src = 'user' LIMIT 1").bind(who).first().catch(() => null);
  if (!r2) return { ok: false };
  // 前にピンをさした人：合言葉を作って渡す（次からは回線が変わっても見える）
  await ensureContrib(env.DB);
  const tok = newToken();
  await env.DB.prepare("INSERT INTO contrib (token, who, created_at) VALUES (?1, ?2, ?3)").bind(tok, who, new Date().toISOString()).run().catch(() => {});
  return { ok: true, token: tok };
}
export async function onRequestGet({ env, request }) {
  if (!env.DB) return json([], 503);
  const url = new URL(request.url);
  const { results } = await env.DB.prepare("SELECT * FROM shops WHERE hidden = 0").all();
  const rows = (results || []).map((r) => [r.id, r.name, r.pref, r.lat, r.lng, r.src === "user" ? 1 : 0, r.kind || "", r.src === "user" ? String(r.created_at || "").slice(0, 10) : ""]);
  const hidden = rows.filter((r) => r[5]).length;
  // 合言葉なしの問い合わせ（ほとんどの人）は、みんなのピン抜きで、共通のキャッシュを使う
  if (!url.searchParams.has("c")) {
    const res = json(rows.filter((r) => !r[5]), 200, 300);
    res.headers.set("X-Gp-Hidden", String(hidden));
    return res;
  }
  const c = await isContributor(env, request, url.searchParams.get("t") || "");
  const res = json(c.ok ? rows : rows.filter((r) => !r[5]), 200, 0);
  res.headers.set("X-Gp-Contrib", c.ok ? (c.token || "1") : "0");
  res.headers.set("X-Gp-Hidden", String(hidden));
  return res;
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
  // 都道府県：地図の位置から（だめなら住所の書き出しから）
  let pref = (await prefFromLatLng(lat, lng)) || prefFromText(address) || "";
  if (!pref && PREFS.includes(String(b.pref || ""))) pref = String(b.pref);
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
  // ピンさしに協力してくれた人の合言葉（これでみんなのピンが見えるようになる）
  let token = /^[0-9a-f]{32}$/.test(String(b.t || "")) ? String(b.t) : newToken();
  await ensureContrib(env.DB);
  await env.DB.prepare("INSERT OR IGNORE INTO contrib (token, who, created_at) VALUES (?1, ?2, ?3)").bind(token, who, now).run().catch(() => {});
  if (memo) await env.DB.prepare("INSERT INTO comments (shop_id, body, created_at, who) VALUES (?1, ?2, ?3, ?4)").bind(id, memo, now, who).run().catch(() => {});
  return json({ ok: true, id, t: token }, 200, 0);
}
