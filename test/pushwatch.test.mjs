// お知らせ（入荷・在庫復活・抽選開始・お店のお知らせ・毎週の新作まとめ）のテスト（node --test test/*.mjs）
// D1 は node:sqlite でまねる。通知は実際には送らない（送る関数・fetch を差し替える）
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeD1 } from "./helpers/d1.mjs";
import * as PW from "../lib/pushwatch.js";
import { getVapidKeys, decryptPayload } from "../lib/webpush.js";
import worker from "../worker/index.js";
import * as subApi from "../functions/api/push/subscribe.js";
import * as watchApi from "../functions/api/push/watch.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const newDB = () => makeD1(path.join(ROOT, "worker/schema.sql"));
const EP = (n) => `https://fcm.googleapis.com/fcm/send/user-${n}`;
const NOON = new Date("2026-11-26T03:00:00Z"); // 日本時間 木曜12:00
const NAMES = new Map([
  ["item-a", { ja: "ちいかわ めじるしアクセサリー", en: "Chiikawa Charm" }],
  ["item-b", { ja: "サンリオキャラクターズ ふわふわマスコット", en: "" }],
  ["item-c", { ja: "ポケモン ならぶんです", en: "" }],
]);

// 本物の形の鍵（p256dh は65バイト、auth は16バイト）
async function realKeys() {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const b64u = (b) => Buffer.from(b).toString("base64url");
  return { p256dh: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))), privateJwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
}
async function addSub(DB, n, { fav = [], prefs = [], opts = null, lang = "ja", keys } = {}) {
  const k = keys || { p256dh: "p", auth: "a" };
  await DB.prepare("INSERT INTO push_subs (endpoint, p256dh, auth, lang, favorites, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)").bind(EP(n), k.p256dh, k.auth, lang, JSON.stringify(fav), NOON.toISOString()).run();
  await PW.syncFavs(DB, EP(n), fav);
  if (opts) await PW.saveOpt(DB, EP(n), { prefs, opts }, NOON.toISOString());
}
const addWatch = (DB, n, kind, shop, x) => DB.prepare("INSERT INTO push_watch (endpoint, kind, shop, item_id, kw, shop_name, item_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'みせ', '', ?6)")
  .bind(EP(n), kind, shop, kind === "item" ? x : "", kind === "kw" ? x : "", NOON.toISOString()).run();
const emit = async (DB, item, changes, at = NOON) => { const st = await PW.eventStatements(DB, item, changes, at.toISOString()); if (st.length) await DB.batch(st); return st.length; };
const queue = (DB) => DB.rows("SELECT endpoint, payload FROM push_queue ORDER BY id").map((r) => ({ ep: r.endpoint, ...JSON.parse(r.payload) }));
const sender = (log, status = 201) => async (sub, data) => { log.push({ ep: sub.endpoint, ...data }); return typeof status === "function" ? status(sub) : status; };

test("normKw: ひらがな・カタカナ、全角半角、記号の違いをなくす", () => {
  assert.equal(PW.normKw("めじるし アクセサリー"), PW.normKw("メジルシアクセサリー"));
  assert.equal(PW.normKw("ＳＡＮＲＩＯ・キャラ"), "sanrioキャラ");
  assert.equal(PW.cleanPrefs(["東京都", "x", "東京都", "大阪府"]).join(), "東京都,大阪府");
});

test("syncFavs は変わったところだけ書く。saveOpt は何も言われなければ全部オフ", async () => {
  const DB = newDB();
  assert.equal(await PW.syncFavs(DB, EP(1), ["a", "b", "c"]), 3);
  assert.equal(await PW.syncFavs(DB, EP(1), ["a", "b", "c"]), 0);
  assert.equal(await PW.syncFavs(DB, EP(1), ["b", "d"]), 3);
  assert.deepEqual(DB.rows("SELECT item_id FROM push_fav ORDER BY 1").map((r) => r.item_id), ["b", "d"]);
  await PW.saveOpt(DB, EP(1), { prefs: ["東京都", "うそ県"], opts: {} });
  assert.deepEqual(DB.rows("SELECT prefs, stock, lottery, weekly FROM push_opt")[0], { prefs: '["東京都"]', stock: 0, lottery: 0, weekly: 0 });
  await PW.saveOpt(DB, EP(1), { prefs: [], opts: { stock: true, weekly: 1, lottery: "yes" } });
  assert.deepEqual(DB.rows("SELECT prefs, stock, lottery, weekly FROM push_opt")[0], { prefs: "[]", stock: 1, lottery: 0, weekly: 1 });
});

test("A：だれも待っていない動きは書かない。★×都道府県が合うものだけ書く", async () => {
  const DB = newDB();
  const ch = [{ kind: "new", shop: "s1", name: "東京の店", pref: "東京都" }, { kind: "restock", shop: "s2", name: "大阪の店", pref: "大阪府" }, { kind: "new", shop: "", name: "番号なし", pref: "東京都" }];
  assert.equal(await emit(DB, "item-a", ch), 0);
  await addSub(DB, 1, { fav: ["item-a"], prefs: ["東京都"], opts: { stock: 1 } });
  await addSub(DB, 2, { fav: ["item-a"], prefs: ["大阪府"], opts: { stock: 0 } }); // 入荷のお知らせはオフ
  await addSub(DB, 3, { fav: ["item-a"] }); // 古い登録（設定なし）
  assert.equal(await emit(DB, "item-a", ch), 1);
  assert.equal(await emit(DB, "item-b", ch), 0);
  assert.deepEqual(DB.rows("SELECT kind, item_id, shop, pref FROM push_events"), [{ kind: "new", item_id: "item-a", shop: "s1", pref: "東京都" }]);
});

test("A：★のガチャは1通にまとめる。オフの人・古い登録・都道府県ちがいには送らない", async () => {
  const DB = newDB();
  await addSub(DB, 1, { fav: ["item-a", "item-b"], prefs: ["東京都"], opts: { stock: 1 } });
  await addSub(DB, 2, { fav: ["item-a"], prefs: ["大阪府"], opts: { stock: 1 } });
  await addSub(DB, 3, { fav: ["item-a"] });
  await addSub(DB, 4, { fav: ["item-a"], prefs: ["東京都"], opts: { lottery: 1 } });
  await emit(DB, "item-a", [{ kind: "restock", shop: "s1", name: "秋葉原の店", pref: "東京都" }, { kind: "restock", shop: "s2", name: "池袋の店", pref: "東京都" }]);
  await emit(DB, "item-b", [{ kind: "new", shop: "s1", name: "秋葉原の店", pref: "東京都" }]);
  const r = await PW.fanOut(DB, { now: NOON, names: NAMES });
  assert.deepEqual(r, { events: 3, queued: 1 });
  const q = queue(DB);
  assert.equal(q.length, 1);
  assert.equal(q[0].ep, EP(1));
  assert.equal(q[0].title, "★のガチャが入荷");
  assert.match(q[0].body, /ちいかわ めじるしアクセサリー.*ほか1件.*近くの在庫のある店/);
  assert.match(q[0].url, /^https:\/\/gachapla\.com\/mylist\?utm_source=webpush/);
  assert.equal(DB.rows("SELECT count(*) n FROM push_events")[0].n, 0);
});

test("A：1商品だけなら都道府県と店の数を出す。同じ商品は20時間は繰り返さない", async () => {
  const DB = newDB();
  await addSub(DB, 1, { fav: ["item-a"], prefs: ["東京都", "千葉県"], opts: { stock: 1 }, lang: "en" });
  const ch = [{ kind: "restock", shop: "s1", name: "秋葉原の店", pref: "東京都" }, { kind: "restock", shop: "s2", name: "池袋の店", pref: "東京都" }, { kind: "restock", shop: "s3", name: "千葉の店", pref: "千葉県" }];
  await emit(DB, "item-a", ch);
  await PW.fanOut(DB, { now: NOON, names: NAMES });
  let q = queue(DB);
  assert.equal(q.length, 1);
  assert.equal(q[0].title, "A ★ saved gacha is back in stock");
  assert.match(q[0].body, /Chiikawa Charm: 2 shops in 東京都/);
  assert.match(q[0].url, /\/en\/item\/item-a\?utm_source=webpush.*#stock$/);
  // 1時間後にまた復活（公式の一覧が出たり消えたりしても、繰り返さない）
  const t1 = new Date(NOON.getTime() + 3600e3);
  await emit(DB, "item-a", ch, t1);
  assert.equal((await PW.fanOut(DB, { now: t1, names: NAMES })).queued, 0);
  // 21時間後なら送る
  const t2 = new Date(NOON.getTime() + 21 * 3600e3);
  await emit(DB, "item-a", ch, t2);
  assert.equal((await PW.fanOut(DB, { now: t2, names: NAMES })).queued, 1);
});

test("E：お店×商品。同じお店のことは1回に1通にまとめる", async () => {
  const DB = newDB();
  await addSub(DB, 1);
  await addWatch(DB, 1, "item", "s1", "item-a");
  await addWatch(DB, 1, "item", "s1", "item-b");
  await addWatch(DB, 1, "item", "s2", "item-c");
  await addSub(DB, 2);
  await addWatch(DB, 2, "item", "s9", "item-a"); // 別のお店
  assert.equal(await emit(DB, "item-a", [{ kind: "restock", shop: "s1", name: "秋葉原の店", pref: "東京都" }, { kind: "new", shop: "s5", name: "ほかの店", pref: "東京都" }]), 1);
  assert.equal(await emit(DB, "item-b", [{ kind: "new", shop: "s1", name: "秋葉原の店", pref: "東京都" }]), 1);
  assert.equal(await emit(DB, "item-c", [{ kind: "restock", shop: "s2", name: "池袋の店", pref: "東京都" }]), 1);
  await PW.fanOut(DB, { now: NOON, names: NAMES });
  const q = queue(DB);
  assert.equal(q.length, 2);
  assert.ok(q.every((x) => x.ep === EP(1)));
  const s1 = q.find((x) => x.tag === "shop-s1"), s2 = q.find((x) => x.tag === "shop-s2");
  assert.equal(s1.title, "🔔 秋葉原の店");
  assert.match(s1.body, /ほか1件が入荷・在庫復活/);
  assert.equal(s2.body, "「ポケモン ならぶんです」の在庫が復活しました");
  assert.match(s2.url, /\/shop\/s2\?utm_source=webpush/);
});

test("F：お店×キーワード。初めての入荷だけ（在庫復活では送らない）。名前に含むものだけ", async () => {
  const DB = newDB();
  await addSub(DB, 1);
  await addWatch(DB, 1, "kw", "s1", "めじるしアクセサリー");
  await addSub(DB, 2);
  await addWatch(DB, 2, "kw", "s1", "ｻﾝﾘｵ");
  assert.equal(await emit(DB, "item-a", [{ kind: "new", shop: "s1", name: "秋葉原の店", pref: "東京都" }]), 1);
  assert.equal(await emit(DB, "item-b", [{ kind: "new", shop: "s1", name: "秋葉原の店", pref: "東京都" }]), 1);
  assert.equal(await emit(DB, "item-c", [{ kind: "restock", shop: "s1", name: "秋葉原の店", pref: "東京都" }]), 0);
  assert.equal(await emit(DB, "item-a", [{ kind: "new", shop: "s2", name: "キーワードのない店", pref: "東京都" }]), 0);
  await PW.fanOut(DB, { now: NOON, names: NAMES });
  const q = queue(DB);
  assert.equal(q.length, 2);
  assert.equal(q.find((x) => x.ep === EP(1)).body, "「ちいかわ めじるしアクセサリー」が入荷しました");
  assert.equal(q.find((x) => x.ep === EP(2)).body, "「サンリオキャラクターズ ふわふわマスコット」が入荷しました");
});

test("お店のお知らせと★が同じ動きなら、★のほうでは重ねて送らない", async () => {
  const DB = newDB();
  await addSub(DB, 1, { fav: ["item-a"], prefs: ["東京都"], opts: { stock: 1 } });
  await addWatch(DB, 1, "item", "s1", "item-a");
  await emit(DB, "item-a", [{ kind: "restock", shop: "s1", name: "秋葉原の店", pref: "東京都" }]);
  await PW.fanOut(DB, { now: NOON, names: NAMES });
  assert.deepEqual(queue(DB).map((x) => x.tag), ["shop-s1"]);
});

test("古い出来事は捨てる。登録が消えた人には作らない", async () => {
  const DB = newDB();
  await addSub(DB, 1, { fav: ["item-a"], prefs: ["東京都"], opts: { stock: 1 } });
  await emit(DB, "item-a", [{ kind: "new", shop: "s1", name: "店", pref: "東京都" }], new Date(NOON.getTime() - 13 * 3600e3));
  assert.deepEqual(await PW.fanOut(DB, { now: NOON, names: NAMES }), { events: 1, queued: 0 });
  await emit(DB, "item-a", [{ kind: "new", shop: "s1", name: "店", pref: "東京都" }]);
  await DB.prepare("DELETE FROM push_subs").run();
  assert.deepEqual(await PW.fanOut(DB, { now: NOON, names: NAMES }), { events: 1, queued: 0 });
});

test("送る：1人1日3通まで・1回に送る数の上限・夜は送らない", async () => {
  const DB = newDB();
  await addSub(DB, 1); await addSub(DB, 2);
  const put = (n, k, at = NOON) => DB.prepare("INSERT INTO push_queue (endpoint, payload, created_at) VALUES (?1, ?2, ?3)").bind(EP(n), JSON.stringify({ title: `t${k}`, body: "b" }), at.toISOString()).run();
  for (let k = 1; k <= 5; k++) await put(1, k);
  await put(2, 1);
  // 夜（日本時間23時）は送らない。予定は残る
  let log = [];
  assert.equal(await PW.sendQueue(DB, { now: new Date("2026-11-26T14:00:00Z"), send: sender(log) }), 0);
  assert.equal(DB.rows("SELECT count(*) n FROM push_queue")[0].n, 6);
  // 1回に2通まで
  assert.equal(await PW.sendQueue(DB, { now: NOON, max: 2, send: sender(log) }), 2);
  assert.deepEqual(log.map((x) => x.title), ["t1", "t2"]);
  assert.equal(DB.rows("SELECT sent_n FROM push_opt WHERE endpoint = ?", EP(1))[0].sent_n, 2);
  // 次の回：1人目はあと1通だけ（4・5通目は捨てる）。2人目は送る
  log = [];
  assert.equal(await PW.sendQueue(DB, { now: new Date(NOON.getTime() + 600e3), max: 25, send: sender(log) }), 2);
  assert.deepEqual(log.map((x) => `${x.ep.slice(-1)}:${x.title}`), ["1:t3", "2:t1"]);
  assert.equal(DB.rows("SELECT count(*) n FROM push_queue")[0].n, 0);
  assert.deepEqual(DB.rows("SELECT sent_day, sent_n FROM push_opt WHERE endpoint = ?", EP(1))[0], { sent_day: "2026-11-26", sent_n: 3 });
  // 同じ日はもう送らない。次の日はまた送れる
  await put(1, 6);
  log = [];
  assert.equal(await PW.sendQueue(DB, { now: new Date(NOON.getTime() + 1200e3), send: sender(log) }), 0);
  const next = new Date(NOON.getTime() + 24 * 3600e3);
  await put(1, 7, next);
  assert.equal(await PW.sendQueue(DB, { now: next, send: sender(log) }), 1);
  assert.deepEqual(DB.rows("SELECT sent_day, sent_n FROM push_opt WHERE endpoint = ?", EP(1))[0], { sent_day: "2026-11-27", sent_n: 1 });
  // オプションを保存し直しても、きょう送った数は消えない
  await PW.saveOpt(DB, EP(1), { prefs: ["東京都"], opts: { stock: 1 } });
  assert.equal(DB.rows("SELECT sent_n FROM push_opt WHERE endpoint = ?", EP(1))[0].sent_n, 1);
});

test("送る：送り先が無くなっていたら（410）全部消す。混んでいたら（429）残す。古い予定は捨てる", async () => {
  const DB = newDB();
  await addSub(DB, 1, { fav: ["item-a"], prefs: ["東京都"], opts: { stock: 1 } }); await addWatch(DB, 1, "kw", "s1", "ちいかわ");
  await addSub(DB, 2); await addSub(DB, 3);
  const put = (n, at = NOON) => DB.prepare("INSERT INTO push_queue (endpoint, payload, created_at) VALUES (?1, ?3, ?2)").bind(EP(n), at.toISOString(), JSON.stringify({ title: "t" })).run();
  await put(1); await put(1); await put(2); await put(2); await put(3, new Date(NOON.getTime() - 13 * 3600e3));
  const log = [];
  const n = await PW.sendQueue(DB, { now: NOON, send: sender(log, (s) => (s.endpoint === EP(1) ? 410 : 429)) });
  assert.equal(n, 2); // 1人目に1回、2人目に1回だけ試す
  for (const t of ["push_subs", "push_opt", "push_fav", "push_watch", "push_queue"]) assert.equal(DB.rows(`SELECT count(*) n FROM ${t} WHERE endpoint = ?`, EP(1))[0].n, 0, t);
  assert.equal(DB.rows("SELECT count(*) n FROM push_queue WHERE endpoint = ?", EP(2))[0].n, 2);
  assert.equal(DB.rows("SELECT count(*) n FROM push_queue WHERE endpoint = ?", EP(3))[0].n, 0);
  assert.equal(DB.rows("SELECT count(*) n FROM push_opt WHERE endpoint = ?", EP(2))[0].n, 0); // 送れていないので数えない
});

test("B：抽選の開始。最初の1回は覚えるだけ、新しく始まったものだけ、★でオンの人に1通", async () => {
  const DB = newDB();
  await addSub(DB, 1, { fav: ["item-a"], opts: { lottery: 1 } });
  await addSub(DB, 2, { fav: ["item-a"], opts: { stock: 1 } });
  const env = { DB, SITE_URL: "https://example.test" };
  let entries = [{ k: "old1", ids: ["item-a"], title: "前からの抽選", store: "A店", pref: "東京都", start: "2026-11-25T10:00", end: "2026-11-30T23:59" }];
  let calls = 0;
  const fetchImpl = async (u) => { calls++; assert.equal(u, "https://example.test/data/push-lottery.json"); return new Response(JSON.stringify({ entries })); };
  assert.equal(await PW.detectLottery(env, { now: NOON, fetchImpl }), 0); // 最初：覚えるだけ
  entries = [...entries,
    { k: "new1", ids: ["item-a"], title: "ちいかわ めじるしアクセサリー", store: "B店", pref: "福岡県", start: "2026-11-26T12:30", end: "2026-11-28T23:59" },
    { k: "new2", ids: ["item-a"], title: "ちいかわ めじるしアクセサリー", store: "C店", pref: "福岡県", start: "2026-11-26T12:30", end: "2026-11-28T23:59" },
    { k: "soon", ids: ["item-a"], title: "まだ始まっていない", store: "D店", pref: "", start: "2026-11-27T10:00", end: "2026-11-28T23:59" },
    { k: "stale", ids: ["item-a"], title: "だいぶ前から", store: "E店", pref: "", start: "2026-11-20T10:00", end: "2026-11-28T23:59" }];
  assert.equal(await PW.detectLottery(env, { now: new Date(NOON.getTime() + 10 * 60e3), fetchImpl }), 0); // 30分たつまで見に行かない
  assert.equal(calls, 1);
  const t1 = new Date(NOON.getTime() + 40 * 60e3);
  assert.equal(await PW.detectLottery(env, { now: t1, fetchImpl }), 2);
  const t2 = new Date(NOON.getTime() + 80 * 60e3);
  assert.equal(await PW.detectLottery(env, { now: t2, fetchImpl }), 0); // 2回は書かない
  await PW.fanOut(DB, { now: t2, names: NAMES });
  const q = queue(DB);
  assert.equal(q.length, 1);
  assert.equal(q[0].ep, EP(1));
  assert.equal(q[0].title, "★のガチャの抽選がはじまりました");
  assert.equal(q[0].body, "ちいかわ めじるしアクセサリー（B店ほか1店）");
  // 読めなかった回（404）は何もしない
  assert.equal(await PW.detectLottery(env, { now: new Date(t2.getTime() + 3600e3), fetchImpl: async () => new Response("no", { status: 404 }) }), 0);
});

/* ---------- ワーカー全体（在庫の確認 → 出来事 → まとめ → 送信） ---------- */
function mockFetch({ targets, shopsByCode, pushWeek, lottery, pushes }) {
  return async (url, init) => {
    const u = String(url);
    if (u.endsWith("/data/stock-targets.json")) return new Response(JSON.stringify(targets));
    if (u.endsWith("/data/push-week.json")) return new Response(JSON.stringify(pushWeek || { weeks: [] }));
    if (u.endsWith("/data/push-lottery.json")) return new Response(JSON.stringify(lottery || { entries: [] }));
    if (u.includes("gashapon.jp/shop/leaflet/getShops.php")) return new Response(JSON.stringify({ gplus_data: shopsByCode[init.body.get("product_code")] || [] }));
    if (u.startsWith("https://fcm.googleapis.com/")) { pushes.push({ url: u, init }); return new Response("", { status: 201 }); }
    throw new Error(`unexpected fetch ${u}`);
  };
}
const shop = (code, title, pref) => ({ shop_code: code, shop_title: title, shop_pref: pref, shop_address: `${pref}どこか`, latitude: "35.6", longitude: "139.7", delflg: "0" });
async function runCron(env) {
  const jobs = [];
  await worker.scheduled({}, env, { waitUntil: (p) => jobs.push(p) });
  await Promise.all(jobs);
}

test("ワーカー：在庫復活と入荷を見つけて、待っている人にだけ暗号化して送る（最初の観測は入荷に数えない）", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: NOON.getTime() });
  const tick = setInterval(() => {}, 1); tick.unref && tick.unref();
  const DB = newDB();
  const k1 = await realKeys();
  await addSub(DB, 1, { fav: ["item-a"], prefs: ["東京都"], opts: { stock: 1 }, keys: k1 });
  await addSub(DB, 2, { fav: ["item-a"], keys: await realKeys() }); // 古い登録：なにも増えない
  await addSub(DB, 3, { keys: await realKeys() }); await addWatch(DB, 3, "kw", "s200", "サンリオ");
  const targets = [{ id: "item-a", code: "4500000000001", n: "ちいかわ めじるしアクセサリー" }, { id: "item-b", code: "4500000000002", n: "サンリオキャラクターズ ふわふわマスコット" }];
  const shopsByCode = { "4500000000001": [shop("S100", "秋葉原の店", "東京都")], "4500000000002": [] };
  const pushes = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = mockFetch({ targets, shopsByCode, pushes });
  t.after(() => { globalThis.fetch = realFetch; clearInterval(tick); });
  const env = { DB, SITE_URL: "https://gachapla.com" };
  // sleep(2000) を進める係
  const pump = async (p) => { let done = false; p.then(() => { done = true; }, () => { done = true; }); while (!done) { t.mock.timers.tick(2000); await new Promise((r) => setImmediate(r)); } return p; };

  await pump(runCron(env)); // 1回目：最初の観測（入荷に数えない）
  assert.equal(pushes.length, 0);
  assert.equal(DB.rows("SELECT count(*) n FROM push_events")[0].n, 0);

  shopsByCode["4500000000001"] = []; // 売り切れ
  await pump(runCron(env));
  assert.equal(DB.rows("SELECT in_now FROM seen WHERE item_id = 'item-a'")[0].in_now, 0);

  // 3回目：item-a が秋葉原で復活＋大阪に入荷、item-b が S200 に初入荷
  shopsByCode["4500000000001"] = [shop("S100", "秋葉原の店", "東京都"), shop("S300", "大阪の店", "大阪府")];
  shopsByCode["4500000000002"] = [shop("S200", "サンリオのある店", "千葉県")];
  await pump(runCron(env));
  assert.equal(pushes.length, 2);
  const got = {};
  for (const p of pushes) {
    assert.match(p.init.headers.Authorization, /^vapid t=/);
    const n = Number(p.url.slice(-1)), keys = n === 1 ? k1 : null;
    got[n] = keys ? JSON.parse(new TextDecoder().decode(await decryptPayload({ body: new Uint8Array(p.init.body), uaPublic: keys.p256dh, uaPrivateJwk: keys.privateJwk, auth: keys.auth }))) : true;
  }
  assert.deepEqual(Object.keys(got).sort(), ["1", "3"]);
  assert.equal(got[1].title, "★のガチャの在庫が復活");
  assert.match(got[1].body, /「ちいかわ めじるしアクセサリー」東京都の1店（秋葉原の店）/);
  assert.equal(DB.rows("SELECT count(*) n FROM push_events")[0].n, 0);
  assert.equal(DB.rows("SELECT count(*) n FROM push_queue")[0].n, 0);
  assert.equal(DB.rows("SELECT restocks FROM seen WHERE item_id = 'item-a' AND shop = 'S100'")[0].restocks, 1); // もとの記録もそのまま
});

test("C：月曜の朝。★が今週発売の人にはこれまでどおり、新作まとめはオンにした人だけ、ほかの人には送らない", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-11-23T00:30:00Z").getTime() }); // 日本時間 月曜9:30
  const DB = newDB();
  const ks = [await realKeys(), await realKeys(), await realKeys(), await realKeys()];
  await addSub(DB, 1, { fav: ["wk-1"], keys: ks[0] }); // 古い登録・★が今週発売 → これまでどおり
  await addSub(DB, 2, { fav: ["other"], keys: ks[1] }); // 古い登録・今週は関係なし → 送らない
  await addSub(DB, 3, { fav: [], opts: { weekly: 1 }, keys: ks[2] }); // 新作まとめをオン
  await addSub(DB, 4, { fav: ["other"], opts: { stock: 1 }, keys: ks[3] }); // 入荷だけオン → まとめは送らない
  await addSub(DB, 5, { fav: ["wk-1"], opts: { rel: 0, stock: 1 }, keys: ks[3] }); // 発売週のお知らせをオフにした人 → ★が今週発売でも送らない
  const pushes = [];
  const pushWeek = { weeks: [{ week_key: "2026-11-23", items: [{ id: "wk-1", name_ja: "今週のガチャ1" }, { id: "wk-2", name_ja: "今週のガチャ2" }, { id: "wk-3", name_ja: "今週のガチャ3" }] }] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = mockFetch({ targets: [], shopsByCode: {}, pushWeek, pushes });
  t.after(() => { globalThis.fetch = realFetch; });
  await runCron({ DB, SITE_URL: "https://gachapla.com" });
  const body = async (n) => { const p = pushes.find((x) => x.url.endsWith(`user-${n}`)); return p ? JSON.parse(new TextDecoder().decode(await decryptPayload({ body: new Uint8Array(p.init.body), uaPublic: ks[n - 1].p256dh, uaPrivateJwk: ks[n - 1].privateJwk, auth: ks[n - 1].auth }))) : null; };
  assert.equal(pushes.length, 2);
  assert.deepEqual(await body(1).then((d) => [d.title, d.body, d.url]), ["★保存したガチャが今週発売", "今週発売：今週のガチャ1", "https://gachapla.com/mylist"]);
  const d3 = await body(3);
  assert.equal(d3.title, "今週発売のガチャ 3シリーズ");
  assert.equal(d3.body, "今週のガチャ1、今週のガチャ2 ほか1件");
  assert.match(d3.url, /^https:\/\/gachapla\.com\/week\?utm_source=webpush/);
  assert.deepEqual(DB.rows("SELECT last_sent_week w FROM push_subs").map((r) => r.w), Array(5).fill("2026-11-23"));
  // 同じ週にもう一度動いても送らない
  await runCron({ DB, SITE_URL: "https://gachapla.com" });
  assert.equal(pushes.length, 2);
});

/* ---------- サイトの窓口 ---------- */
const post = (api, DB, body, method = "POST") => api[method === "DELETE" ? "onRequestDelete" : "onRequestPost"]({ env: { DB }, request: new Request("https://gachapla.com/api/push/x", { method, headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.5", "User-Agent": "test" }, body: JSON.stringify(body) }) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

test("窓口：古い画面からの登録は設定を作らない。新しい画面は選んだものだけオン。やめると全部消える", async () => {
  const DB = newDB();
  const k = await realKeys(), sub = { endpoint: EP(1), keys: { p256dh: k.p256dh, auth: k.auth } };
  let r = await post(subApi, DB, { subscription: sub, favorites: ["item-a", "item-b"], lang: "ja" });
  assert.equal(r.ok, true);
  assert.equal(DB.rows("SELECT count(*) n FROM push_opt")[0].n, 0);
  assert.equal(DB.rows("SELECT count(*) n FROM push_fav")[0].n, 2);
  r = await post(subApi, DB, { subscription: sub, favorites: ["item-a"], lang: "ja", prefs: ["東京都", "大阪府"], opts: { stock: true, lottery: false, weekly: false } });
  assert.equal(r.ok, true);
  assert.deepEqual(DB.rows("SELECT prefs, stock, lottery, weekly FROM push_opt")[0], { prefs: '["東京都","大阪府"]', stock: 1, lottery: 0, weekly: 0 });
  assert.deepEqual(DB.rows("SELECT item_id FROM push_fav").map((x) => x.item_id), ["item-a"]);

  // お店のお知らせ
  await DB.prepare("INSERT INTO shops (id, name, pref, lat, lng) VALUES ('s100', '秋葉原の店', '東京都', 35.6, 139.7), ('s999', '在庫データのない店', '東京都', 35.6, 139.7)").run();
  await DB.prepare("INSERT INTO seen (item_id, shop, pref, name, first_seen) VALUES ('item-a', 'S100', '東京都', '秋葉原の店', '2026-11-01')").run();
  assert.equal((await post(watchApi, DB, { endpoint: EP(2), op: "list" })).error, "nosub");
  assert.equal((await post(watchApi, DB, { endpoint: "https://evil.example/x", op: "list" })).error, "bad");
  assert.equal((await post(watchApi, DB, { endpoint: EP(1), op: "add", kind: "kw", shop: "s999", kw: "ちいかわ" })).error, "nostock");
  assert.equal((await post(watchApi, DB, { endpoint: EP(1), op: "add", kind: "kw", shop: "s100", kw: "ち" })).error, "kw");
  assert.equal((await post(watchApi, DB, { endpoint: EP(1), op: "add", kind: "kw", shop: "s100", kw: "見て https://x.example" })).error, "kw");
  assert.equal((await post(watchApi, DB, { endpoint: EP(1), op: "add", kind: "item", shop: "s100", item_id: "../x" })).error, "item");
  r = await post(watchApi, DB, { endpoint: EP(1), op: "add", kind: "kw", shop: "S100", kw: "ちいかわ" });
  assert.equal(r.ok, true);
  r = await post(watchApi, DB, { endpoint: EP(1), op: "add", kind: "kw", shop: "s100", kw: "ちいかわ" }); // 同じものは増えない
  r = await post(watchApi, DB, { endpoint: EP(1), op: "add", kind: "item", shop: "s100", item_id: "item-a", item_name: "ちいかわ めじるしアクセサリー" });
  assert.equal(r.watches.length, 2);
  assert.deepEqual(r.watches[0], { id: r.watches[0].id, kind: "item", shop: "s100", item_id: "item-a", kw: "", shop_name: "秋葉原の店", item_name: "ちいかわ めじるしアクセサリー" });
  // ほかの人の番号では消せない
  await post(subApi, DB, { subscription: { endpoint: EP(2), keys: sub.keys }, favorites: [], lang: "ja" });
  assert.equal((await post(watchApi, DB, { endpoint: EP(2), op: "del", id: r.watches[0].id })).watches.length, 0);
  assert.equal(DB.rows("SELECT count(*) n FROM push_watch")[0].n, 2);
  r = await post(watchApi, DB, { endpoint: EP(1), op: "del", id: r.watches[0].id });
  assert.equal(r.watches.length, 1);
  // 上限
  for (let i = 0; i < 40; i++) r = await post(watchApi, DB, { endpoint: EP(1), op: "add", kind: "kw", shop: "s100", kw: `きーわーど${i}` });
  assert.equal(r.error, "max");
  assert.equal(DB.rows("SELECT count(*) n FROM push_watch WHERE endpoint = ?", EP(1))[0].n, PW.WATCH_MAX);
  // 全部やめる
  await PW.sendQueue(DB, { now: NOON, send: async () => 201 });
  r = await post(subApi, DB, { endpoint: EP(1) }, "DELETE");
  assert.equal(r.ok, true);
  for (const t of ["push_subs", "push_opt", "push_fav", "push_watch", "push_sent", "push_queue"]) assert.equal(DB.rows(`SELECT count(*) n FROM ${t} WHERE endpoint = ?`, EP(1))[0].n, 0, t);
});

test("書き込みは控えめ：動きがない確認では、お知らせ用の読み書きをしない", async () => {
  const DB = newDB();
  await addSub(DB, 1, { fav: ["item-a"], prefs: ["東京都"], opts: { stock: 1 } });
  const before = { ...DB.stats };
  assert.equal((await PW.eventStatements(DB, "item-a", [], NOON.toISOString())).length, 0);
  assert.deepEqual(DB.stats, before);
  assert.deepEqual(await PW.fanOut(DB, { now: NOON, names: NAMES }), { events: 0, queued: 0 });
  assert.equal(await PW.sendQueue(DB, { now: NOON, send: async () => 201 }), 0);
  assert.equal(DB.stats.writes, before.writes);
  assert.equal(DB.stats.reads, before.reads + 2);
});
