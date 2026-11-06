#!/usr/bin/env node
// 公開のあとに、最近変わったページを IndexNow（Bing・Naver・Yandex など）に知らせる。
// サイトマップの lastmod が最近（既定3日以内）のページだけ送る。INDEXNOW_DAYS で日数を変えられる。
"use strict";
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), dist = path.join(root, "dist");
const site = JSON.parse(fs.readFileSync(path.join(root, "data", "site.json"), "utf8"));
const key = site.indexnow_key; if (!key) { console.log("indexnow_key がないので送りません"); process.exit(0); }
const days = +(process.env.INDEXNOW_DAYS || 3), since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const urls = new Set();
for (const f of fs.readdirSync(dist).filter((f) => /^sitemap-.*\.xml$/.test(f))) {
  const x = fs.readFileSync(path.join(dist, f), "utf8");
  for (const u of x.split("</url>")) { const loc = (u.match(/<loc>([^<]+)<\/loc>/) || [])[1], lm = (u.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1]; if (loc && (!lm || lm.slice(0, 10) >= since)) urls.add(loc); }
}
const list = [...urls].slice(0, 9000);
if (!list.length) { console.log("知らせるページなし"); process.exit(0); }
const host = "gachapla.com";
if (process.env.INDEXNOW_DRY) { console.log(list.length, list.slice(0,3)); process.exit(0); }
fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: list }) })
  .then((r) => console.log(`IndexNow：${list.length}ページを送信（${r.status}）`)).catch((e) => console.log("IndexNow 失敗：" + e.message));
