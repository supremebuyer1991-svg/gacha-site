#!/usr/bin/env node
// 書いた商品説明を items.json に入れる。入力：JSON Lines {id, summary, description, lineup_notes}
// 長さ・URL・ラインナップ名の一致を確かめて、おかしいものは入れない
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const p = path.join(ROOT, "data/items.json");
const items = JSON.parse(fs.readFileSync(p, "utf8"));
const byId = new Map(items.map((x) => [x.id, x]));
let ok = 0, ng = 0;
for (const file of process.argv.slice(2)) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim())) {
    let r;
    try { r = JSON.parse(line); } catch { console.log(`⚠ 読めない行：${line.slice(0, 60)}`); ng++; continue; }
    const it = byId.get(r.id);
    const d = String(r.description || "").trim(), s = String(r.summary || "").trim();
    const bad = !it ? "商品なし" : d.length < 120 || d.length > 420 ? `説明の長さ ${d.length}` : s.length < 15 || s.length > 80 ? `要約の長さ ${s.length}`
      : /https?:|www\.|amazon|楽天|メルカリ|ガチャプラネット/i.test(d + s) ? "URL・店名" : "";
    if (bad) { console.log(`⚠ ${r.id}: ${bad}`); ng++; continue; }
    it.description = d;
    it.summary = s;
    const names = new Set(it.lineup_names || []);
    const notes = Object.fromEntries(Object.entries(r.lineup_notes || {}).filter(([k, v]) => names.has(k) && v && String(v).length <= 50).map(([k, v]) => [k, String(v).trim()]));
    if (Object.keys(notes).length) it.lineup_notes = notes; else delete it.lineup_notes;
    ok++;
  }
}
fs.writeFileSync(p, JSON.stringify(items, null, 2) + "\n");
console.log(`商品説明：${ok}件 入れました（入れなかったもの ${ng}件）`);
