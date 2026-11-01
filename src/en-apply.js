#!/usr/bin/env node
// 「id<TAB>英語名」のファイルを読んで、英語名が空の商品にだけ name_en を入れる。
// 使い方：node src/en-apply.js 英語名.tsv
"use strict";
const fs = require("fs");
const path = require("path");
const MAKER_EN = { "バンダイ": "Bandai", "タカラトミーアーツ": "Takara Tomy A.R.T.S", "ブシロード": "Bushiroad" };
const file = process.argv[2];
if (!file) { console.error("使い方：node src/en-apply.js 英語名.tsv"); process.exit(1); }
const map = new Map(fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.includes("\t")).map((l) => {
  const [id, ...rest] = l.split("\t"); return [id.trim(), rest.join(" ").trim()];
}));
const itemsPath = path.join(__dirname, "..", "data", "items.json");
const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
let n = 0;
for (const it of items) {
  if (it.name_en || !map.get(it.id)) continue;
  it.name_en = map.get(it.id);
  if (!it.maker_en && MAKER_EN[it.maker]) it.maker_en = MAKER_EN[it.maker];
  n++;
}
fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2) + "\n");
console.log(`英語名を${n}件入れました（空のまま：${items.filter((it) => !it.name_en).length}件）`);
