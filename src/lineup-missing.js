#!/usr/bin/env node
// ラインナップ名がまだの商品のうち、読み取り用の画像（lineup-src/商品id.jpg）があるものを出す
// 出力：id<TAB>商品名<TAB>全何種<TAB>画像のパス
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const items = JSON.parse(fs.readFileSync(path.join(ROOT, "data/items.json"), "utf8"));
const dir = path.join(ROOT, "lineup-src");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")) : [];
const limit = Number(process.argv[2]) || 15;
let n = 0;
for (const f of files) {
  const id = f.replace(/\.jpg$/, "");
  const it = items.find((x) => x.id === id);
  if (!it || Array.isArray(it.lineup_names)) continue;
  if (n++ >= limit) break;
  console.log([id, it.name, it.lineup || "", path.join("lineup-src", f)].join("\t"));
}
if (!n) console.log("（対象なし）");
