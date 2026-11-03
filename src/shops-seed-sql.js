#!/usr/bin/env node
// data/stores.json（公式の取扱店）から、ガチャマップのお店を入れる SQL を作る（すでにあるお店は変えない）
"use strict";
const fs = require("fs"), path = require("path");
const stores = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "stores.json"), "utf8"));
const q = (v) => (v == null || v === "" ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const rows = stores.filter((s) => /^g-s\d+$/i.test(s.id) && s.lat && s.lng).map((s) =>
  `INSERT OR IGNORE INTO shops (id, name, pref, address, lat, lng, src, created_at) VALUES (${q(s.id.slice(2).toLowerCase())}, ${q(s.name)}, ${q(s.prefecture)}, ${q(s.address)}, ${q(s.lat)}, ${q(s.lng)}, 'bandai', '2026-11-04');`);
process.stdout.write(rows.join("\n") + "\n");
