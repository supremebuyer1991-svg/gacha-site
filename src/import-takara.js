/*
 * タカラトミーアーツ公式「ガチャ」の発売カレンダーから、今月・来月・先月の商品を取り込む。
 * 商品ページには価格・発売週・ラインナップ名が文字で載っているので、それも入れる。
 * 1件ごとに2秒あけ、1回に MAX_NEW 件まで。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { decode } = require("./import-schedule.js");

const ROOT = path.join(__dirname, "..");
const itemsPath = path.join(ROOT, "data", "items.json");
const BASE = "https://www.takaratomy-arts.co.jp";
const UA = "Mozilla/5.0 (compatible; GachaSiteBot/1.0; +" + (process.env.SITE_URL || "https://gachapla.com") + ")";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WAIT_MS = 2000;
const MAX_NEW = 80;
const norm = (s) => String(s || "").normalize("NFKC").replace(/[\s　・!！?？'’"“”:：\-‐–—~〜～、。,.\/／|｜【】\[\]「」『』()（）™®]/g, "").toLowerCase();
const strip = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// 商品ページから 価格・発売週・ラインナップ名 を読む
function parseItem(html) {
  const t = strip(html);
  const price = Number(((t.match(/価格\s*[:：]\s*([\d,]+)\s*円/) || [])[1] || "").replace(/,/g, "")) || null;
  const week = ((t.match(/発売時期\s*[:：]\s*[^（(]*[（(]([^）)]+)[）)]/) || [])[1] || "").trim();
  let names = [];
  const lm = t.match(/ラインナップは\s*(.+?)の全\s*(\d+)\s*種/);
  if (lm) names = [...lm[1].matchAll(/「([^」]+)」/g)].map((m) => m[1].trim()).filter(Boolean);
  const total = Number((t.match(/全\s*(\d+)\s*種/) || [])[1]) || (names.length || null);
  const jan = ((t.match(/JAN[^\d]{0,10}(4\d{12})/) || t.match(/\b(4904790\d{6})\b/) || [])[1]) || "";
  return { price, week, names: [...new Set(names)], total, jan };
}

async function main() {
  const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  const now = new Date(Date.now() + 9 * 3600e3);
  const ym = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const mk = (off) => ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + off, 1)));
  // 今月・来月・先月に加えて、2〜3か月先も（載っていなければ飛ばす）
  const months = [mk(0), mk(1), mk(-1), mk(2), mk(3), mk(-2), mk(-3), mk(-4)];
  const farAhead = new Set([mk(2), mk(3)]);
  let stopAhead = false;
  const today = now.toISOString().slice(0, 10);
  const byCode = new Map(items.filter((x) => x.maker === "タカラトミーアーツ").map((x) => [String(x.official_url || "").match(/n=(Y\d+)/)?.[1], x]).filter(([k]) => k));
  const byName = new Map(items.filter((x) => x.maker === "タカラトミーアーツ").map((x) => [norm(x.name), x]));
  const found = [];
  for (const m of months) {
    if (stopAhead && farAhead.has(m)) continue;
    let html;
    try { html = await getText(`${BASE}/items/gacha/calendar/?ym=${m}`); } catch (e) { console.log(`⚠ タカラトミーアーツ ${m} を読めませんでした（${e.message}）`); continue; }
    const groups = html.split('<div class="group').slice(1);
    // 先の月は、その月の見出し（「2月9日週発売」など）があるときだけ使う（別の月が表示されていたら取り込まない）
    if (farAhead.has(m) && !groups.some((g) => strip((g.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || "").includes(`${Number(m.slice(4))}月`))) {
      console.log(`- タカラトミーアーツ ${m}：まだ公開されていません`); stopAhead = true; await sleep(WAIT_MS); continue;
    }
    for (const g of groups) {
      const wk = strip((g.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || "").replace(/\s/g, "");
      const re = /item\.html\?n=(Y\d+)"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
      let x;
      while ((x = re.exec(g))) found.push({ code: x[1], name: strip(x[2]).trim(), month: `${m.slice(0, 4)}-${m.slice(4)}`, week: wk });
    }
    await sleep(WAIT_MS);
  }
  let added = 0, fixed = 0, janTried = 0;
  for (const f of found) {
    const old = byCode.get(f.code) || byName.get(norm(f.name));
    // JANコードをまだ確かめていない商品は、1回に40件まで読み直す
    const needJan = old && !old.jan && !old.jan_checked;
    if (old && old.official_url && old.lineup_names && !needJan) continue;
    if (old && old.official_url && old.lineup_names && needJan && janTried >= 40) continue;
    if (needJan) janTried++;
    if (!old && added >= MAX_NEW) continue;
    const url = `${BASE}/items/item.html?n=${f.code}`;
    let d;
    try { d = parseItem(await getText(url)); } catch (e) { console.log(`⚠ ${f.name}: 商品ページを読めませんでした（${e.message}）`); await sleep(WAIT_MS); continue; }
    if (old) {
      old.official_url = old.official_url || url;
      if (d.names.length) old.lineup_names = d.names;
      if (!old.lineup && d.total) old.lineup = d.total;
      if (d.week && !old.release_note) old.release_note = d.week;
      if (d.jan) old.jan = d.jan; else old.jan_checked = true;
      byCode.set(f.code, old);
      fixed++;
    } else {
      if (!d.price) { console.log(`- ${f.name}: 価格が読めないので飛ばします`); await sleep(WAIT_MS); continue; }
      const it = {
        id: `tarts-${f.code.toLowerCase()}`, name: f.name, name_en: "", maker: "タカラトミーアーツ", maker_en: "Takara Tomy A.R.T.S",
        price: d.price, release: f.month, release_note: d.week || f.week || "", genre: "other", moods: [], tags: [], tags_en: [], lineup: d.total,
        ...(d.names.length ? { lineup_names: d.names } : {}),
        ...(d.jan ? { jan: d.jan } : { jan_checked: true }),
        image: "", official_url: url, store_search_url: "", popularity: 50, added: today, description: "", description_en: "", auto: true,
      };
      try { const s = require("./import-schedule.js"); if (s.guessGenre) { it.genre = s.guessGenre(it.name); it.moods = s.guessMoods(it.name); } } catch {}
      items.push(it);
      byCode.set(f.code, it);
      added++;
      console.log(`✔ 追加（タカラトミーアーツ）：${f.name}（${f.month} ${d.week || ""}）`);
    }
    await sleep(WAIT_MS);
  }
  if (added || fixed) fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2) + "\n");
  console.log(`タカラトミーアーツ：追加 ${added}件、更新 ${fixed}件`);
}
module.exports = main;
module.exports.parseItem = parseItem;
if (require.main === module) main();
