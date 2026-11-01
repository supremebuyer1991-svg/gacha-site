#!/usr/bin/env node
// 英語名（name_en）が空の商品だけを「id<TAB>日本語名<TAB>メーカー」で1行ずつ表示する（英語名の自動追加用）
"use strict";
const fs = require("fs");
const path = require("path");
const items = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "items.json"), "utf8"));
const missing = items.filter((it) => !it.name_en);
for (const it of missing) console.log([it.id, it.name, it.maker].join("\t"));
console.error(`英語名が空の商品：${missing.length}件`);
