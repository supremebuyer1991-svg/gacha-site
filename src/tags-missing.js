#!/usr/bin/env node
// 診断タグが自動で仮付けされた（まだ見直していない）商品を表示する
// 形式：id<TAB>日本語名<TAB>年代<TAB>性別<TAB>細かい項目（いま付いている仮のタグ）
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const items = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "items.json"), "utf8"));
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "site.json"), "utf8"));
if (process.argv[2] === "--vocab") {
  console.log("年代: 10 20 30 40 50（50は50代以上）\n性別: female male（両方向けなら両方）\n細かい項目:");
  for (const g of site.quiz_groups) console.log(`  ${g.label}: ` + g.subs.map((x) => `${g.slug}:${x.slug}（${x.label}）`).join(" "));
  process.exit(0);
}
const todo = items.filter((it) => it.tags_auto);
for (const it of todo) console.log([it.id, it.name, (it.q_ages || []).join(","), (it.q_genders || []).join(","), (it.q_subs || []).join(",")].join("\t"));
console.error(`見直しが必要な商品：${todo.length}件（使えるタグは node src/tags-missing.js --vocab）`);
