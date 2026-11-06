#!/usr/bin/env node
// SNS（Threads・Instagram・Pinterest）用の画像を作る：dist/images/social/商品id.jpg（1080×1350、JPEG）
// Threads と Instagram は JPEG/PNG しか受け付けないので、商品の webp 写真から作る。
// 対象は 先月以降に発売の商品（最大400件）。sharp が必要（デプロイのときに入れる）。
"use strict";
const fs = require("fs"), path = require("path");
let sharp; try { sharp = require("sharp"); } catch (e) { console.log("sharp がないので SNS 用の画像は作りません"); process.exit(0); }
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "dist", "images", "social");
const items = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "items.json"), "utf8"));
const now = new Date(Date.now() + 9 * 3600e3), from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
const W = 1080, H = 1350, CARD = 960;
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1f6"/><stop offset="1" stop-color="#eef6ff"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<rect x="${(W - CARD) / 2}" y="60" width="${CARD}" height="${CARD}" rx="44" fill="#ffffff"/>
<text x="${W / 2}" y="${H - 170}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="58"><tspan fill="#ff4f7b">GACHA&#160;</tspan><tspan fill="#3aa0ff">PLANET</tspan></text>
<text x="${W / 2}" y="${H - 100}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="34" fill="#6b7194">gachapla.com</text>
</svg>`);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const list = items.filter((it) => (it.release || "") >= from && fs.existsSync(path.join(ROOT, "images", `${it.id}.webp`)))
    .sort((a, b) => (b.release || "").localeCompare(a.release || "")).slice(0, 400);
  let n = 0;
  for (const it of list) {
    const out = path.join(OUT, `${it.id}.jpg`);
    try {
      // 白い余白を切ってから、カードの中にできるだけ大きく
      const photo = await sharp(path.join(ROOT, "images", `${it.id}.webp`)).flatten({ background: "#ffffff" }).trim({ background: "#ffffff", threshold: 12 })
        .resize(CARD - 60, CARD - 60, { fit: "contain", background: "#ffffff" }).toBuffer();
      await sharp(bg).composite([{ input: photo, left: (W - (CARD - 60)) / 2, top: 90 }]).jpeg({ quality: 80, mozjpeg: true }).toFile(out);
      n++;
    } catch (e) { console.log(`⚠ ${it.id}: ${e.message}`); }
  }
  console.log(`SNS用の画像：${n}件`);
  // Pinterest の自動ピン（RSS）：新しく載った順に100件。Pinterest ビジネスの「RSSフィードから自動公開」に https://gachapla.com/pinterest.xml を登録して使う
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SITE = "https://gachapla.com";
  const feed = items.filter((it) => fs.existsSync(path.join(OUT, `${it.id}.jpg`)))
    .sort((a, b) => (b.added || "").localeCompare(a.added || "") || (b.release || "").localeCompare(a.release || "")).slice(0, 100);
  const rel = (it) => it.release_note || (it.release ? `${it.release.slice(0, 4)}年${+it.release.slice(5, 7)}月発売` : "");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>ガチャプラネット｜新作ガチャガチャ</title><link>${SITE}/</link><description>新作ガチャガチャの発売日・値段・ラインナップ</description><language>ja</language>
${feed.map((it) => { const u = `${SITE}/images/social/${it.id}.jpg`; const d = `${it.name}｜1回${it.price}円・全${it.lineup}種｜${rel(it)}${(it.lineup_names || []).length ? `｜${it.lineup_names.slice(0, 5).join("・")}` : ""}。発売日・近くの取扱店はガチャプラネットで。`; return `<item><title>${esc(it.name.replace(/【[^】]*】/g, "").trim() + "（ガチャ）")}</title><link>${SITE}/item/${it.id}</link><guid isPermaLink="false">gachapla-${esc(it.id)}</guid><pubDate>${new Date((it.added || "2026-11-01") + "T09:00:00+09:00").toUTCString()}</pubDate><description>${esc(d)}</description><enclosure url="${u}" type="image/jpeg" length="0"/><media:content url="${u}" medium="image" type="image/jpeg"/></item>`; }).join("\n")}
</channel></rss>
`;
  fs.writeFileSync(path.join(ROOT, "dist", "pinterest.xml"), xml);
  console.log(`Pinterest 用の RSS：${feed.length}件`);
})();
