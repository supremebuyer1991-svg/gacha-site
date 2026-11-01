#!/usr/bin/env node
// 「id<TAB>年代<TAB>性別<TAB>細かい項目」のファイルで診断タグを確定する（カンマ区切り）
// 使い方：node src/tags-apply.js タグ.tsv
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const file = process.argv[2];
if (!file) { console.error("使い方：node src/tags-apply.js タグ.tsv"); process.exit(1); }
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "site.json"), "utf8"));
const okSubs = new Set(site.quiz_groups.flatMap((g) => g.subs.map((x) => `${g.slug}:${x.slug}`)));
const okAges = new Set(["10", "20", "30", "40", "50"]);
const okG = new Set(["female", "male"]);
const split = (v) => (v || "").split(",").map((x) => x.trim()).filter(Boolean);
const itemsPath = path.join(ROOT, "data", "items.json");
const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
const byId = new Map(items.map((it) => [it.id, it]));
let n = 0;
for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
  const [id, a, g, s] = line.split("\t");
  const it = byId.get((id || "").trim());
  if (!it) continue;
  const ages = split(a).filter((x) => okAges.has(x));
  const gs = split(g).filter((x) => okG.has(x));
  const subs = split(s).filter((x) => okSubs.has(x));
  const bad = [...split(a).filter((x) => !okAges.has(x)), ...split(g).filter((x) => !okG.has(x)), ...split(s).filter((x) => !okSubs.has(x))];
  if (bad.length) console.log(`⚠ ${it.id}: 使えないタグを無視しました（${bad.join(", ")}）`);
  if (!ages.length || !gs.length || !subs.length) { console.log(`⚠ ${it.id}: 年代・性別・項目のどれかが空なので変更しませんでした`); continue; }
  it.q_ages = ages; it.q_genders = gs; it.q_subs = subs; it.tags_auto = false; n++;
}
fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2) + "\n");
console.log(`診断タグを${n}件確定しました（未確定：${items.filter((it) => it.tags_auto).length}件）`);
