// 発売週のお知らせ（Web Push）の登録・更新（POST）と取り消し（DELETE）
// 保存するのは「通知の送り先（endpoint と鍵）・言語・★のガチャの番号」だけ
import { json, whoHash, todayJST } from "../../../lib/api-util.js";
import { validEndpoint, validKeys } from "../../../lib/webpush.js";
const LANGS = new Set(["ja", "en", "zh-cn", "zh-tw", "ko"]);
const MAX_BODY = 16 * 1024, MAX_FAV = 200, NEW_PER_DAY = 10;

async function readBody(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_BODY) return null;
  const text = await request.text();
  if (!text || text.length > MAX_BODY) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function onRequestPost({ env, request }) {
  if (!env.DB) return json({ ok: false }, 503, 0);
  const b = await readBody(request);
  if (!b || typeof b !== "object") return json({ ok: false, error: "bad" }, 400, 0);
  const s = b.subscription || {}, keys = s.keys || {};
  if (!validEndpoint(s.endpoint) || !validKeys(keys.p256dh, keys.auth)) return json({ ok: false, error: "sub" }, 400, 0);
  const lang = LANGS.has(b.lang) ? b.lang : "ja";
  if (!Array.isArray(b.favorites)) return json({ ok: false, error: "fav" }, 400, 0);
  const fav = [...new Set(b.favorites.filter((x) => typeof x === "string" && /^[a-z0-9-]{3,80}$/.test(x)))].slice(0, MAX_FAV);
  const now = new Date().toISOString();
  const old = await env.DB.prepare("SELECT endpoint FROM push_subs WHERE endpoint = ?1").bind(s.endpoint).first();
  if (old) {
    await env.DB.prepare("UPDATE push_subs SET p256dh = ?2, auth = ?3, lang = ?4, favorites = ?5, updated_at = ?6 WHERE endpoint = ?1")
      .bind(s.endpoint, keys.p256dh, keys.auth, lang, JSON.stringify(fav), now).run();
    return json({ ok: true, n: fav.length }, 200, 0);
  }
  // 新しい登録は、1つの端末から1日 NEW_PER_DAY 件まで（いたずら防止）
  const who = await whoHash(request, "push");
  const c = await env.DB.prepare("SELECT count(*) n FROM push_subs WHERE who = ?1 AND created_at >= ?2").bind(who, todayJST()).first();
  if (c && c.n >= NEW_PER_DAY) return json({ ok: false, error: "limit" }, 429, 0);
  await env.DB.prepare("INSERT INTO push_subs (endpoint, p256dh, auth, lang, favorites, created_at, updated_at, last_sent_week, who) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, NULL, ?7) ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, lang = ?4, favorites = ?5, updated_at = ?6")
    .bind(s.endpoint, keys.p256dh, keys.auth, lang, JSON.stringify(fav), now, who).run();
  return json({ ok: true, n: fav.length }, 200, 0);
}

export async function onRequestDelete({ env, request }) {
  if (!env.DB) return json({ ok: false }, 503, 0);
  const b = await readBody(request);
  const endpoint = b && (b.endpoint || (b.subscription && b.subscription.endpoint));
  if (!validEndpoint(endpoint)) return json({ ok: false, error: "bad" }, 400, 0);
  await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?1").bind(endpoint).run();
  return json({ ok: true }, 200, 0);
}
