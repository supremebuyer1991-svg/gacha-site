#!/usr/bin/env node
// 中国語（簡体・繁体）・韓国語の商品名がまだない商品を「id<TAB>日本語名<TAB>英語名<TAB>足りない言語」で表示する（毎晩の自動翻訳用）
"use strict";
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), LANGS = ["zh-cn", "zh-tw", "ko"], LIMIT = 80;
const items = JSON.parse(fs.readFileSync(path.join(root, "data", "items.json"), "utf8"));
const names = {}; for (const l of LANGS) { const f = path.join(root, "data", "i18n", `names-${l}.json`); names[l] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}; }
const miss = items.map((it) => ({ it, ls: LANGS.filter((l) => !names[l][it.id]) })).filter((x) => x.ls.length)
  .sort((a, b) => (b.it.release || "").localeCompare(a.it.release || ""));
for (const { it, ls } of miss.slice(0, LIMIT)) console.log([it.id, it.name, it.name_en || "", ls.join(",")].join("\t"));
console.error(`多言語の名前が足りない商品：${miss.length}件（今回は${Math.min(LIMIT, miss.length)}件を表示）`);
