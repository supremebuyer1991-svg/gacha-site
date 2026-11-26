/*
 * お知らせ（Web Push）のうち、★のガチャの入荷・在庫復活／抽選開始／お店×商品／お店×キーワード の部分。
 * 在庫確認ワーカー（worker/index.js）と、サイトの窓口（functions/api/push/）と、テスト（node:sqlite）の3か所から使う。
 *
 * 流れ：
 *   1. 在庫の確認で「入荷（new）」「在庫復活（restock）」を見つけたら、だれかが待っているものだけ push_events に書く（eventStatements）
 *   2. 抽選の開始は data/push-lottery.json を30分おきに見て push_events に書く（detectLottery）
 *   3. push_events を読んで、受け取る人ごとに1通にまとめて push_queue に入れる（fanOut）。同じお店のことは1回に1通だけ
 *   4. push_queue から少しずつ送る（sendQueue）。1人1日 DAILY_MAX 通まで。夜（22時〜7時）は送らない
 * 保存するのは、通知の送り先・★のガチャの番号・選んだ都道府県・お店と商品（またはキーワード）の組だけ
 */
import { PREFS } from "./prefs.js";

export const DAILY_MAX = 3; // 1人に1日に送る数（月曜の「今週発売」は別）
export const COOL_MS = 20 * 3600e3; // 同じ商品（同じお店×商品）のお知らせは、この時間は繰り返さない
export const EVENT_TTL_MS = 12 * 3600e3; // これより古い出来事は捨てる
export const QUEUE_TTL_MS = 12 * 3600e3; // これより古い「送る予定」は捨てる（朝まで待った分は送る）
export const EVENT_BATCH = 400; // 1回にまとめる出来事の数
export const EVENTS_PER_ITEM = 150; // 1商品の1回の確認で書く出来事の上限
export const QUEUE_READ = 80;
export const WATCH_MAX = 30; // 1人が登録できる「お店のお知らせ」の数
export const QUIET_FROM = 22, QUIET_TO = 7; // 日本時間。この間は送らない

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const marks = (n, from = 1) => Array.from({ length: n }, (_, i) => `?${i + from}`).join(", ");
const runBatches = async (DB, st) => { for (const c of chunk(st, 50)) await DB.batch(c); };
const jst = (d) => new Date(d.getTime() + 9 * 3600e3);
export const dayJST = (d = new Date()) => jst(d).toISOString().slice(0, 10);
export const isQuiet = (d = new Date()) => { const h = jst(d).getUTCHours(); return h >= QUIET_FROM || h < QUIET_TO; };

// 名前を比べるための形（app.js の NORM と同じ：ひらがな→カタカナ、全角半角・大文字小文字・記号の違いをなくす）
export const normKw = (v) => String(v || "").normalize("NFKC").toLowerCase()
  .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
  .replace(/[\s・･!！?？'’"“”:：\-‐–—~〜～、。,.\/／|｜【】\[\]「」『』()（）♪☆★™]/g, "");

export const cleanPrefs = (a) => [...new Set((Array.isArray(a) ? a : []).filter((p) => PREFS.includes(p)))].slice(0, 5);
const flag = (v) => (v === true || v === 1 ? 1 : 0); // どのお知らせも、本人がオンにしたものだけ（何も言われなければオフ）

/* ---------- 登録まわり（サイトの窓口から） ---------- */
// ★のガチャを push_fav に写す（変わったところだけ書く）
export async function syncFavs(DB, endpoint, fav) {
  const { results } = await DB.prepare("SELECT item_id FROM push_fav WHERE endpoint = ?1").bind(endpoint).all();
  const old = new Set((results || []).map((r) => r.item_id)), next = new Set(fav);
  const st = [];
  for (const id of next) if (!old.has(id)) st.push(DB.prepare("INSERT OR IGNORE INTO push_fav (item_id, endpoint) VALUES (?1, ?2)").bind(id, endpoint));
  for (const id of old) if (!next.has(id)) st.push(DB.prepare("DELETE FROM push_fav WHERE item_id = ?1 AND endpoint = ?2").bind(id, endpoint));
  await runBatches(DB, st);
  return st.length;
}
// 都道府県と、どのお知らせを受け取るか（送った数の記録はそのまま残す）
export async function saveOpt(DB, endpoint, { prefs, opts } = {}, nowIso = new Date().toISOString()) {
  const o = opts && typeof opts === "object" ? opts : {};
  // rel（★のガチャの発売週）は、これまでの登録がそれだったので、はっきり「いらない」と言われたときだけオフ
  const rel = o.rel === false || o.rel === 0 ? 0 : 1;
  await DB.prepare("INSERT INTO push_opt (endpoint, prefs, rel, stock, lottery, weekly, updated_at) VALUES (?1, ?2, ?7, ?3, ?4, ?5, ?6) ON CONFLICT(endpoint) DO UPDATE SET prefs = ?2, rel = ?7, stock = ?3, lottery = ?4, weekly = ?5, updated_at = ?6")
    .bind(endpoint, JSON.stringify(cleanPrefs(prefs)), flag(o.stock), flag(o.lottery), flag(o.weekly), nowIso, rel).run();
}
// 登録を消すときは、関係するものを全部消す
export const dropSubStatements = (DB, endpoint) => ["push_subs", "push_opt", "push_fav", "push_watch", "push_sent", "push_queue"]
  .map((t) => DB.prepare(`DELETE FROM ${t} WHERE endpoint = ?1`).bind(endpoint));

/* ---------- 1. 在庫の動き → push_events ---------- */
// changes: [{ kind: "new" | "restock", shop（小文字の店番号）, name（店名）, pref }]。だれも待っていない動きは書かない
export async function eventStatements(DB, itemId, changes, nowIso) {
  const list = (changes || []).filter((c) => c && c.shop);
  if (!list.length) return [];
  const prefs = new Set(), shopItem = new Set(), shopKw = new Set();
  const a = await DB.prepare("SELECT DISTINCT o.prefs p FROM push_fav f JOIN push_opt o ON o.endpoint = f.endpoint WHERE f.item_id = ?1 AND o.stock = 1").bind(itemId).all();
  for (const r of a.results || []) { try { for (const p of JSON.parse(r.p || "[]")) prefs.add(p); } catch {} }
  const b = await DB.prepare("SELECT DISTINCT shop, kind FROM push_watch WHERE (kind = 'item' AND item_id = ?1) OR kind = 'kw'").bind(itemId).all();
  for (const r of b.results || []) (r.kind === "kw" ? shopKw : shopItem).add(r.shop);
  if (!prefs.size && !shopItem.size && !shopKw.size) return [];
  return list
    .filter((c) => shopItem.has(c.shop) || (c.kind === "new" && shopKw.has(c.shop)) || prefs.has(c.pref))
    .slice(0, EVENTS_PER_ITEM)
    .map((c) => DB.prepare("INSERT INTO push_events (kind, item_id, shop, shop_name, pref, info, created_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)")
      .bind(c.kind === "new" ? "new" : "restock", itemId, c.shop, c.name || "", c.pref || "", nowIso));
}

/* ---------- 2. 抽選の開始 → push_events ---------- */
// data/push-lottery.json：{ entries: [{ k, ids: [商品id], title, store, pref, start, end }] }（時刻は日本時間 "2026-11-21T18:45"）
export async function detectLottery(env, { now = new Date(), fetchImpl } = {}) {
  const DB = env.DB;
  const { results } = await DB.prepare("SELECT k, v FROM meta WHERE k IN ('lot_at', 'lot_done')").all();
  const m = new Map((results || []).map((r) => [r.k, r.v]));
  if (m.get("lot_at") && now.getTime() - Date.parse(m.get("lot_at")) < 30 * 60e3) return 0;
  const setMeta = (k, v) => DB.prepare("INSERT INTO meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?2").bind(k, v);
  const res = await (fetchImpl || fetch)(`${env.SITE_URL || "https://gachapla.com"}/data/push-lottery.json`, { cf: { cacheTtl: 300 } });
  if (!res.ok) { await setMeta("lot_at", now.toISOString()).run(); return 0; }
  const data = await res.json();
  if (!data || !Array.isArray(data.entries)) return 0;
  const t = jst(now).toISOString().slice(0, 16), tOld = jst(new Date(now.getTime() - 72 * 3600e3)).toISOString().slice(0, 16);
  const ok = data.entries.filter((x) => x && typeof x.k === "string" && x.start && x.end);
  const live = ok.filter((x) => x.start <= t && x.end >= t);
  const first = !m.has("lot_done"); // 最初の1回は「もう始まっていた抽選」として覚えるだけ（まとめて通知しない）
  let done = []; try { done = JSON.parse(m.get("lot_done") || "[]"); } catch {}
  const doneSet = new Set(done), keys = new Set(ok.map((x) => x.k));
  const st = [];
  if (!first) {
    for (const x of live) {
      if (doneSet.has(x.k) || x.start < tOld) continue; // 3日より前に始まった抽選は、いまさら知らせない
      for (const id of (Array.isArray(x.ids) ? x.ids : []).slice(0, 4)) {
        st.push(DB.prepare("INSERT INTO push_events (kind, item_id, shop, shop_name, pref, info, created_at) VALUES ('lottery', ?1, '', ?2, ?3, ?4, ?5)")
          .bind(String(id), String(x.store || "").slice(0, 80), String(x.pref || ""), JSON.stringify({ t: String(x.title || "").slice(0, 80) }), now.toISOString()));
      }
    }
  }
  const next = [...new Set([...done.filter((k) => keys.has(k)), ...live.map((x) => x.k)])];
  st.push(setMeta("lot_done", JSON.stringify(next)), setMeta("lot_at", now.toISOString()));
  await runBatches(DB, st);
  return st.length - 2;
}

/* ---------- 3. push_events → 受け取る人ごとの1通（push_queue） ---------- */
const UTM = "utm_source=webpush&utm_medium=push&utm_campaign=";
const MSG = {
  ja: {
    shopNew: (n) => `「${n}」が入荷しました`, shopBack: (n) => `「${n}」の在庫が復活しました`,
    shopMore: (n, k) => `「${n}」ほか${k}件が入荷・在庫復活`,
    favNew: "★のガチャが入荷", favBack: "★のガチャの在庫が復活",
    favOne: (n, p, k, s) => `「${n}」${p}の${k}店${s ? `（${s}${k > 1 ? "ほか" : ""}）` : ""}。近くの在庫のある店をチェック`,
    favMore: (n, k) => `「${n}」ほか${k}件。近くの在庫のある店をチェック`,
    lot: "★のガチャの抽選がはじまりました", lotOne: (n, s, k) => `${n}（${s}${k > 1 ? `ほか${k - 1}店` : ""}）`, lotMore: (n, k) => `${n} ほか${k}件`,
    item: "ガチャ",
  },
  en: {
    shopNew: (n) => `Now in: ${n}`, shopBack: (n) => `Back in stock: ${n}`,
    shopMore: (n, k) => `${n} and ${k} more arrived or restocked`,
    favNew: "A ★ saved gacha arrived", favBack: "A ★ saved gacha is back in stock",
    favOne: (n, p, k, s) => `${n}: ${k} shop${k > 1 ? "s" : ""} in ${p}${s ? ` (${s}${k > 1 ? " etc." : ""})` : ""}`,
    favMore: (n, k) => `${n} and ${k} more. See shops with stock near you`,
    lot: "A lottery opened for your ★ gacha", lotOne: (n, s, k) => `${n} (${s}${k > 1 ? ` +${k - 1}` : ""})`, lotMore: (n, k) => `${n} and ${k} more`,
    item: "Gacha",
  },
};
const cut = (s, n) => { const t = String(s || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

export async function fanOut(DB, { now = new Date(), names = new Map(), site = "https://gachapla.com" } = {}) {
  const { results } = await DB.prepare("SELECT id, kind, item_id, shop, shop_name, pref, info, created_at FROM push_events ORDER BY id LIMIT ?1").bind(EVENT_BATCH).all();
  const all = results || [];
  if (!all.length) return { events: 0, queued: 0 };
  const maxId = all[all.length - 1].id;
  const evs = all.filter((e) => now.getTime() - Date.parse(e.created_at) < EVENT_TTL_MS);
  const nameOf = (id, lang) => { const n = names.get(id); return (n && ((lang !== "ja" && n.en) || n.ja)) || ""; };

  const stockEv = evs.filter((e) => e.kind === "new" || e.kind === "restock"), lotEv = evs.filter((e) => e.kind === "lottery");
  const byShop = new Map(), byItem = new Map(), lotByItem = new Map();
  for (const e of stockEv) {
    if (!byShop.has(e.shop)) byShop.set(e.shop, []); byShop.get(e.shop).push(e);
    if (!byItem.has(e.item_id)) byItem.set(e.item_id, []); byItem.get(e.item_id).push(e);
  }
  for (const e of lotEv) { if (!lotByItem.has(e.item_id)) lotByItem.set(e.item_id, []); lotByItem.get(e.item_id).push(e); }

  // 受け取る人ごとの下書き
  const plan = new Map();
  const P = (ep) => { if (!plan.has(ep)) plan.set(ep, { shops: new Map(), fav: new Map(), lot: new Map() }); return plan.get(ep); };
  // お店×商品・お店×キーワード
  for (const c of chunk([...byShop.keys()], 40)) {
    const w = await DB.prepare(`SELECT endpoint, kind, shop, item_id, kw FROM push_watch WHERE shop IN (${marks(c.length)})`).bind(...c).all();
    for (const r of w.results || []) {
      const kw = r.kind === "kw" ? normKw(r.kw) : "";
      for (const e of byShop.get(r.shop) || []) {
        const n = names.get(e.item_id);
        const hit = r.kind === "item" ? e.item_id === r.item_id
          : e.kind === "new" && kw.length >= 2 && !!n && (normKw(n.ja).includes(kw) || normKw(n.en).includes(kw));
        if (!hit) continue;
        const sh = P(r.endpoint).shops;
        if (!sh.has(e.shop)) sh.set(e.shop, { name: e.shop_name, items: new Map() });
        if (!sh.get(e.shop).items.has(e.item_id)) sh.get(e.shop).items.set(e.item_id, e.kind);
      }
    }
  }
  // ★のガチャ（都道府県・抽選）
  for (const c of chunk([...new Set([...byItem.keys(), ...lotByItem.keys()])], 40)) {
    const f = await DB.prepare(`SELECT f.item_id, f.endpoint, o.prefs, o.stock, o.lottery FROM push_fav f JOIN push_opt o ON o.endpoint = f.endpoint WHERE f.item_id IN (${marks(c.length)})`).bind(...c).all();
    for (const r of f.results || []) {
      if (r.stock) {
        let prefs = []; try { prefs = JSON.parse(r.prefs || "[]"); } catch {}
        const hits = (byItem.get(r.item_id) || []).filter((e) => prefs.includes(e.pref));
        if (hits.length) P(r.endpoint).fav.set(r.item_id, hits);
      }
      if (r.lottery && lotByItem.has(r.item_id)) P(r.endpoint).lot.set(r.item_id, lotByItem.get(r.item_id));
    }
  }

  const st = [DB.prepare("DELETE FROM push_events WHERE id <= ?1").bind(maxId)];
  let queued = 0;
  const eps = [...plan.keys()];
  if (eps.length) {
    // 言語（登録が消えている人には送らない）と、最近送ったもの（繰り返さない）
    const lang = new Map(), cool = new Set();
    const cutoff = new Date(now.getTime() - COOL_MS).toISOString();
    for (const c of chunk(eps, 40)) {
      const s = await DB.prepare(`SELECT endpoint, lang FROM push_subs WHERE endpoint IN (${marks(c.length)})`).bind(...c).all();
      for (const r of s.results || []) lang.set(r.endpoint, r.lang);
      const q = await DB.prepare(`SELECT endpoint, k FROM push_sent WHERE at >= ?1 AND endpoint IN (${marks(c.length, 2)})`).bind(cutoff, ...c).all();
      for (const r of q.results || []) cool.add(`${r.endpoint}\n${r.k}`);
    }
    const nowIso = now.toISOString();
    for (const [ep, p] of plan) {
      if (!lang.has(ep)) continue;
      const L = lang.get(ep) === "ja" ? "ja" : "en", M = MSG[L], home = `${site}/${lang.get(ep) === "ja" ? "" : lang.get(ep) + "/"}`;
      const nm = (id) => cut(nameOf(id, L) || M.item, 40);
      const out = []; // { payload, keys }
      // 抽選（数が少なく、期限があるので先に）
      if (p.lot.size) {
        const ids = [...p.lot.keys()], e0 = p.lot.get(ids[0]);
        let title = ""; try { title = JSON.parse(e0[0].info || "{}").t || ""; } catch {}
        title = cut(title || nm(ids[0]), 40);
        const stores = new Set(e0.map((e) => e.shop_name));
        out.push({ keys: [], payload: { title: M.lot, body: ids.length > 1 ? M.lotMore(title, ids.length - 1) : M.lotOne(title, cut(e0[0].shop_name, 24), stores.size), url: `${site}/lottery?${UTM}lottery`, tag: `lot-${ids[0]}` } });
      }
      // お店ごとに1通
      const covered = new Set();
      const shops = [...p.shops.entries()].map(([shop, v]) => {
        const items = [...v.items.entries()].filter(([id]) => !cool.has(`${ep}\nw:${shop}:${id}`));
        return { shop, name: v.name, items };
      }).filter((x) => x.items.length).sort((a, b) => b.items.length - a.items.length);
      for (const x of shops) {
        const [id0, kind0] = x.items[0];
        for (const [id] of x.items) covered.add(`${x.shop}\n${id}`);
        out.push({ keys: x.items.map(([id]) => `w:${x.shop}:${id}`), payload: {
          title: `🔔 ${cut(x.name, 40)}`,
          body: x.items.length > 1 ? M.shopMore(nm(id0), x.items.length - 1) : kind0 === "new" ? M.shopNew(nm(id0)) : M.shopBack(nm(id0)),
          url: `${site}/shop/${x.shop}?${UTM}shop`, tag: `shop-${x.shop}`,
        } });
      }
      // ★のガチャ：全部まとめて1通
      const favs = [...p.fav.entries()].map(([id, hits]) => ({ id, hits: hits.filter((e) => !covered.has(`${e.shop}\n${id}`)) }))
        .filter((x) => x.hits.length && !cool.has(`${ep}\nf:${x.id}`)).sort((a, b) => b.hits.length - a.hits.length);
      if (favs.length) {
        const f0 = favs[0], anyNew = favs.some((x) => x.hits.some((e) => e.kind === "new"));
        const prefN = new Map(); for (const e of f0.hits) prefN.set(e.pref, (prefN.get(e.pref) || 0) + 1);
        const topPref = [...prefN.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const inPref = f0.hits.filter((e) => e.pref === topPref);
        out.push({ keys: favs.map((x) => `f:${x.id}`), payload: {
          title: anyNew ? M.favNew : M.favBack,
          body: favs.length > 1 ? M.favMore(nm(f0.id), favs.length - 1) : M.favOne(nm(f0.id), topPref, inPref.length, cut(inPref[0].shop_name, 24)),
          url: favs.length > 1 ? `${home}mylist?${UTM}fav` : `${home}item/${f0.id}?${UTM}fav#stock`, tag: `fav-${f0.id}`,
        } });
      }
      for (const o of out.slice(0, DAILY_MAX)) {
        queued++;
        st.push(DB.prepare("INSERT INTO push_queue (endpoint, payload, created_at) VALUES (?1, ?2, ?3)").bind(ep, JSON.stringify({ ...o.payload, icon: `${site}/images/icons/icon-192.png` }), nowIso));
        for (const k of o.keys.slice(0, 20)) st.push(DB.prepare("INSERT INTO push_sent (endpoint, k, at) VALUES (?1, ?2, ?3) ON CONFLICT(endpoint, k) DO UPDATE SET at = ?3").bind(ep, k, nowIso));
      }
    }
  }
  await runBatches(DB, st);
  return { events: all.length, queued };
}

/* ---------- 4. push_queue → 送る ---------- */
// send(sub, data) は HTTP の状態番号を返す（ワーカーは lib/webpush.js の sendPush を渡す）
export async function sendQueue(DB, { now = new Date(), max = 25, send } = {}) {
  if (isQuiet(now) || max <= 0) return 0;
  const { results } = await DB.prepare("SELECT q.id, q.endpoint, q.payload, q.created_at, s.p256dh, s.auth, o.sent_day, o.sent_n FROM push_queue q LEFT JOIN push_subs s ON s.endpoint = q.endpoint LEFT JOIN push_opt o ON o.endpoint = q.endpoint ORDER BY q.id LIMIT ?1").bind(QUEUE_READ).all();
  const rows = results || [];
  if (!rows.length) return 0;
  const today = dayJST(now), count = new Map(), del = [], bump = new Map(), gone = new Set(), hold = new Set();
  let sent = 0;
  for (const r of rows) {
    if (gone.has(r.endpoint) || !r.p256dh || now.getTime() - Date.parse(r.created_at) > QUEUE_TTL_MS) { del.push(r.id); continue; }
    if (hold.has(r.endpoint)) continue; // 送り直し待ちの人は、順番を守って次の回に
    const n = count.has(r.endpoint) ? count.get(r.endpoint) : (r.sent_day === today ? r.sent_n || 0 : 0);
    count.set(r.endpoint, n);
    if (n >= DAILY_MAX) { del.push(r.id); continue; } // きょうはもう送りすぎ：捨てる
    if (sent >= max) break;
    sent++;
    let data; try { data = JSON.parse(r.payload); } catch { del.push(r.id); continue; }
    let status = 0;
    try { status = await send({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }, data); } catch (e) { console.log(`alert push: ${e.message}`); status = 400; }
    if (status === 404 || status === 410) { gone.add(r.endpoint); del.push(r.id); continue; }
    if (status === 429 || status >= 500) { hold.add(r.endpoint); continue; }
    del.push(r.id);
    if (status >= 200 && status < 300) { count.set(r.endpoint, n + 1); bump.set(r.endpoint, (bump.get(r.endpoint) || 0) + 1); }
  }
  const st = [];
  for (const c of chunk(del, 40)) st.push(DB.prepare(`DELETE FROM push_queue WHERE id IN (${marks(c.length)})`).bind(...c));
  for (const [ep, k] of bump) {
    st.push(DB.prepare("INSERT INTO push_opt (endpoint, sent_day, sent_n, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(endpoint) DO UPDATE SET sent_n = CASE WHEN sent_day = ?2 THEN sent_n + ?3 ELSE ?3 END, sent_day = ?2")
      .bind(ep, today, k, now.toISOString()));
  }
  for (const ep of gone) st.push(...dropSubStatements(DB, ep));
  await runBatches(DB, st);
  return sent;
}

// 古い「送った記録」を消す（1日1回くらいでよい）
export const pruneStatements = (DB, now = new Date()) => [
  DB.prepare("DELETE FROM push_sent WHERE at < ?1").bind(new Date(now.getTime() - 3 * 864e5).toISOString()),
];
