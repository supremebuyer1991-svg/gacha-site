// 診断の点数づけ（src/app.js の QUIZ-CORE の部分）を、実際の商品データで確かめる。
// 使い方： node src/build.js のあとに  node test/quiz-score.test.mjs
import fs from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
const app = fs.readFileSync(root + "src/app.js", "utf8");
const cut = (a, b) => { const i = app.indexOf(a), j = app.indexOf(b); assert.ok(i >= 0 && j > i, a); return app.slice(i, j); };
const NORM = (v) => String(v || "").normalize("NFKC").toLowerCase()
  .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
  .replace(/[\s・･!！?？'’"“”:：\-‐–—~〜～、。,.\/／|｜【】\[\]「」『』()（）♪☆★™]/g, "");
const { quizCore, quizText } = new Function(cut("/* QUIZ-CORE-START", "/* QUIZ-CORE-END */") + cut("/* QUIZ-TEXT-START", "/* QUIZ-TEXT-END */") + " return { quizCore: quizCore, quizText: quizText };")();
const core = quizCore(NORM), QZ = quizText(false);

const items = JSON.parse(fs.readFileSync(root + "dist/data/quiz-ja.json", "utf8"));
const html = fs.readFileSync(root + "dist/index.html", "utf8");
const embed = JSON.parse(html.match(/id="items-data">([\s\S]*?)<\/script>/)[1]);
const cfg = { uses: embed.uses, groups: embed.groups.map((g) => ({ slug: g.slug, subs: g.subs.map((x) => ({ slug: x.slug, leaves: x.leaves.map((l) => ({ slug: l.slug, rx: new RegExp(l.match, "i") })) })) })) };
const YM = process.env.YM || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const A = (o) => ({ g: [], s: [], l: [], f: [], u: [], o: "", b: "", n: "", x: "", a: "", ...o });

const cases = [
  ["サンリオ好き・300円・つける", A({ g: ["kawaii"], f: ["kawaii:sanrio:sanrio-characters-all"], u: ["wear"], b: "300" })],
  ["かっこいい・ロボット・フィギュア", A({ g: ["cool"], s: ["cool:robot"], u: ["deco"] })],
  ["ちいかわ推し（候補から選ぶ）", A({ f: ["kawaii:character:chiikawa"] })],
  ["ちいかわ推し（名前を入力）", A({ o: "ちいかわ" })],
  ["レトロ昭和", A({ g: ["retro"], s: ["retro:showa"] })],
  ["何も選ばず", A({})],
  ["かわいい系だけ（片寄りの確認）", A({ g: ["kawaii"] })],
  ["かわいい＋レトロ・新作・20代女性", A({ g: ["kawaii", "retro"], n: "new", x: "female", a: "20" })],
  ["つかう・300円だけ（好みなし）", A({ u: ["use"], b: "300" })],
  ["どこにも無い名前", A({ o: "ぜったいにないなまえ", u: ["plush"] })],
];
for (const [title, ans] of cases) {
  const r = core.score(items, cfg, ans, YM), ty = core.typeOf(ans, cfg);
  const name = (QZ.subPre[ty.sub] || QZ.pre[ty.p]) + QZ.suf[ty.s];
  console.log(`\n■ ${title} → 「${name}」 ${r.list.length}件（ぴったり${r.nDirect}件・level ${r.level}・満点${r.max}）`);
  r.list.slice(0, 5).forEach((x, i) => console.log(`  ${i + 1}. ${x.pct == null ? " -- " : String(x.pct).padStart(3) + "%"} s=${x.s.toFixed(2)} t${x.tier} ¥${x.it.price} ${x.it.rl} ${x.it.jn}`));
  // かならず12件以上出る・順番の番号が続いている・％は0〜100
  assert.ok(r.list.length >= 12, "12件以上");
  r.list.forEach((x, i) => { assert.equal(x.i, i); assert.ok(x.pct == null || (x.pct >= 0 && x.pct <= 100)); });
  assert.equal(new Set(r.list.map((x) => x.it.id)).size, r.list.length, "同じ商品が2回出ない");
  assert.ok(name && !/undefined/.test(name), "タイプ名");
  // 上位12件：同じシリーズ（数字ちがい）は2件まで
  const base = {};
  r.list.slice(0, 12).forEach((x) => { const k = x.k ? x.k.b : x.it.jn; base[k] = (base[k] || 0) + 1; });
  assert.ok(Math.max(...Object.values(base)) <= 2, "同じシリーズは上位12件に2件まで");
}
// 好みを選んだとき、ぴったりの商品が近い系統の商品より前に並ぶ
{
  const r = core.score(items, cfg, A({ f: ["kawaii:character:chiikawa"], u: ["deco"], b: "300" }), YM);
  const firstNear = r.list.findIndex((x) => x.tier > 0);
  assert.ok(r.list.slice(0, firstNear).every((x) => x.tier === 0) && r.list.slice(firstNear).every((x) => x.tier > 0));
  assert.ok(r.list.slice(0, r.nDirect).every((x) => /ちいかわ|ハチワレ/.test(x.it.jn)));
}
// 予算：300円までを選ぶと、上位12件のほとんどが300円以内
{
  const r = core.score(items, cfg, A({ g: ["kawaii"], b: "300" }), YM);
  assert.ok(r.list.slice(0, 12).filter((x) => x.it.price <= 300).length >= 11);
}
console.log("\n✔ 診断の点数づけ：すべて確認できました");
