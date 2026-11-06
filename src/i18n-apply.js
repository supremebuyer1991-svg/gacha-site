#!/usr/bin/env node
// 使い方： node src/i18n-apply.js <zh-cn|zh-tw|ko> 翻訳.tsv   （1行に「id<TAB>名前」）
"use strict";
const fs = require("fs"), path = require("path");
const [lang, file] = process.argv.slice(2);
if (!["zh-cn", "zh-tw", "ko"].includes(lang) || !file) { console.error("使い方： node src/i18n-apply.js <zh-cn|zh-tw|ko> 翻訳.tsv"); process.exit(1); }
const root = path.join(__dirname, ".."), f = path.join(root, "data", "i18n", `names-${lang}.json`);
const ids = new Set(JSON.parse(fs.readFileSync(path.join(root, "data", "items.json"), "utf8")).map((x) => x.id));
const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
let n = 0, bad = 0;
for (const line of fs.readFileSync(file, "utf8").split("\n")) {
  const [id, name] = line.split("\t").map((s) => (s || "").trim());
  if (!id || !name) continue;
  if (!ids.has(id)) { console.error("⚠ 商品が見つからない：" + id); bad++; continue; }
  if (lang !== "ko" && /[぀-ゟァ-ヺ]/.test(name)) { console.error("⚠ かなが残っている：" + id + " " + name); bad++; continue; }
  if (lang === "ko" && /[぀-ヿ]/.test(name)) { console.error("⚠ かなが残っている：" + id + " " + name); bad++; continue; }
  cur[id] = name; n++;
}
fs.writeFileSync(f, JSON.stringify(cur, null, 1) + "\n");
console.log(`${lang}：${n}件を入れました${bad ? `（⚠ ${bad}件は入れていません）` : ""}`);
