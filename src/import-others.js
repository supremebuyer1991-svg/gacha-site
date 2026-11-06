/**
 * ほかのメーカーの新作を取り込む（キタンクラブ・クオリア）
 * どちらも robots.txt で読んでよい範囲だけ。1件ごとに2秒あけ、1回に各20件まで。
 */
const fs = require("fs");
const path = require("path");
const { decode, guessGenre, guessMoods } = require("./import-schedule.js");

const ROOT = path.join(__dirname, "..");
const itemsPath = path.join(ROOT, "data", "items.json");
const UA = "Mozilla/5.0 (compatible; GachaSiteBot/1.0; +" + (process.env.SITE_URL || "https://gachapla.com") + ")";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WAIT_MS = 2000, MAX_NEW = 20;
const strip = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const getText = async (url) => { const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); };
const ym = (d) => d.toISOString().slice(0, 7);

// 「2026年11月上旬」「2026年11月」などから 2026-11 と、そのままの文
const parseRelease = (s) => { const m = String(s || "").match(/(20\d\d)\s*年\s*(\d{1,2})\s*月([^\s]*)/); return m ? { month: `${m[1]}-${String(m[2]).padStart(2, "0")}`, note: `${+m[2]}月${(m[3] || "").replace(/[^上中下旬予定発売頃]/g, "")}`.replace(/月$/, "月") } : null; };

function newItem(o) {
  const it = {
    id: o.id, name: o.name, name_en: "", maker: o.maker, maker_en: o.maker_en, price: o.price, release: o.release, release_note: o.release_note || "",
    genre: "other", moods: [], tags: [], tags_en: [], lineup: o.lineup || null, ...(o.lineup_names && o.lineup_names.length ? { lineup_names: o.lineup_names } : {}),
    image: "", official_url: o.url, store_search_url: "", popularity: 40, added: o.today, description: "", description_en: "", auto: true,
  };
  try { it.genre = guessGenre(it.name); it.moods = guessMoods(it.name); } catch {}
  return it;
}

// ---------- キタンクラブ（https://kitan.jp/products/ 新しい順） ----------
async function kitan(items, ids, today, minMonth) {
  let added = 0;
  for (let page = 1; page <= 4 && added < MAX_NEW; page++) {
    let html;
    try { html = await getText(page === 1 ? "https://kitan.jp/products/" : `https://kitan.jp/products/page/${page}/`); } catch (e) { console.log(`⚠ キタンクラブ一覧 ${page} を読めませんでした（${e.message}）`); break; }
    const links = [...new Set([...html.matchAll(/href="(https:\/\/kitan\.jp\/products\/([a-z0-9_\-]+)\/)"/gi)].map((m) => m[1]))].filter((u) => !/\/(page|feed)\//.test(u));
    let older = 0;
    for (const url of links) {
      const slug = url.match(/products\/([^/]+)\//)[1];
      const id = `kitan-${slug.toLowerCase().replace(/_/g, "-")}`;
      if (ids.has(id)) continue;
      await sleep(WAIT_MS);
      let h; try { h = await getText(url); } catch (e) { console.log(`⚠ キタンクラブ ${slug}（${e.message}）`); continue; }
      const t = strip(h);
      if (/限定BOX|BOX】/.test(t.slice(0, 200)) && !/1回\s*\d+\s*円/.test(t)) continue;
      const name = ((t.match(/商品名\s+(.+?)\s+発売元/) || [])[1] || "").trim();
      const price = Number(((t.match(/価格\s+1回\s*([\d,]+)\s*円/) || [])[1] || "").replace(/,/g, ""));
      const rel = parseRelease((t.match(/発売日\s+(\S+)/) || [])[1]);
      if (!name || !price || !rel) continue; // カプセルトイでない・情報が足りないものは入れない
      if (rel.month < minMonth) { older++; continue; }
      const lineup = Number((t.match(/全\s*(\d+)\s*種/) || [])[1]) || null;
      let names = [];
      const lm = t.match(/ラインナップは\s*「([^」]+)」/);
      if (lm) names = lm[1].split(/\s*[、,]\s*/).map((s) => s.trim()).filter((s) => s && !/シークレット/.test(s));
      const it = newItem({ id, name, maker: "キタンクラブ", maker_en: "Kitan Club", price, release: rel.month, release_note: rel.note, lineup, lineup_names: names, url, today });
      items.push(it); ids.add(id); added++;
      console.log(`✔ 追加（キタンクラブ）：${name}（${rel.month}）`);
      if (added >= MAX_NEW) break;
    }
    if (older >= 5) break;
    await sleep(WAIT_MS);
  }
  return added;
}

// ---------- クオリア（https://www.qualia-45.jp/product/search/ym:YYYY-MM） ----------
async function qualia(items, ids, today, months) {
  let added = 0;
  for (const m of months) {
    if (added >= MAX_NEW) break;
    let html;
    try { html = await getText(`https://www.qualia-45.jp/product/search/ym:${m}?target=product`); } catch (e) { console.log(`⚠ クオリア ${m}（${e.message}）`); continue; }
    const views = [...new Set([...html.matchAll(/href="(https:\/\/www\.qualia-45\.jp\/product\/view\/(\d+))"/g)].map((x) => x[2]))];
    for (const n of views) {
      const id = `qualia-${n}`;
      if (ids.has(id)) continue;
      await sleep(WAIT_MS);
      const url = `https://www.qualia-45.jp/product/view/${n}`;
      let h; try { h = await getText(url); } catch (e) { continue; }
      const t = strip(h);
      const name = ((t.match(/商品名\s+(.+?)\s+発売元/) || [])[1] || "").trim();
      const price = Number(((t.match(/価格\s+([\d,]+)\s*円/) || [])[1] || "").replace(/,/g, ""));
      if (!name || !price || price > 1000) continue;
      const lineup = Number((t.match(/全\s*(\d+)\s*種/) || [])[1]) || null;
      const it = newItem({ id, name, maker: "クオリア", maker_en: "Qualia", price, release: m, release_note: `${+m.slice(5)}月`, lineup, url, today });
      items.push(it); ids.add(id); added++;
      console.log(`✔ 追加（クオリア）：${name}（${m}）`);
      if (added >= MAX_NEW) break;
    }
    await sleep(WAIT_MS);
  }
  return added;
}

async function main() {
  const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  const ids = new Set(items.map((x) => x.id));
  const now = new Date(Date.now() + 9 * 3600e3);
  const today = now.toISOString().slice(0, 10);
  const mk = (off) => ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + off, 1)));
  const minMonth = mk(-2);
  let a = 0, b = 0;
  try { a = await kitan(items, ids, today, minMonth); } catch (e) { console.log(`⚠ キタンクラブの取り込みに失敗（${e.message}）`); }
  try { b = await qualia(items, ids, today, [mk(0), mk(1), mk(-1), mk(2), mk(-2)]); } catch (e) { console.log(`⚠ クオリアの取り込みに失敗（${e.message}）`); }
  if (a || b) fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2) + "\n");
  console.log(`ほかのメーカー：キタンクラブ ${a}件・クオリア ${b}件を追加`);
}
module.exports = main;
module.exports.parseRelease = parseRelease;
if (require.main === module) main();
