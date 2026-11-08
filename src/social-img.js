#!/usr/bin/env node
// SNS（Threads・Instagram・Pinterest）用の画像を作る：dist/images/social/商品id.jpg（1200×1200、JPEG。写真を大きく、右下にサイト名を小さく）
// Threads と Instagram は JPEG/PNG しか受け付けないので、商品の webp 写真から作る。
// 対象は 先月以降に発売の商品（最大400件）。sharp が必要（デプロイのときに入れる）。
// 画像を作ったあと、Pinterest・Bluesky の自動投稿用 RSS も書く：pinterest.xml（日本語）・pinterest-en.xml・pinterest-ko.xml・pinterest-zh-tw.xml・pinterest-zh-cn.xml
"use strict";
const fs = require("fs"), path = require("path");
let sharp; try { sharp = require("sharp"); } catch (e) { console.log("sharp がないので SNS 用の画像は作りません"); process.exit(0); }
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "dist", "images", "social");
const items = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "items.json"), "utf8"));
const now = new Date(Date.now() + 9 * 3600e3), from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
const W = 1200, H = 1200, PAD = 13;
// 商品写真を画面いっぱいに。サイト名とURLは右下に小さく（ユーザーの希望）。大きさは 1080 のときの 1200/1080 倍
const BADGE_W = 422, BADGE_H = 56, BADGE_M = 18;
const badge = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_W}" height="${BADGE_H}">
<rect width="${BADGE_W}" height="${BADGE_H}" rx="28" fill="#ffffff" fill-opacity="0.88"/>
<text x="22" y="37" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="23" fill="#ff4f7b">GACHA</text>
<text x="124" y="37" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="23" fill="#3aa0ff">PLANET</text>
<text x="247" y="37" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="20" fill="#6b7194">gachapla.com</text>
</svg>`);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // X・SNSで使う商品（x.json のまとめ・注目・今週・来週）は発売月が古くても必ず作る
  const want = new Set();
  try { const x = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "data", "x.json"), "utf8")); for (const k of ["morning", "week", "next_week", "new_info"]) for (const it of (x[k] && x[k].items) || []) want.add(it.id); for (const it of x.picks || []) want.add(it.id); } catch (e) {}
  const has = (it) => fs.existsSync(path.join(ROOT, "images", `${it.id}.webp`));
  const list = [...items.filter((it) => want.has(it.id) && has(it)),
    ...items.filter((it) => !want.has(it.id) && (it.release || "") >= from && has(it)).sort((a, b) => (b.release || "").localeCompare(a.release || "")).slice(0, 300)];
  let n = 0;
  for (const it of list) {
    const out = path.join(OUT, `${it.id}.jpg`);
    try {
      // 白い余白を切ってから、カードの中にできるだけ大きく
      const photo = await sharp(path.join(ROOT, "images", `${it.id}.webp`)).flatten({ background: "#ffffff" }).trim({ background: "#ffffff", threshold: 12 })
        .resize(W - PAD * 2, H - PAD * 2, { fit: "contain", background: "#ffffff" }).toBuffer();
      await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
        .composite([{ input: photo, left: PAD, top: PAD }, { input: badge, left: W - BADGE_W - BADGE_M, top: H - BADGE_H - BADGE_M }]).jpeg({ quality: 82 }).toFile(out);
      n++;
    } catch (e) { console.log(`⚠ ${it.id}: ${e.message}`); }
  }
  console.log(`SNS用の画像：${n}件`);
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
${feed.map((it) => { const u = `${SITE}/images/social/${it.id}.jpg`; const d = `${it.name}｜1回${it.price}円・全${it.lineup}種｜${rel(it)}${(it.lineup_names || []).length ? `｜${it.lineup_names.slice(0, 5).join("・")}` : ""}。発売日・近くの取扱店はガチャプラネットで。`; return `<item><title>${esc(it.name.replace(/【[^】]*】/g, "").trim() + "（ガチャ）")}</title><link>${SITE}/item/${it.id}</link><guid isPermaLink="false">gachapla-${esc(it.id)}</guid><pubDate>${new Date((it.added || "2026-11-01") + "T09:00:00+09:00").toUTCString()}</pubDate><description>${esc(d)}</description><enclosure url="${u}" type="image/jpeg" length="0"/><media:content url="${u}" medium="image" type="image/jpeg"/></item>`; }).join("\n")}
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
${feedEn.map((it) => { const u = `${SITE}/images/social/${it.id}.jpg`; const d = [`¥${it.price} per play`, it.lineup ? `${it.lineup} designs` : "", relEn(it), "Japanese capsule toy (gachapon)"].filter(Boolean).join(" · ") + ". Release date, price and shops in Japan on GACHA PLANET."; return `<item><title>${esc(`${it.name_en} (gachapon)`)}</title><link>${SITE}/en/item/${it.id}</link><guid isPermaLink="false">gachapla-en-${esc(it.id)}</guid><pubDate>${new Date((it.added || "2026-11-01") + "T09:00:00+09:00").toUTCString()}</pubDate><description>${esc(d)}</description><enclosure url="${u}" type="image/jpeg" length="0"/><media:content url="${u}" medium="image" type="image/jpeg"/></item>`; }).join("\n")}
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
${feedL.map((it) => { const u = `${SITE}/images/social/${it.id}.jpg`; return `<item><title>${esc(L.title(it.names[lang]))}</title><link>${SITE}/${lang}/item/${it.id}</link><guid isPermaLink="false">gachapla-${lang}-${esc(it.id)}</guid><pubDate>${new Date((it.added || "2026-11-01") + "T09:00:00+09:00").toUTCString()}</pubDate><description>${esc(L.desc(it, L.rel(it)))}</description><enclosure url="${u}" type="image/jpeg" length="0"/><media:content url="${u}" medium="image" type="image/jpeg"/></item>`; }).join("\n")}
</channel></rss>
`;
    fs.writeFileSync(path.join(ROOT, "dist", `pinterest-${lang}.xml`), xmlL);
    console.log(`Pinterest 用の RSS（${lang}）：${feedL.length}件`);
  }
})();
