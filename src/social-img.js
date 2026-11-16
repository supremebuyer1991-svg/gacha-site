#!/usr/bin/env node
// SNS（X・Threads・Instagram・Pinterest）用の画像を作る：dist/images/social/商品id.jpg（1200×1200、JPEG。写真のカードを大きく、下に商品名・値段・種類、サイト名は小さく）
// 見た目の部品（配色・写真のカード・チップ・文字）は src/sns-style.js。SNS_STYLE=B で B案（ダーク）
// Threads と Instagram は JPEG/PNG しか受け付けないので、商品の webp 写真から作る。
// 対象は 先月以降に発売の商品（最大400件）。sharp が必要（デプロイのときに入れる）。
// 画像を作ったあと、Pinterest・Bluesky の自動投稿用 RSS も書く：pinterest.xml（日本語）・pinterest-en.xml・pinterest-ko.xml・pinterest-zh-tw.xml・pinterest-zh-cn.xml
"use strict";
const fs = require("fs"), path = require("path");
let sharp, S; try { sharp = require("sharp"); S = require("./sns-style"); } catch (e) { console.log("sharp がないので SNS 用の画像は作りません"); process.exit(0); }
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "dist", "images", "social");
const esc0 = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const items = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "items.json"), "utf8"));
const now = new Date(Date.now() + 9 * 3600e3), from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
const W = 1200, H = 1200, M = 36;
// ためすとき：ONLY=商品id,商品id（その商品だけ） / LIMIT=20（20件だけ） / SNS_STYLE=B（B案＝ダーク）
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean), LIMIT = Number(process.env.LIMIT) || 0;
// 商品1つの画像（1200×1200）：写真のカードを大きく、下に「新作ガチャ｜発売時期｜メーカー」・商品名（2行まで）・値段と種類のチップ・サイト名（小さく）
async function itemImage(it, out) {
  const p = await S.loadPhoto(it.id), pal = S.palette(p.hue);
  const name = S.HAS_JP ? S.cleanName(it.name) : "";
  const cl = S.itemChips(it), ch = S.chips(cl, pal, 32, 60);
  const ft = name ? S.fitText(name, W - M * 2 - 8 - (cl.length ? ch.w + 32 : 0), [54, 50, 46, 42], [42, 38, 35, 32, 30]) : { size: 0, lines: [] };
  const lh = Math.round(ft.size * 1.3), blockH = Math.max(ft.lines.length * lh, cl.length ? ch.h : 0, 8);
  const nameTop = H - 34 - blockH, labelBase = nameTop - 18, boxY = 30, boxH = labelBase - 28 - 26 - boxY;
  const card = await S.photoCard(p, W - 60, boxH, 40), cx = Math.round((W - card.w) / 2), cy = boxY + Math.round((boxH - card.h) / 2);
  const bsz = 20, bw = S.units("GACHA PLANET") * bsz * 1.16 + S.units("gachapla.com") * bsz + bsz * 3;
  const parts = S.HAS_JP ? [(it.release || "") >= from ? "新作ガチャ" : "ガチャガチャ", S.relLabel(it), it.maker] : ["GACHAPON"];
  let label = parts.filter(Boolean).join("｜");
  if (S.units(label) * 25 > W - M * 2 - bw - 40) label = parts.slice(0, 2).filter(Boolean).join("｜");
  const y0 = nameTop + (blockH - ft.lines.length * lh) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${S.bgSvg(W, H, pal, 0.5, 0.42)}
${S.text(label, M + 4, labelBase, 24, pal.accent, { ls: 1 })}
${S.brand(W - M - 2, labelBase, bsz, pal, "end")}
${ft.lines.map((l, i) => S.text(l, M + 2, y0 + i * lh + lh / 2 + ft.size * 0.36, ft.size, pal.ink)).join("\n")}
${cl.length ? ch.make(W - M, Math.round(nameTop + (blockH - ch.h) / 2), "end") : ""}
</svg>`;
  await sharp(Buffer.from(svg)).composite([await S.shadowLayer(W, H, [{ x: cx, y: cy, w: card.w, h: card.h }], pal, 40), { ...card.layer, left: cx, top: cy }]).jpeg({ quality: 85 }).toFile(out);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // X・SNSで使う商品（x.json のまとめ・注目・今週・来週）は発売月が古くても必ず作る
  const want = new Set();
  try { const x = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "data", "x.json"), "utf8")); for (const k of ["morning", "week", "next_week", "new_info"]) for (const it of (x[k] && x[k].items) || []) want.add(it.id); for (const it of x.picks || []) want.add(it.id); } catch (e) {}
  const has = (it) => fs.existsSync(path.join(ROOT, "images", `${it.id}.webp`));
  let list = [...items.filter((it) => want.has(it.id) && has(it)),
    ...items.filter((it) => !want.has(it.id) && (it.release || "") >= from && has(it)).sort((a, b) => (b.release || "").localeCompare(a.release || "")).slice(0, 300)];
  if (ONLY.length) list = items.filter((it) => ONLY.includes(it.id) && has(it));
  if (LIMIT) list = list.slice(0, LIMIT);
  let n = 0;
  for (const it of list) {
    try { await itemImage(it, path.join(OUT, `${it.id}.jpg`)); n++; } catch (e) { console.log(`⚠ ${it.id}: ${e.message}`); }
  }
  console.log(`SNS用の画像：${n}件`);
  // 商品ページの共有画像（og:image）：webp は LINE などで出ないことがあるので、JPEG を作れた商品は差し替える
  let ogn = 0;
  for (const dir of ["", "en/", "ko/", "zh-cn/", "zh-tw/"]) {
    const d = path.join(ROOT, "dist", dir, "item");
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith(".html")) continue;
      const id = f.slice(0, -5);
      if (!fs.existsSync(path.join(OUT, `${id}.jpg`))) continue;
      const fp = path.join(d, f), h = fs.readFileSync(fp, "utf8");
      const h2 = h.replace(new RegExp(`(<meta (?:property="og:image"|name="twitter:image") content="https://gachapla\\.com/images/)${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.webp"`, "g"), `$1social/${id}.jpg"`);
      if (h2 !== h) { fs.writeFileSync(fp, h2); ogn++; }
    }
  }
  console.log(`共有画像を JPEG に差し替え：${ogn}ページ`);
  // ===== 今週の新作の縦長ピン（1000×1500）：見出し＋商品写真を大きく2×2。見出しの文字は Noto Sans CJK で描く（デプロイで入れる。ないときは英語の見出しにする） =====
  const PW = 1000, PH = 1500, GAP = 22, TOP = 232, BOT = 92, SIDE = 36;
  const CW = Math.floor((PW - SIDE * 2 - GAP) / 2), CH = Math.floor((PH - TOP - BOT - GAP) / 2);
  const PIN_T = { ja: "今週の新作ガチャ", en: "New Gachapon This Week", ko: "이번 주 신작 가챠", "zh-tw": "本週新款扭蛋", "zh-cn": "本周新款扭蛋" };
  const weekPin = async (lang, ids, range, key) => {
    const pics = ids.filter((id) => fs.existsSync(path.join(ROOT, "images", `${id}.webp`))).slice(0, 4);
    if (pics.length < 4) return null;
    const pal = S.palette(null), title = S.HAS_JP ? PIN_T[lang] : PIN_T.en, tsz = Math.min(92, Math.floor((PW - SIDE * 2 - 8) / S.units(title)));
    const ch = S.chips([range], pal, 28, 52), layers = [], rects = [];
    for (let i = 0; i < 4; i++) {
      const x = SIDE + (i % 2) * (CW + GAP), y = TOP + Math.floor(i / 2) * (CH + GAP);
      rects.push({ x, y, w: CW, h: CH }); layers.push({ ...(await S.tile(await S.loadPhoto(pics[i]), CW, CH, 30)), left: x, top: y });
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}">${S.bgSvg(PW, PH, pal)}
${S.brand(SIDE + 2, 76, 24, pal, "start", false)}${ch.make(PW - SIDE, 40, "end")}
${S.text(title, SIDE, 178, tsz, pal.ink, { font: S.FONTS[lang] || S.FONT })}
${S.text("gachapla.com", PW / 2, PH - 34, 28, pal.sub, { anchor: "middle", ls: 1 })}
</svg>`;
    const file = `week-${lang}-${key}.jpg`;
    await sharp(Buffer.from(svg)).composite([await S.shadowLayer(PW, PH, rects, pal, 30, 0.7), ...layers]).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(OUT, file));
    return file;
  };
  const WEEK = {};
  try {
    const x = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "data", "x.json"), "utf8"));
    if (x.week && (x.week.items || []).length >= 4) {
      const key = String(x.week.from || "").replace(/\//g, "-");
      const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const [fm, fd] = String(x.week.from).split("/").map(Number), [tm, td] = String(x.week.to).split("/").map(Number);
      const rJa = `${x.week.from} - ${x.week.to}`, rEn = fm === tm ? `${MONS[fm - 1]} ${fd} - ${td}` : `${MONS[fm - 1]} ${fd} - ${MONS[tm - 1]} ${td}`;
      const jaIds = x.week.items.map((i) => i.id), enIds = ((x.en && x.en.week && x.en.week.items) || []).map((i) => i.id);
      for (const lang of ["ja", "en", "ko", "zh-tw", "zh-cn"]) {
        const ids = lang === "en" && enIds.length >= 4 ? enIds : jaIds;
        const f = await weekPin(lang, ids, lang === "en" ? rEn : rJa, key);
        if (f) WEEK[lang] = { file: f, key, count: x.week.count, from: x.week.from, to: x.week.to };
      }
      console.log(`今週の縦長ピン：${Object.keys(WEEK).length}言語`);
    }
  } catch (e) { console.log(`⚠ 今週の縦長ピン: ${e.message}`); }
  // ===== Threads・Instagram の夜の投稿の1枚目（表紙）：テーマ名＋写真2×2（1080×1080）。タイトルは日本語なので Noto Sans CJK が必要（デプロイで入れる） =====
  try {
    const x = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "data", "x.json"), "utf8"));
    const m = x.morning || {}, hasPic = (id) => fs.existsSync(path.join(OUT, `${id}.jpg`)) || (ONLY.length && fs.existsSync(path.join(ROOT, "images", `${id}.webp`)));
    let cat = "", pool = [];
    if (m.active) { pool = (m.items || []).filter((i) => hasPic(i.id)); if (pool.length >= 3) cat = m.category; }
    if (!cat) { pool = ((x.week && x.week.items) || []).filter((i) => hasPic(i.id)); cat = "今週発売"; }
    pool = pool.slice(0, 4);
    if (pool.length >= 2) {
      const C = 1080, top = 210, gap = 20, side = 36, bot = 78;
      const cols = 2, rows = pool.length > 2 ? 2 : 1, cw = Math.floor((C - side * 2 - gap) / 2), ch = Math.floor((C - top - bot - gap * (rows - 1)) / rows);
      const title = cat === "今週発売" ? "今週発売のガチャ" : `今日の${cat}ガチャ`;
      const dt = `${+x.today.slice(5, 7)}/${+x.today.slice(8, 10)}`;
      const pal = S.palette(null), tsz = Math.min(80, Math.floor((C - side * 2 - 8) / S.units(title)));
      const chip = S.chips([dt, `${pool.length} ITEMS`], pal, 26, 50), layers = [], rects = [];
      for (let i = 0; i < pool.length; i++) {
        const xx = side + (i % cols) * (cw + gap), yy = top + Math.floor(i / cols) * (ch + gap);
        rects.push({ x: xx, y: yy, w: cw, h: ch }); layers.push({ ...(await S.tile(await S.loadPhoto(pool[i].id), cw, ch, 30)), left: xx, top: yy });
      }
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${C}" height="${C}">${S.bgSvg(C, C, pal)}
${S.brand(side + 2, 70, 22, pal, "start", false)}${chip.make(C - side, 36, "end")}
${S.HAS_JP ? S.text(title, side, 166, tsz, pal.ink) : ""}
${S.text("gachapla.com", C / 2, C - 28, 26, pal.sub, { anchor: "middle", ls: 1 })}
</svg>`);
      const file = `cover-${x.today}.jpg`;
      await sharp(svg).composite([await S.shadowLayer(C, C, rects, pal, 30, 0.7), ...layers]).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(OUT, file));
      fs.writeFileSync(path.join(ROOT, "dist", "data", "social-cover.json"), JSON.stringify({ date: x.today, cat, url: `https://gachapla.com/images/social/${file}`, ids: pool.map((i) => i.id) }));
      console.log(`SNSの表紙：${title}（${pool.length}枚）`);
    }
  } catch (e) { console.log(`⚠ SNSの表紙: ${e.message}`); }
  const WT = {
    ja: (w) => [`今週発売の新作ガチャ（${w.from}〜${w.to}）`, `今週は${w.count}シリーズが登場。発売日・値段・近くの取扱店はガチャプラネットで。`, "/week"],
    en: (w) => ["New Japanese gachapon releasing this week", `${w.count} new capsule toy series in Japan this week. Prices, designs and shops in Japan on GACHA PLANET.`, "/en/week"],
    ko: (w) => [`이번 주 일본 신작 가챠 (${w.from}~${w.to})`, `이번 주 일본에서 ${w.count}종의 신작 가챠가 발매됩니다. 가격·라인업·재고 매장은 GACHA PLANET에서.`, "/ko/week"],
    "zh-tw": (w) => [`本週日本新款扭蛋（${w.from}〜${w.to}）`, `本週日本有${w.count}款新扭蛋發售。價格・款式・有庫存的扭蛋店請看 GACHA PLANET。`, "/zh-tw/week"],
    "zh-cn": (w) => [`本周日本新款扭蛋（${w.from}〜${w.to}）`, `本周日本有${w.count}款新扭蛋发售。价格・款式・有库存的扭蛋店请看 GACHA PLANET。`, "/zh-cn/week"],
  };
  const weekItem = (lang) => { const w = WEEK[lang]; if (!w) return ""; const [t, d, link] = WT[lang](w); const u = `https://gachapla.com/images/social/${w.file}`;
    return `<item><title>${esc0(t)}</title><link>https://gachapla.com${link}</link><guid isPermaLink="false">gachapla-week-${lang}-${w.key}</guid><pubDate>${new Date().toUTCString()}</pubDate><description>${esc0(d)}</description><enclosure url="${u}" type="image/jpeg" length="0"/><media:content url="${u}" medium="image" type="image/jpeg"/></item>\n`; };

  // Pinterest の自動ピン（RSS）：新しく載った順に100件。Pinterest ビジネスの「RSSフィードから自動公開」に https://gachapla.com/pinterest.xml を登録して使う
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SITE = "https://gachapla.com";
  const pinnable = items.filter((it) => fs.existsSync(path.join(OUT, `${it.id}.jpg`)))
    .sort((a, b) => (b.added || "").localeCompare(a.added || "") || (b.release || "").localeCompare(a.release || ""));
  const feed = pinnable.slice(0, 100);
  const rel = (it) => it.release_note || (it.release ? `${it.release.slice(0, 4)}年${+it.release.slice(5, 7)}月発売` : "");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>ガチャプラネット｜新作ガチャガチャ</title><link>${SITE}/</link><description>新作ガチャガチャの発売日・値段・ラインナップ</description><language>ja</language>
${weekItem("ja")}${feed.map((it) => { const u = `${SITE}/images/social/${it.id}.jpg`; const d = `${it.name}｜1回${it.price}円・全${it.lineup}種｜${rel(it)}${(it.lineup_names || []).length ? `｜${it.lineup_names.slice(0, 5).join("・")}` : ""}。発売日・近くの取扱店はガチャプラネットで。`; return `<item><title>${esc(it.name.replace(/【[^】]*】/g, "").trim() + "（ガチャ）")}</title><link>${SITE}/item/${it.id}</link><guid isPermaLink="false">gachapla-${esc(it.id)}</guid><pubDate>${new Date((it.added || "2026-11-01") + "T09:00:00+09:00").toUTCString()}</pubDate><description>${esc(d)}</description><enclosure url="${u}" type="image/jpeg" length="0"/><media:content url="${u}" medium="image" type="image/jpeg"/></item>`; }).join("\n")}
</channel></rss>
`;
  fs.writeFileSync(path.join(ROOT, "dist", "pinterest.xml"), xml);
  console.log(`Pinterest 用の RSS：${feed.length}件`);
  // 英語版（https://gachapla.com/pinterest-en.xml）：英語名のある商品だけ。リンクは /en/item/、説明は英語
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const relEn = (it) => (it.release ? `${MON[+it.release.slice(5, 7) - 1]} ${it.release.slice(0, 4)}` : "");
  const feedEn = pinnable.filter((it) => it.name_en).slice(0, 100);
  const xmlEn = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>GACHA PLANET | New gachapon (Japanese capsule toys)</title><link>${SITE}/en/</link><description>New Japanese capsule toys (gachapon): release dates, prices and lineups</description><language>en</language>
${weekItem("en")}${feedEn.map((it) => { const u = `${SITE}/images/social/${it.id}.jpg`; const d = [`¥${it.price} per play`, it.lineup ? `${it.lineup} designs` : "", relEn(it), "Japanese capsule toy (gachapon)"].filter(Boolean).join(" · ") + ". Release date, price and shops in Japan on GACHA PLANET."; return `<item><title>${esc(`${it.name_en} (gachapon)`)}</title><link>${SITE}/en/item/${it.id}</link><guid isPermaLink="false">gachapla-en-${esc(it.id)}</guid><pubDate>${new Date((it.added || "2026-11-01") + "T09:00:00+09:00").toUTCString()}</pubDate><description>${esc(d)}</description><enclosure url="${u}" type="image/jpeg" length="0"/><media:content url="${u}" medium="image" type="image/jpeg"/></item>`; }).join("\n")}
</channel></rss>
`;
  fs.writeFileSync(path.join(ROOT, "dist", "pinterest-en.xml"), xmlEn);
  console.log(`Pinterest 用の RSS（英語）：${feedEn.length}件`);
  // 韓国語・中国語（https://gachapla.com/pinterest-ko.xml など）：その言葉の名前（names.<lang>）がある商品だけ。リンクは /<lang>/item/
  const XL = {
    ko: { language: "ko", chTitle: "GACHA PLANET | 일본 신작 가챠(캡슐토이)", chDesc: "일본 가챠(가샤폰·캡슐토이) 신작의 발매일·가격·라인업",
      title: (n) => `${n} 가챠`, rel: (it) => (it.release ? `${it.release.slice(0, 4)}년 ${+it.release.slice(5, 7)}월 발매` : ""),
      desc: (it, r) => [`1회 ${it.price}엔`, it.lineup ? `전 ${it.lineup}종` : "", r, "일본 가챠(캡슐토이)"].filter(Boolean).join(" · ") + ". 발매일·가격·재고가 있는 일본 매장은 GACHA PLANET에서." },
    "zh-tw": { language: "zh-TW", chTitle: "GACHA PLANET｜日本扭蛋新品", chDesc: "日本扭蛋（轉蛋）新品的發售日・價格・陣容",
      title: (n) => `${n}（扭蛋）`, rel: (it) => (it.release ? `${it.release.slice(0, 4)}年${+it.release.slice(5, 7)}月發售` : ""),
      desc: (it, r) => [`一轉${it.price}日圓`, it.lineup ? `全${it.lineup}種` : "", r, "日本扭蛋"].filter(Boolean).join("・") + "。發售日・價格・日本有庫存的扭蛋店，請看 GACHA PLANET。" },
    "zh-cn": { language: "zh-CN", chTitle: "GACHA PLANET｜日本扭蛋新品", chDesc: "日本扭蛋新品的发售日・价格・阵容",
      title: (n) => `${n}（扭蛋）`, rel: (it) => (it.release ? `${it.release.slice(0, 4)}年${+it.release.slice(5, 7)}月发售` : ""),
      desc: (it, r) => [`每次${it.price}日元`, it.lineup ? `全${it.lineup}款` : "", r, "日本扭蛋"].filter(Boolean).join("・") + "。发售日・价格・日本有库存的扭蛋店，请看 GACHA PLANET。" },
  };
  for (const [lang, L] of Object.entries(XL)) {
    let NM = {}; try { NM = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "i18n", `names-${lang}.json`), "utf8")) || {}; } catch (e) {}
    const feedL = pinnable.filter((it) => NM[it.id]).slice(0, 100).map((it) => ({ ...it, names: { [lang]: NM[it.id] } }));
    const xmlL = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>${esc(L.chTitle)}</title><link>${SITE}/${lang}/</link><description>${esc(L.chDesc)}</description><language>${L.language}</language>
${weekItem(lang)}${feedL.map((it) => { const u = `${SITE}/images/social/${it.id}.jpg`; return `<item><title>${esc(L.title(it.names[lang]))}</title><link>${SITE}/${lang}/item/${it.id}</link><guid isPermaLink="false">gachapla-${lang}-${esc(it.id)}</guid><pubDate>${new Date((it.added || "2026-11-01") + "T09:00:00+09:00").toUTCString()}</pubDate><description>${esc(L.desc(it, L.rel(it)))}</description><enclosure url="${u}" type="image/jpeg" length="0"/><media:content url="${u}" medium="image" type="image/jpeg"/></item>`; }).join("\n")}
</channel></rss>
`;
    fs.writeFileSync(path.join(ROOT, "dist", `pinterest-${lang}.xml`), xmlL);
    console.log(`Pinterest 用の RSS（${lang}）：${feedL.length}件`);
  }
})();
