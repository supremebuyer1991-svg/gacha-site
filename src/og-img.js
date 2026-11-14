#!/usr/bin/env node
// 共有画像（og:image。X・LINE・Discover などに出る横長の画像）を作る：1200×630 の JPEG
//   1) 商品ページ：写真（切らずに全体）＋商品名（2行まで）＋「¥300・全5種・11月第3週」＋サイト名 → dist/images/og/item/<商品id>.jpg
//   2) まとめページ：写真を並べたコラージュ＋タイトルの帯 → dist/images/og/hub/<キー>.jpg
//      （来週・抽選・抽選の記録・季節・キャラ上位・今月と来月のカレンダー。どのページに何を出すかはビルドが .og-plan.json に書く）
// 作れた画像だけ、ページの og:image を差し替える（作れなかったページは今までの画像のまま＝リンク切れにならない）。日本語ページだけ。
// 作りおき：.og-cache/ に「中身の指紋つきの名前」で置き、中身が変わっていない画像は作り直さない（デプロイでは actions/cache で持ち越す）。
// ためすとき：LIMIT=20 node src/og-img.js（商品は20件だけ） / ONLY=商品id,商品id
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), cp = require("child_process");
let sharp; try { sharp = require("sharp"); } catch (e) { console.log("sharp がないので共有画像は作りません"); process.exit(0); }
const ROOT = path.join(__dirname, ".."), DIST = path.join(ROOT, "dist"), OUT = path.join(DIST, "images", "og"), CACHE = path.join(ROOT, ".og-cache");
const VER = "1"; // 見た目を変えたら上げる（全部作り直しになる）
const W = 1200, H = 630;
const FONT = "Noto Sans CJK JP, Noto Sans JP, sans-serif", LATIN = "DejaVu Sans, Arial, sans-serif";
// 日本語フォントがないと文字が□になるので、そのときは何もしない（今までの画像のまま）
try { if (!/Noto Sans (CJK )?JP/i.test(cp.execSync("fc-list", { encoding: "utf8" }))) { console.log("日本語フォント（Noto Sans CJK）がないので共有画像は作りません"); process.exit(0); } } catch (e) { console.log("フォントを確認できないので共有画像は作りません"); process.exit(0); }
if (!fs.existsSync(DIST)) { console.log("dist がないので共有画像は作りません（先に node src/build.js）"); process.exit(0); }

const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md5 = (x) => crypto.createHash("md5").update(x).digest("hex");
const { weekStartOf, weekInfo } = require("./release-week");
const items = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "items.json"), "utf8"));
const src = (id) => ["webp", "jpg", "jpeg", "png"].map((e) => path.join(ROOT, "images", `${id}.${e}`)).find((f) => fs.existsSync(f));
const picHash = new Map();
const hashOfPic = (id) => { if (!picHash.has(id)) { const f = src(id); picHash.set(id, f ? md5(fs.readFileSync(f)) : ""); } return picHash.get(id); };

// 文字の幅のめやす（全角＝1、半角の大文字＝0.68、そのほかの半角＝0.57、空白＝0.25）
const cw = (ch) => (ch === " " ? 0.25 : /[A-Z]/.test(ch) ? 0.68 : /[\x00-\xff\uff61-\uff9f]/.test(ch) ? 0.57 : 1);
const units = (s) => [...s].reduce((n, ch) => n + cw(ch), 0);
const cut = (s, max) => { let n = 0, out = ""; for (const ch of s) { if (n + cw(ch) > max) break; n += cw(ch); out += ch; } return out; };
// 商品名を2行までに分ける。空白で切れるならそこで、なければ幅で。入りきらないときは「…」
const wrap2 = (s, max, atSpace = false) => {
  if (units(s) <= max) return [s];
  let a = cut(s, max);
  const sp = a.lastIndexOf(" ");
  if (sp > 0 && (atSpace || units(a.slice(0, sp)) >= max * 0.45)) a = a.slice(0, sp);
  else if (atSpace) return ["", "…"]; // 空白で切れない
  else { const m = a.match(/^(.*[^\x21-\x7e])[\x21-\x7e]+$/); if (m && /^[\x21-\x7e]/.test(s.slice(a.length)) && units(m[1]) >= max * 0.6) a = m[1]; } // 英数字のとちゅうで切らない
  while (a.length > 2 && /^[ぁぃぅぇぉっゃゅょァィゥェォッャュョー、。・）」』】〜～!?！？)\]]/.test(s.slice(a.length))) a = a.slice(0, -1); // 行のあたまに来てはいけない文字
  let b = s.slice(a.length).trim();
  if (units(b) > max) b = cut(b, max - 1).trim() + "…";
  return [a.trim(), b];
};
// 写真：白い余白を切ってから、枠の中に全体を入れる（切り抜かない）
const photo = async (id, w, h) => {
  // 余白さがしは自前で（sharp の trim は1枚 0.1秒近くかかる）。結果は、そのまま重ねられる形（raw）で返す
  const { data, info } = await sharp(src(id)).flatten({ background: "#ffffff" }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const iw = info.width, ih = info.height, ch = info.channels;
  let x0 = iw, y0 = ih, x1 = -1, y1 = -1;
  for (let y = 0; y < ih; y++) for (let x = 0, p = y * iw * ch; x < iw; x++, p += ch) {
    if (data[p] < 243 || data[p + 1] < 243 || data[p + 2] < 243) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  let img = sharp(data, { raw: { width: iw, height: ih, channels: ch } });
  if (x1 - x0 >= 8 && y1 - y0 >= 8) img = img.extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
  const r = await img.resize(w, h, { fit: "contain", background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
  return { input: r.data, raw: { width: r.info.width, height: r.info.height, channels: r.info.channels } };
};
const jpeg = (img, file) => img.jpeg({ quality: 80, mozjpeg: true }).toFile(file);
const logo = (x, y, size, anchor = "start") => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${LATIN}" font-weight="700" font-size="${size}"><tspan fill="#ff4f7b">GACHA</tspan><tspan fill="#3aa0ff" dx="${Math.round(size * 0.28)}">PLANET</tspan></text>`;

// ---------- 1) 商品のカード ----------
const relText = (it) => {
  const ws = weekStartOf(it);
  if (ws) { const w = weekInfo(ws); return `${w.m}月第${w.no}週`; }
  const m = String(it.release_note || "").match(/\d+月(上旬|中旬|下旬)/);
  if (m) return m[0];
  return it.release ? `${+it.release.slice(0, 4)}年${+it.release.slice(5, 7)}月` : "";
};
const itemInfo = (it) => {
  const name = String(it.name || "").replace(/【[^】]*】/g, "").replace(/\s+/g, " ").trim();
  const info = [Number(it.price) > 0 ? `¥${it.price}` : "", Number(it.lineup) > 0 ? `全${it.lineup}種` : "", relText(it)].filter(Boolean).join("・");
  return { name, info };
};
const TX = 640, TW = 520; // 文字の左はしと幅
const itemCard = async (it, file) => {
  const { name, info } = itemInfo(it);
  // 文字はできるだけ大きく。ただし、少し小さくすれば空白（ことばの切れ目）で2行に分けられるなら、そちらにする
  const SIZES = [58, 52, 46, 40, 36, 32], fits = (l) => !l.some((x) => x.endsWith("…"));
  const hard = SIZES.find((s) => fits(wrap2(name, TW / s))) || 32, soft = SIZES.find((s) => fits(wrap2(name, TW / s, true)));
  const size = soft && soft >= hard * 0.8 ? soft : hard, lines = wrap2(name, TW / size, size === soft);
  const lh = Math.round(size * 1.32), blockH = lines.length * lh, y0 = 250 - blockH / 2 + size * 0.86;
  const isz = Math.min(38, Math.floor((TW - 48) / Math.max(1, units(info)))), iw = Math.round(units(info) * isz + 48), iy = 250 + blockH / 2 + 34;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0f5"/><stop offset="1" stop-color="#e8f2ff"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<circle cx="1130" cy="60" r="120" fill="#ffc93c" fill-opacity="0.16"/><circle cx="1010" cy="610" r="170" fill="#3aa0ff" fill-opacity="0.09"/><circle cx="640" cy="20" r="70" fill="#ff4f7b" fill-opacity="0.09"/>
<rect x="34" y="34" width="562" height="562" rx="40" fill="#ffffff" stroke="#ffc2d2" stroke-width="4"/>
<rect x="${TX}" y="52" width="176" height="44" rx="22" fill="#ff4f7b"/>
<text x="${TX + 88}" y="83" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="24" fill="#ffffff">ガチャガチャ</text>
${lines.map((l, i) => `<text x="${TX}" y="${Math.round(y0 + i * lh)}" font-family="${FONT}" font-weight="700" font-size="${size}" fill="#1b1f5e">${esc(l)}</text>`).join("\n")}
${info ? `<rect x="${TX}" y="${Math.round(iy)}" width="${iw}" height="${isz + 30}" rx="${(isz + 30) / 2}" fill="#1b1f5e"/>
<text x="${TX + iw / 2}" y="${Math.round(iy + 15 + isz * 0.86)}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${isz}" fill="#ffffff">${esc(info)}</text>` : ""}
${logo(TX, 566, 30)}
<text x="${TX + 272}" y="565" font-family="${FONT}" font-weight="700" font-size="22" fill="#6b7194">ガチャプラネット</text>
</svg>`;
  await jpeg(sharp(Buffer.from(svg)).composite([{ ...(await photo(it.id, 514, 514)), left: 58, top: 58 }]), file);
};

// ---------- 2) まとめページのコラージュ ----------
const hubCard = async (p, ids, file) => {
  const n = ids.length >= 8 ? 8 : ids.length >= 6 ? 6 : Math.min(ids.length, 4);
  const cols = n === 8 ? 4 : n === 6 ? 3 : n, rows = n >= 6 ? 2 : 1;
  const BAND = 128, SIDE = 36, GAP = 16, top = BAND + 16, th = Math.floor((H - top - 20 - GAP * (rows - 1)) / rows), tw = Math.floor((W - SIDE * 2 - GAP * (cols - 1)) / cols);
  const tsz = Math.min(54, Math.floor(790 / Math.max(1, units(p.title))));
  const ssz = Math.min(28, Math.floor(790 / Math.max(1, units(p.sub || ""))));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b1f5e"/><stop offset="1" stop-color="#2a3190"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="#f2f5ff"/><rect width="${W}" height="${BAND}" fill="url(#g)"/>
<circle cx="1150" cy="14" r="64" fill="#ff4f7b" fill-opacity="0.35"/><circle cx="880" cy="120" r="30" fill="#3aa0ff" fill-opacity="0.3"/>
<text x="${SIDE + 4}" y="${p.sub ? 66 : 84}" font-family="${FONT}" font-weight="700" font-size="${tsz}" fill="#ffffff">${esc(p.title)}</text>
${p.sub ? `<text x="${SIDE + 6}" y="108" font-family="${FONT}" font-weight="700" font-size="${ssz}" fill="#ffc93c">${esc(p.sub)}</text>` : ""}
<rect x="${W - SIDE - 296}" y="34" width="296" height="60" rx="30" fill="#ffffff"/>
${logo(W - SIDE - 148, 74, 28, "middle")}
${Array.from({ length: n }, (_, i) => `<rect x="${SIDE + (i % cols) * (tw + GAP)}" y="${top + Math.floor(i / cols) * (th + GAP)}" width="${tw}" height="${th}" rx="24" fill="#ffffff" stroke="#dfe5fb" stroke-width="2"/>`).join("")}
</svg>`;
  const layers = [];
  for (let i = 0; i < n; i++) layers.push({ ...(await photo(ids[i], tw - 24, th - 24)), left: SIDE + (i % cols) * (tw + GAP) + 12, top: top + Math.floor(i / cols) * (th + GAP) + 12 });
  await jpeg(sharp(Buffer.from(svg)).composite(layers), file);
};

// ---------- ページの og:image を差し替える ----------
const setOg = (htmlFile, urlPath) => {
  if (!fs.existsSync(htmlFile)) return false;
  const h = fs.readFileSync(htmlFile, "utf8");
  const m = h.match(/<meta property="og:image" content="([^"]*)">/);
  if (!m) return false;
  let origin = "https://gachapla.com"; try { origin = new URL(m[1].replace(/&amp;/g, "&")).origin; } catch (e) {}
  const h2 = h.replace(/<meta property="og:image:(?:width|height)" content="[^"]*">\n?/g, "")
    .replace(m[0], `<meta property="og:image" content="${origin}${urlPath}">\n<meta property="og:image:width" content="${W}">\n<meta property="og:image:height" content="${H}">`);
  fs.writeFileSync(htmlFile, h2);
  return true;
};
// いくつか同時に作る
const pool = async (list, k, fn) => { let i = 0; await Promise.all(Array.from({ length: k }, async () => { while (i < list.length) { const x = list[i++]; await fn(x); } })); };

(async () => {
  const t0 = Date.now(), used = new Set(), KB = [];
  const stat = { made: 0, cached: 0, fail: 0, pages: 0 };
  const make = async (kind, key, hash, draw) => {
    const dir = path.join(CACHE, kind), name = `${key}.${hash}.jpg`, cf = path.join(dir, name), out = path.join(OUT, kind, `${key}.jpg`);
    fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.dirname(out), { recursive: true });
    used.add(`${kind}/${name}`);
    if (fs.existsSync(cf) && fs.statSync(cf).size > 0) stat.cached++;
    else { const tmp = `${cf}.tmp`; await draw(tmp); fs.renameSync(tmp, cf); stat.made++; }
    fs.copyFileSync(cf, out);
    KB.push(fs.statSync(out).size / 1024);
    return `/images/og/${kind}/${key}.jpg?v=${hash}`;
  };

  // 1) 商品（写真のある商品ぜんぶ）
  const only = (process.env.ONLY || "").split(",").filter(Boolean), limit = Number(process.env.LIMIT) || 0;
  let list = items.filter((it) => src(it.id) && fs.existsSync(path.join(DIST, "item", `${it.id}.html`)));
  if (only.length) list = list.filter((it) => only.includes(it.id));
  if (limit) list = list.slice(0, limit);
  await pool(list, 4, async (it) => {
    try {
      const { name, info } = itemInfo(it), hash = md5([VER, name, info, hashOfPic(it.id)].join("|")).slice(0, 10);
      const url = await make("item", it.id, hash, (f) => itemCard(it, f));
      if (setOg(path.join(DIST, "item", `${it.id}.html`), url)) stat.pages++;
    } catch (e) { stat.fail++; console.log(`⚠ ${it.id}: ${e.message}`); }
  });
  const nItem = stat.made + stat.cached, madeItem = stat.made;
  console.log(`共有画像（商品）：${nItem}件（新しく作った ${madeItem}・作りおき ${stat.cached}${stat.fail ? `・失敗 ${stat.fail}` : ""}）`);

  // 2) まとめページ（ビルドが書いた計画どおりに）
  let plan = {}; try { plan = JSON.parse(fs.readFileSync(path.join(ROOT, ".og-plan.json"), "utf8")); } catch (e) { console.log("まとめページの計画（.og-plan.json）がないので、コラージュは作りません"); }
  let nHub = 0, madeBefore = stat.made;
  for (const [rel, p] of Object.entries(plan)) {
    try {
      const ids = [...new Set(p.ids || [])].filter((id) => src(id)).slice(0, 8);
      if (ids.length < 2) continue; // 写真が足りないページは今までの画像のまま
      const use = ids.slice(0, ids.length >= 8 ? 8 : ids.length >= 6 ? 6 : 4);
      const key = rel.replace(/\.html$/, "").replace(/[^a-zA-Z0-9-]+/g, "-");
      const hash = md5([VER, p.title, p.sub, ...use.map(hashOfPic)].join("|")).slice(0, 10);
      const url = await make("hub", key, hash, (f) => hubCard(p, use, f));
      if (setOg(path.join(DIST, rel), url)) stat.pages++;
      nHub++;
    } catch (e) { stat.fail++; console.log(`⚠ ${rel}: ${e.message}`); }
  }
  console.log(`共有画像（まとめページ）：${nHub}件（新しく作った ${stat.made - madeBefore}）`);

  // 使わなくなった作りおきを消す（ためし運転のときは消さない）
  if (!only.length && !limit) for (const kind of ["item", "hub"]) { const d = path.join(CACHE, kind); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (!used.has(`${kind}/${f}`)) fs.unlinkSync(path.join(d, f)); }
  const avg = KB.length ? Math.round(KB.reduce((a, b) => a + b, 0) / KB.length) : 0, max = KB.length ? Math.round(Math.max(...KB)) : 0;
  console.log(`共有画像：og:image を差し替え ${stat.pages}ページ・1枚あたり平均 ${avg}KB（最大 ${max}KB）・${((Date.now() - t0) / 1000).toFixed(1)}秒`);
})();
