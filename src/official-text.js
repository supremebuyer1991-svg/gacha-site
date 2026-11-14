#!/usr/bin/env node
// 商品説明を書くための「メーカー公式ページの文章」を取ってきて data/official-text.json にためる
// 人気の高い順に、まだ取っていない商品を最大 N 件（引数。ふだん 60）。1件ごとに2秒あける
// 取ったものは文章を書く材料にだけ使う（そのまま載せない）
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site.json"), "utf8"));
const items = JSON.parse(fs.readFileSync(path.join(ROOT, "data/items.json"), "utf8"));
const OUT = path.join(ROOT, "data/official-text.json");
const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const { decode } = require("./import-schedule.js");
const UA = "Mozilla/5.0 (compatible; GachaSiteBot/1.0; +" + (process.env.SITE_URL || site.url) + ")";
const LIMIT = Number(process.argv[2]) || 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const meta = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${prop}["']`, "i"));
  return m ? decode(m[1]).trim() : "";
};
const clean = (html) => decode(html
  .replace(/<(script|style|noscript|svg|header|footer|nav|form)[\s\S]*?<\/\1>/gi, " ")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|dd|dt|tr|h\d)>/gi, "\n")
  .replace(/<[^>]+>/g, " "))
  .replace(/[ \t　]+/g, " ").replace(/\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();

(async () => {
  const todo = items.filter((it) => it.official_url && !store[it.id] && !(it.description || "").trim())
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, LIMIT);
  let ok = 0;
  for (const it of todo) {
    try {
      const res = await fetch(it.official_url, { headers: { "User-Agent": UA, "Accept-Language": "ja" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const body = clean(html);
      // 商品名が出てくるあたりから先を中心に（メニューなどを避ける）
      const key = it.name.normalize("NFKC").replace(/【[^】]*】/g, "").trim().slice(0, 8);
      const at = Math.max(0, body.normalize("NFKC").indexOf(key));
      const text = body.slice(at, at + 2500);
      store[it.id] = { at: new Date().toISOString().slice(0, 10), desc: meta(html, "description") || meta(html, "og:description"), text };
      ok++;
    } catch (e) {
      store[it.id] = { at: new Date().toISOString().slice(0, 10), error: String(e.message || e) };
    }
    await sleep(2000);
  }
  fs.writeFileSync(OUT, JSON.stringify(store, null, 0) + "\n");
  console.log(`公式ページの文章：${ok}/${todo.length}件 取得（合計 ${Object.keys(store).length}件）`);
})();
