#!/usr/bin/env node
// 公開のあとに、中身が変わったページを IndexNow（Bing・Naver・Yandex など）に知らせる。
// ふだん：今回のビルドで「中身の指紋」が変わったページ（build.js が書き出す .indexnow-urls.json）だけを送る。同じページを何度も送らない。
// INDEXNOW_DAYS を付けたとき・一覧のファイルがないとき：サイトマップの lastmod がその日数以内（既定3日）のページを送る（手動で送り直す用）。
"use strict";
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), dist = path.join(root, "dist");
const site = JSON.parse(fs.readFileSync(path.join(root, "data", "site.json"), "utf8"));
const key = site.indexnow_key; if (!key) { console.log("indexnow_key がないので送りません"); process.exit(0); }
const days = +(process.env.INDEXNOW_DAYS || 3), since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const urls = new Set();
const changedFile = path.join(root, ".indexnow-urls.json");
const inSitemap = new Set(); // サイトマップに載っているページだけ送る
const useList = !process.env.INDEXNOW_DAYS && fs.existsSync(changedFile);
for (const f of fs.readdirSync(dist).filter((f) => /^sitemap-.*\.xml$/.test(f))) {
  const x = fs.readFileSync(path.join(dist, f), "utf8");
  for (const u of x.split("</url>")) { const loc = (u.match(/<loc>([^<]+)<\/loc>/) || [])[1], lm = (u.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1]; if (loc) inSitemap.add(loc); if (loc && !useList && (!lm || lm.slice(0, 10) >= since)) urls.add(loc); }
}
if (useList) for (const u of JSON.parse(fs.readFileSync(changedFile, "utf8"))) if (inSitemap.has(u)) urls.add(u);
const list = [...urls].slice(0, 10000); // IndexNow は1回に1万件まで
if (!list.length) { console.log("知らせるページなし"); process.exit(0); }
const host = "gachapla.com";
if (process.env.INDEXNOW_DRY) { console.log(list.length, list.slice(0,3)); process.exit(0); }
fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: list }) })
  .then((r) => console.log(`IndexNow：${list.length}ページを送信（${r.status}）`)).catch((e) => console.log("IndexNow 失敗：" + e.message));
