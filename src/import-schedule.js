/*
 * バンダイ公式の発売スケジュール（今月・来月）から、まだ登録していない商品を items.json に自動で追加する。
 * 追加する内容：商品名・価格・発売月・全何種・公式ページ。英語名やタグは空のまま（あとでClaudeが足す）。
 * 1ページずつ2秒の間隔をあけ、新しい商品の詳細ページは1回の実行で最大150件まで読む。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const itemsPath = path.join(ROOT, "data", "items.json");
const UA = "Mozilla/5.0 (compatible; GachaSiteBot/1.0; +" + (process.env.SITE_URL || "https://gacha-site.pages.dev") + ")";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WAIT_MS = 2000;
const MAX_NEW_PER_RUN = 150;

const NAMED = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", trade: "™", reg: "®", copy: "©", hellip: "…" };
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m)
  .replace(/\u3000/g, " ");

function guessGenre(name) {
  if (/ミニチュア|ミニカー|1\/\d+|トミカ|食品|模型|ジオラマ/.test(name)) return "miniature";
  if (/昭和|レトロ|ファミコン|懐かし/.test(name)) return "retro";
  if (/ねこ|猫|にゃん|いぬ|犬|わんこ|うさぎ|パンダ|動物|鳥|ペンギン|カエル|生き物|恐竜|アニマル|くま|クマ/.test(name)) return "animal";
  return "anime";
}
function guessMoods(name) {
  const m = [];
  if (/マスコット|ぬいぐるみ|ふわふわ|もふもふ|チャーム|めじるし|ぷっくり|ころりん/.test(name)) m.push("kawaii");
  if (/ミニチュア|リアル|精密|模型|1\/\d+/.test(name)) m.push("real");
  if (/ねむらせ|まちぼうけ|ネタ|おもしろ|ゆる/.test(name)) m.push("funny");
  if (/フィギュア|メタル|HG|ダイキャスト|ロボ/.test(name)) m.push("cool");
  return m;
}

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  const known = new Set(items.map((it) => ((it.official_url || "").match(/jan_code=(\d{13})/) || [])[1]).filter(Boolean));
  const now = new Date(Date.now() + 9 * 3600e3);
  const ym = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const months = [ym(now), ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)))];
  const today = now.toISOString().slice(0, 10);

  const found = [];
  for (const m of months) {
    let html;
    try { html = await getText(`https://gashapon.jp/schedule/?ym=${m}`); } catch (e) { console.log(`⚠ スケジュール ${m} を読めませんでした（${e.message}）`); continue; }
    // 公開されていない月は「未定」だけのページになるので、ページ内の月メニューに含まれているか確かめる
    if (!html.includes(`?ym=${m}"`) && m !== months[0]) { console.log(`- ${m}：まだ公開されていません`); await sleep(WAIT_MS); continue; }
    for (const w of html.split('<div class="week">').slice(1)) {
      const week = ((w.match(/pg-tit__week">([\s\S]*?)<(?:br|small)/) || [])[1] || "").replace(/<[^>]+>/g, "").trim();
      const re = /detail\.php\?jan_code=(\d+)" alt="([^"]*)"[\s\S]*?price--main">([\d,]+)/g;
      let x;
      while ((x = re.exec(w))) found.push({ jan: x[1], name: decode(x[2]).trim(), price: Number(x[3].replace(/,/g, "")), month: `${m.slice(0, 4)}-${m.slice(4)}`, week });
    }
    await sleep(WAIT_MS);
  }

  let added = 0;
  for (const f of found) {
    const jan13 = f.jan.slice(0, 13);
    if (known.has(jan13) || added >= MAX_NEW_PER_RUN) continue;
    known.add(jan13);
    const url = `https://gashapon.jp/products/detail.php?jan_code=${f.jan}`;
    let lineup = null;
    try {
      const d = await getText(url);
      const t = d.replace(/<[^>]+>/g, " ");
      const mm = t.match(/全\s*(\d+)\s*種/);
      if (mm) lineup = Number(mm[1]);
    } catch (e) { console.log(`⚠ ${f.name}: 詳細ページを読めませんでした（${e.message}）`); }
    items.push({
      id: `bandai-${jan13}`, name: f.name, name_en: "", maker: "バンダイ", maker_en: "Bandai",
      price: f.price, release: f.month, release_note: f.week && f.week !== "未定" ? f.week : "",
      genre: guessGenre(f.name), moods: guessMoods(f.name), tags: [], tags_en: [], lineup,
      image: "", official_url: url, store_search_url: `https://gashapon.jp/shop/gplus_list.php?product_code=${jan13}`,
      popularity: 50, added: today, description: "", description_en: "", auto: true,
    });
    added++;
    console.log(`✔ 追加：${f.name}（${f.month} ${f.week}）`);
    await sleep(WAIT_MS);
  }
  if (added) fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2) + "\n");
  console.log(`スケジュール取り込み：公式に${found.length}件、新しく${added}件を追加`);
}
module.exports = main;
if (require.main === module) main();
