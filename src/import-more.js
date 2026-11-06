/**
 * さらにほかのメーカーの新作を取り込む
 *   - ブシロードクリエイティブ（ブシカプ！ https://capsule.bushiroad-creative.com/product/?pagenum=N）
 *   - SO-TA（スタジオソータ https://www.so-ta.com/products/capsuletoy/page/N/）
 *   - ケンエレファント（KENELE STORE https://kenelestore.jp/collections/miniature__latest など）
 *   - トイズキャビン（https://toyscabin.com/product/ の一覧1ページだけで、名前・価格・発売月・JANが分かる）
 *
 * 決まりごと
 *   - robots.txt で禁止されているページは読まない
 *   - 1回読むごとに WAIT_MS あける（1秒に1回より少なく）。一覧は1メーカー MAX_PAGES ページまで、追加は MAX_NEW 件まで
 *   - 発売月が「4か月前」より古いものは入れない（タカラトミーアーツの取り込みと同じ範囲）
 *   - 1つのメーカーで失敗しても、ほかのメーカーとデプロイは止めない
 *   - 画像はここでは取らない（fetch-assets.js が site.json の image_allowed_makers のメーカーだけ取る）
 *
 * ネットにつながずに読み取りを確かめる：node src/import-more.js --selftest
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { decode, guessGenre, guessMoods } = require("./import-schedule.js");

const ROOT = path.join(__dirname, "..");
const itemsPath = path.join(ROOT, "data", "items.json");
const skipPath = path.join(ROOT, "data", "import-skip.json");
const UA = "Mozilla/5.0 (compatible; GachaSiteBot/1.0; +" + (process.env.SITE_URL || "https://gachapla.com") + ")";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WAIT_MS = 1500, MAX_NEW = 20, MAX_PAGES = 5;

const strip = (h) => decode(String(h || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/[\s　]+/g, " ").trim();
const nfkcNum = (s) => Number(String(s || "").normalize("NFKC").replace(/[,，]/g, "")) || null;
const norm = (s) => String(s || "").normalize("NFKC").replace(/[\s　・!！?？'’"“”:：\-‐–—~〜～、。,.\/／|｜【】\[\]「」『』()（）™®]/g, "").toLowerCase();
const pad = (n) => String(n).padStart(2, "0");
const titleOf = (html) => strip((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
const ogTitle = (html) => decode(((String(html).match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || String(html).match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i) || [])[1] || "")).trim();

// 「2027年3月下旬発売予定」→ { month: "2027-03", note: "3月下旬" }
function relFrom(text) {
  const m = String(text || "").normalize("NFKC").match(/(20\d\d)\s*年\s*(\d{1,2})\s*月\s*(上旬|中旬|下旬)?/);
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return { month: `${m[1]}-${pad(m[2])}`, note: `${+m[2]}月${m[3] || ""}` };
}

// ---------- robots.txt（User-agent: * の Disallow だけを見る簡単なもの） ----------
const robotsCache = new Map();
function parseRobots(txt) {
  const rules = [];
  let mine = false, lastWasUa = false;
  for (const raw of String(txt || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!lastWasUa) mine = false; if (v === "*" || /gachasitebot/i.test(v)) mine = true; lastWasUa = true; continue; }
    lastWasUa = false;
    if (mine && (k === "disallow" || k === "allow") && v) rules.push({ allow: k === "allow", path: v });
  }
  return rules;
}
function robotsAllows(rules, urlPath) {
  let best = null;
  for (const r of rules) {
    const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(urlPath) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
async function allowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let rules = [];
    try {
      const r = await fetch(u.origin + "/robots.txt", { headers: { "User-Agent": UA } });
      if (r.ok) rules = parseRobots(await r.text());
    } catch {}
    robotsCache.set(u.origin, rules);
    await sleep(WAIT_MS);
  }
  return robotsAllows(robotsCache.get(u.origin), u.pathname + u.search);
}
async function getText(url) {
  if (!(await allowed(url))) throw new Error("robots.txt で読まないよう指定されています");
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function newItem(o) {
  const it = {
    id: o.id, name: o.name, name_en: "", maker: o.maker, maker_en: o.maker_en, price: o.price, release: o.release, release_note: o.release_note || "",
    genre: "other", moods: [], tags: [], tags_en: [], lineup: o.lineup || null, ...(o.lineup_names && o.lineup_names.length ? { lineup_names: o.lineup_names } : {}),
    ...(o.jan ? { jan: o.jan } : {}),
    image: "", official_url: o.url, store_search_url: "", popularity: 40, added: o.today, description: "", description_en: "", auto: true,
  };
  try { it.genre = guessGenre(it.name); it.moods = guessMoods(it.name); } catch {}
  return it;
}

// ================= 読み取り（ネットなしで確かめられるよう、HTMLを受け取るだけの関数） =================

// ブシカプ！一覧：商品番号の並び
const parseBushiList = (html) => [...new Set([...String(html).matchAll(/href=["'](?:https:\/\/capsule\.bushiroad-creative\.com)?\/product\/(\d+)\/?["']/g)].map((m) => m[1]))];
// ブシカプ！商品ページ：「JANコード 4570… 発売日 2027年3月下旬発売予定 価格 400円 (税込) 種類 全6種」
function parseBushiDetail(html) {
  const t = strip(html);
  const name = (titleOf(html).split(/[｜|]/)[0] || "").trim();
  const rel = relFrom((t.match(/発売(?:日|時期|予定日?)\s*[:：]?\s*(20\d\d\s*年\s*\d{1,2}\s*月[^\s]*)/) || [])[1]);
  const price = nfkcNum((t.match(/価格\s*[:：]?\s*([\d,，０-９]+)\s*円/) || [])[1]);
  const lineup = nfkcNum((t.match(/全\s*([\d０-９]+)\s*種/) || [])[1]);
  const jan = ((t.match(/JAN(?:コード)?\s*[:：]?\s*(4\d{12})/) || [])[1]) || "";
  return { name, price, rel, lineup, jan };
}

// SO-TA 一覧：/products_detail/capsuletoy/<slug>/
const parseSotaList = (html) => [...new Set([...String(html).matchAll(/href=["'](?:https:\/\/www\.so-ta\.com)?\/products_detail\/capsuletoy\/([A-Za-z0-9_\-]+)\/?["']/g)].map((m) => m[1]))];
// SO-TA 商品ページ：「発売予定月 2026年10月 種類 5種類 価格 500円」
function parseSotaDetail(html) {
  const t = strip(html);
  const name = ((ogTitle(html) || titleOf(html)).split(/\s+-\s+スタジオソータ/)[0] || "").trim();
  const rel = relFrom((t.match(/発売(?:予定)?(?:月|日|時期)\s*[:：]?\s*(20\d\d\s*年\s*\d{1,2}\s*月\S*)/) || [])[1]);
  const price = nfkcNum((t.match(/価格\s*[:：]?\s*([\d,，０-９]+)\s*円/) || [])[1]);
  const lineup = nfkcNum((t.match(/種類\s*[:：]?\s*全?\s*([\d０-９]+)\s*種/) || t.match(/全\s*([\d０-９]+)\s*種/) || [])[1]);
  return { name, price, rel, lineup };
}

// KENELE STORE 一覧：/products/gc0857z（ガチャ＝gc で始まる商品だけ）
const parseKeneleList = (html) => [...new Set([...String(html).matchAll(/href=["'](?:https:\/\/kenelestore\.jp)?(?:\/collections\/[^/"']+)?\/products\/(gc[0-9a-z]+)(?:[?"'])/gi)].map((m) => m[1].toLowerCase()))];
// KENELE STORE 商品ページ：「カプセル価格 : ¥500 JPY」「全5種」「こちらの商品は2027年2月頃発送予定」
function parseKeneleDetail(html) {
  const t = strip(html);
  const name = (ogTitle(html) || titleOf(html).split(/\s+[–—\-|｜]\s+KENELE/i)[0] || "").trim();
  let price = nfkcNum((t.match(/カプセル価格\s*[:：]?\s*[¥￥]\s*([\d,]+)/) || [])[1]);
  if (!price) { // 「¥1,600 4個パック(カプセル)」だけのときは1個の値段にする
    const p = t.match(/[¥￥]\s*([\d,]+)\s*[（(]?\s*(\d+)\s*個パック\s*[（(]\s*カプセル/);
    if (p) price = Math.round(nfkcNum(p[1]) / Number(p[2]));
  }
  const rm = t.match(/(20\d\d\s*年\s*\d{1,2}\s*月\s*(?:上旬|中旬|下旬)?)\s*(?:頃|中)?\s*(?:に)?\s*(?:発売|発送)/);
  const rel = rm ? relFrom(rm[1]) : null;
  const lineup = nfkcNum((t.match(/全\s*([\d０-９]+)\s*種/) || [])[1]);
  const names = [...new Set([...t.matchAll(/No\.\s*\d+\s*[:：]\s*([^（(\s][^（(]*?)(?=\s*(?:[（(]|No\.\s*\d|$|\s(?:サイズ|素材|※)))/g)].map((m) => m[1].trim()).filter((s) => s && s.length <= 40 && !/シークレット/.test(s)))];
  return { name, price, rel, lineup, names };
}

// トイズキャビン一覧：<a href="…/product/20261006_1503.php">【再販】踏切コレクション2　500円 2027年1月 JAN CODE:4589…</a>
function parseToyscabinList(html) {
  const out = [], seen = new Set();
  for (const m of String(html).matchAll(/<a[^>]+href=["'](?:https:\/\/toyscabin\.com)?\/product\/(\d{8}_\d+)\.php["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const code = m[1];
    const text = strip(m[2]).normalize("NFKC");
    const pm = text.match(/^(.+?)\s*[:：]?\s*(\d{3,4})円/);
    if (!pm || seen.has(code)) continue;
    const name = pm[1].replace(/[\s:：]+$/, "").trim();
    const after = text.slice(pm.index + pm[0].length);
    const base = after.match(/(20\d\d)年(\d{1,2})月(上旬|中旬|下旬)?/);
    if (!base) continue;
    let y = +base[1], mo = +base[2], part = base[3] || "";
    const d = after.match(/→\s*(?:(20\d\d)年)?\s*(\d{1,2})月(上旬|中旬|下旬)?/); // 「2025年12月→1月に遅延」
    if (d) { const nm = +d[2]; y = d[1] ? +d[1] : nm < mo ? y + 1 : y; mo = nm; part = d[3] || ""; }
    if (mo < 1 || mo > 12) continue;
    const jan = (after.match(/JAN\s*CODE\s*[:：]?\s*(4\d{12})/i) || [])[1] || "";
    seen.add(code);
    out.push({ code, name, price: Number(pm[2]), month: `${y}-${pad(mo)}`, note: `${mo}月${part}`, delayed: !!d, jan, truncated: /(\.\.\.|…)$/.test(name), limited: /限定品|先行販売/.test(text) });
  }
  return out;
}
// トイズキャビン商品ページ（名前が一覧で切れているときだけ読む）：「Project：うごく!! 牛乳坊や おすわりフィギュア　400円」
const parseToyscabinDetailName = (html) => ((strip(html).normalize("NFKC").match(/Project\s*[:：]\s*(.+?)\s*[:：]?\s*\d{3,4}円/) || [])[1] || "").trim();

// ================= 取り込み =================

// 一覧→商品ページの順に読む共通の流れ（ブシカプ！・SO-TA・ケンエレ）
async function crawl(ctx, o) {
  let added = 0, read = 0;
  for (let page = 1; page <= MAX_PAGES && added < MAX_NEW; page++) {
    const listUrl = o.listUrl(page);
    if (!listUrl) break;
    let html;
    try { html = await getText(listUrl); } catch (e) { console.log(`⚠ ${o.maker}一覧 ${page} を読めませんでした（${e.message}）`); break; }
    await sleep(WAIT_MS);
    const keys = o.parseList(html);
    if (!keys.length) break;
    let older = 0, fresh = 0;
    for (const k of keys) {
      const id = o.idOf(k);
      if (ctx.ids.has(id) || ctx.skipped(id)) continue;
      if (read >= o.maxDetail) break;
      fresh++;
      const url = o.detailUrl(k);
      let d;
      try { d = o.parseDetail(await getText(url)); } catch (e) { console.log(`⚠ ${o.maker} ${k}（${e.message}）`); await sleep(WAIT_MS); continue; }
      read++;
      await sleep(WAIT_MS);
      if (!d.name || !d.price || !d.rel || d.price > 1000) { ctx.skip(id, ctx.today); continue; } // カプセルトイでない・情報が足りないもの（30日後にもう一度見る）
      if (d.rel.month < ctx.minMonth) { older++; ctx.skip(id, "old"); continue; }
      if (ctx.names.has(o.maker + "|" + norm(d.name))) continue;
      const it = newItem({ id, name: d.name, maker: o.maker, maker_en: o.maker_en, price: d.price, release: d.rel.month, release_note: d.rel.note, lineup: d.lineup, lineup_names: d.names, jan: d.jan, url, today: ctx.today });
      ctx.items.push(it); ctx.ids.add(id); ctx.names.add(o.maker + "|" + norm(d.name)); added++;
      console.log(`✔ 追加（${o.maker}）：${d.name}（${d.rel.month}）`);
      if (added >= MAX_NEW) break;
    }
    if (read >= o.maxDetail) break;
    if (fresh && older >= Math.max(3, Math.ceil(fresh * 0.6))) break; // このページはほとんど古い商品だった
  }
  return added;
}

const bushiroad = (ctx) => crawl(ctx, {
  maker: "ブシロードクリエイティブ", maker_en: "Bushiroad Creative", maxDetail: 30,
  listUrl: (p) => p === 1 ? "https://capsule.bushiroad-creative.com/product/" : `https://capsule.bushiroad-creative.com/product/?pagenum=${p}`,
  parseList: parseBushiList, idOf: (n) => `bushicap-${n}`, detailUrl: (n) => `https://capsule.bushiroad-creative.com/product/${n}/`, parseDetail: parseBushiDetail,
});
const sota = (ctx) => crawl(ctx, {
  maker: "SO-TA", maker_en: "SO-TA", maxDetail: 30,
  listUrl: (p) => p === 1 ? "https://www.so-ta.com/products/capsuletoy/" : `https://www.so-ta.com/products/capsuletoy/page/${p}/`,
  parseList: parseSotaList, idOf: (s) => `sota-${s.toLowerCase().replace(/_/g, "-")}`, detailUrl: (s) => `https://www.so-ta.com/products_detail/capsuletoy/${s}/`, parseDetail: parseSotaDetail,
});
// ケンエレ：まず予約受付中の新商品（発送予定月が書いてある）、つぎに全体の一覧の1〜2ページ
const KENELE_LISTS = ["https://kenelestore.jp/collections/miniature__latest", "https://kenelestore.jp/collections/miniature"];
const kenele = (ctx) => crawl(ctx, {
  maker: "ケンエレファント", maker_en: "Kenelephant", maxDetail: 20,
  listUrl: (p) => KENELE_LISTS[p - 1], parseList: parseKeneleList, idOf: (h) => `kenele-${h}`, detailUrl: (h) => `https://kenelestore.jp/products/${h}`, parseDetail: parseKeneleDetail,
});

async function toyscabin(ctx) {
  let html;
  try { html = await getText("https://toyscabin.com/product/"); } catch (e) { console.log(`⚠ トイズキャビン一覧を読めませんでした（${e.message}）`); return 0; }
  await sleep(WAIT_MS);
  let added = 0, detailRead = 0;
  for (const f of parseToyscabinList(html)) {
    if (added >= MAX_NEW) break;
    const id = `toyscabin-${f.code.replace(/_/g, "-")}`;
    if (ctx.ids.has(id) || f.limited || f.price > 1000 || f.month < ctx.minMonth) continue;
    const url = `https://toyscabin.com/product/${f.code}.php`;
    let name = f.name;
    if (f.truncated) {
      if (detailRead >= 5) continue;
      detailRead++;
      try { name = parseToyscabinDetailName(await getText(url)) || ""; } catch { name = ""; }
      await sleep(WAIT_MS);
      if (!name) continue;
    }
    if (ctx.names.has("トイズキャビン|" + norm(name))) continue;
    const it = newItem({ id, name, maker: "トイズキャビン", maker_en: "Toys Cabin", price: f.price, release: f.month, release_note: f.note, jan: f.jan, url, today: ctx.today });
    ctx.items.push(it); ctx.ids.add(id); ctx.names.add("トイズキャビン|" + norm(name)); added++;
    console.log(`✔ 追加（トイズキャビン）：${name}（${f.month}）`);
  }
  return added;
}

const MAKERS = [["トイズキャビン", toyscabin], ["ブシロードクリエイティブ", bushiroad], ["SO-TA", sota], ["ケンエレファント", kenele]];

async function main() {
  const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  const now = new Date(Date.now() + 9 * 3600e3);
  const ym = (d) => d.toISOString().slice(0, 7);
  // 読んだけれど入れなかった商品（古い・カプセルトイでない）を覚えておき、毎回読み直さない
  let skip = {};
  try { skip = JSON.parse(fs.readFileSync(skipPath, "utf8")); } catch {}
  const ctx = {
    skipped: (id) => skip[id] === "old" || (skip[id] && (Date.parse(now.toISOString().slice(0, 10)) - Date.parse(skip[id])) / 864e5 < 30),
    skip: (id, v) => { skip[id] = v; },
    items, ids: new Set(items.map((x) => x.id)), names: new Set(items.map((x) => x.maker + "|" + norm(x.name))),
    today: now.toISOString().slice(0, 10), minMonth: ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, 1))),
  };
  const before = items.length, counts = [];
  for (const [label, fn] of MAKERS) {
    let n = 0;
    try { n = await fn(ctx); } catch (e) { console.log(`⚠ ${label}の取り込みに失敗しました（${e.message}）。ほかのメーカーは続けます`); }
    counts.push(`${label} ${n}件`);
  }
  if (items.length > before) fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2) + "\n");
  const keys = Object.keys(skip);
  for (const k of keys.slice(0, Math.max(0, keys.length - 3000))) delete skip[k]; // 大きくなりすぎないように古い順に消す
  try { fs.writeFileSync(skipPath, JSON.stringify(skip, null, 1) + "\n"); } catch {}
  console.log(`さらにほかのメーカー：${counts.join("・")}を追加`);
}

// ================= ネットなしの確認 =================
function selftest() {
  const assert = require("assert");
  const fx = (f) => fs.readFileSync(path.join(ROOT, "test", "fixtures", "makers", f), "utf8");
  const ok = (label) => console.log(`✔ ${label}`);

  assert.deepStrictEqual(relFrom("2027年3月下旬発売予定"), { month: "2027-03", note: "3月下旬" });
  assert.deepStrictEqual(relFrom("２０２６年１１月"), { month: "2026-11", note: "11月" });
  assert.strictEqual(relFrom("近日発売"), null);
  ok("発売月の読み取り");

  const rules = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nDisallow: /*?s=\n");
  assert.strictEqual(robotsAllows(rules, "/product/?pagenum=2"), true);
  assert.strictEqual(robotsAllows(rules, "/wp-admin/x"), false);
  assert.strictEqual(robotsAllows(rules, "/wp-admin/admin-ajax.php"), true);
  assert.strictEqual(robotsAllows(rules, "/?s=abc"), false);
  assert.strictEqual(robotsAllows(parseRobots(""), "/anything"), true);
  ok("robots.txt");

  assert.deepStrictEqual(parseBushiList(fx("bushiroad-list.html")).slice(0, 3), ["10165", "10051", "10041"]);
  const b = parseBushiDetail(fx("bushiroad-detail.html"));
  assert.strictEqual(b.name, "勝利の女神：NIKKE カプセルラバーストラップ vol.4"); // 全角スペースは半角1つにまとまる（キタンクラブと同じ）
  assert.deepStrictEqual([b.price, b.rel.month, b.rel.note, b.lineup, b.jan], [400, "2027-03", "3月下旬", 6, "4570194501837"]);
  const b2 = parseBushiDetail(fx("bushiroad-detail-old.html"));
  assert.deepStrictEqual([b2.name, b2.price, b2.rel.month, b2.lineup], ["罠", 200, "2020-12", 5]);
  ok("ブシロードクリエイティブ");

  const sl = parseSotaList(fx("sota-list.html"));
  assert.deepStrictEqual(sl.slice(0, 3), ["form_series_cat_void", "lioncoffee_onepoint", "fma_metal"]);
  assert.ok(!sl.includes("fma_metal-2"), "BOX TOY の商品は入れない");
  const s = parseSotaDetail(fx("sota-detail.html"));
  assert.deepStrictEqual([s.name, s.price, s.rel.month, s.lineup], ["鋼の錬金術師 FULLMETAL ALCHEMIST メタルチャームコレクション", 500, "2026-10", 5]);
  ok("SO-TA");

  const kl = parseKeneleList(fx("kenele-list.html"));
  assert.deepStrictEqual(kl, ["gc0857z", "gc0856z", "gc0843", "gc0799c"]);
  const k = parseKeneleDetail(fx("kenele-detail.html"));
  assert.deepStrictEqual([k.name, k.price, k.rel.month, k.rel.note, k.lineup], ["ギチギチ マスコット", 500, "2026-11", "11月", 4]);
  assert.deepStrictEqual(k.names, ["パウチ詰め", "缶詰め", "袋詰め", "ネット通販の箱詰め"]);
  const k2 = parseKeneleDetail(fx("kenele-detail-capsulepack.html"));
  assert.deepStrictEqual([k2.name, k2.price, k2.rel && k2.rel.month, k2.lineup], ["鉄道ヘッドマーク サークルポーチ", 400, null, 4]);
  ok("ケンエレファント");

  const tc = parseToyscabinList(fx("toyscabin-list.html"));
  const byCode = Object.fromEntries(tc.map((x) => [x.code, x]));
  assert.strictEqual(tc.filter((x) => x.code === "20261006_1503").length, 1, "同じ商品は1回だけ");
  assert.deepStrictEqual([byCode["20261006_1503"].name, byCode["20261006_1503"].price, byCode["20261006_1503"].month, byCode["20261006_1503"].jan], ["【再販】踏切コレクション2", 500, "2027-01", "4589415440695"]);
  assert.deepStrictEqual([byCode["20250902_1275"].month, byCode["20250902_1275"].delayed], ["2026-01", true]);
  assert.deepStrictEqual([byCode["20241109_764"].month, byCode["20241109_764"].note], ["2025-03", "3月上旬"]);
  assert.strictEqual(byCode["20210827_378"].month, "2022-01");
  assert.strictEqual(byCode["20210827_378"].name, "日産・スカイラインGT-Rメタルキーホルダーコレクション");
  assert.strictEqual(byCode["20260420_1412"].limited, true);
  assert.ok(!byCode["20240801_741"], "年の書き間違い（20204年）は入れない");
  assert.ok(!byCode["20260203_1377"], "価格がないものは入れない");
  assert.strictEqual(byCode["20200402_54"].name, "フォルクスワーゲンType2 ダイキャストプルバックミニカー");
  assert.strictEqual(parseToyscabinDetailName(fx("toyscabin-detail.html")), "うごく!! 牛乳坊や おすわりフィギュア");
  ok("トイズキャビン");
  console.log("selftest OK");
}

module.exports = main;
Object.assign(module.exports, { parseBushiList, parseBushiDetail, parseSotaList, parseSotaDetail, parseKeneleList, parseKeneleDetail, parseToyscabinList, parseToyscabinDetailName, parseRobots, robotsAllows, relFrom, selftest });
if (require.main === module) {
  if (process.argv.includes("--selftest")) { try { selftest(); } catch (e) { console.error("selftest NG:", e.message); process.exit(1); } }
  else main();
}
