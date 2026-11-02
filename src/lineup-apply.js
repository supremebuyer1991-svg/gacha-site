#!/usr/bin/env node
// ラインナップ名を items.json に入れる。入力：id<TAB>名前1｜名前2｜…（読めなかったときは「-」）
// 入れ終わった商品の読み取り用画像（lineup-src/商品id.jpg）は消す
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const p = path.join(ROOT, "data/items.json");
const items = JSON.parse(fs.readFileSync(p, "utf8"));
const lines = fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.trim());
let ok = 0;
for (const l of lines) {
  const [id, raw = ""] = l.split("\t");
  const it = items.find((x) => x.id === id.trim());
  if (!it) { console.log(`⚠ ${id}: 商品が見つかりません`); continue; }
  const names = raw.trim() === "-" ? [] : raw.split(/[｜|]/).map((s) => s.trim()).filter(Boolean);
  if (raw.trim() !== "-" && !names.length) { console.log(`⚠ ${id}: 名前が空です`); continue; }
  it.lineup_names = [...new Set(names)].slice(0, 60);
  const img = path.join(ROOT, "lineup-src", `${it.id}.jpg`);
  if (fs.existsSync(img)) fs.unlinkSync(img);
  ok++;
}
fs.writeFileSync(p, JSON.stringify(items, null, 2) + "\n");
console.log(`✔ ラインナップ名を ${ok}件 入れました`);
