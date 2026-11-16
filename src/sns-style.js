// SNS 用の画像（src/social-img.js の 1200×1200・表紙・縦長ピン、src/reel.js の 1080×1920）で共通に使う「見た目の部品」。
// ねらい：ホビー雑誌のような落ち着いた見た目にそろえる。
//   ・背景は、商品写真の色みから作ったうすい色（A案）／深い色（B案）。星・虹色の枠・白い縁どり文字は使わない
//   ・写真は角を丸めたカードにして、やわらかい影を付ける。白い背景の写真は白いカードに、色のついたパッケージ写真はそのまま1枚のカードに
//   ・文字は Noto Sans CJK の Bold と Regular だけ（GitHub のランナーに入る fonts-noto-cjk にあるのはこの2つ。Black を指定すると手元と本番で太さが変わる）
// 切り替え：SNS_STYLE=B で B案（ダーク）になる。何も指定しなければ A案（ライト）。
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const sharp = require("sharp");
const ROOT = path.join(__dirname, "..");
const FONT = "Noto Sans CJK JP, Noto Sans JP, sans-serif";
const FONTS = { ja: FONT, en: FONT, ko: "Noto Sans CJK KR, Noto Sans KR, sans-serif", "zh-tw": "Noto Sans CJK TC, Noto Sans TC, sans-serif", "zh-cn": "Noto Sans CJK SC, Noto Sans SC, sans-serif" };
// 日本語フォントがあるか（ないと文字が□になるので、そのときは日本語を描かない）
const HAS_JP = (() => { try { return /Noto Sans (CJK )?JP/i.test(cp.execSync("fc-list", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch (e) { return false; } })();
const STYLE = String(process.env.SNS_STYLE || "A").toUpperCase() === "B" ? "B" : "A";
const INK = "#1b1f5e", PINK = "#ff4f7b", GOLD = "#ffc93c";

const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 絵文字は画像に入れない（ランナーに絵文字フォントがなく□になる。見た目も安っぽくなる）
const noEmoji = (s) => String(s || "").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{265F}\u{2662}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").trim();
const cleanName = (s) => noEmoji(String(s || "").replace(/【[^】]*】/g, "").replace(/\s+/g, " ").trim());

// ---------- 文字 ----------
// 文字の幅のめやす（全角＝1、半角の大文字＝0.68、数字＝0.6、そのほかの半角＝0.57、空白＝0.25）
const cw = (ch) => (ch === " " ? 0.25 : /[A-Z]/.test(ch) ? 0.68 : /[0-9¥]/.test(ch) ? 0.6 : /[\x00-\xff｡-ﾟ]/.test(ch) ? 0.57 : 1);
const units = (s) => [...String(s)].reduce((n, ch) => n + cw(ch), 0);
const cut = (s, max) => { let n = 0, out = ""; for (const ch of s) { if (n + cw(ch) > max) break; n += cw(ch); out += ch; } return out; };
// 2行までに分ける。空白で切れるならそこで、なければ幅で。入りきらないときは「…」
const wrap2 = (s, max, atSpace = false, tight = false) => { // tight＝空白にこだわらず、幅いっぱいまで詰める（長い名前の最後の手段）
  if (units(s) <= max) return [s];
  let a = cut(s, max);
  const sp = tight ? -1 : a.lastIndexOf(" ");
  if (sp > 0 && (atSpace || units(a.slice(0, sp)) >= max * 0.45)) a = a.slice(0, sp);
  else if (atSpace) return ["", "…"];
  else { const m = a.match(/^(.*[^\x21-\x7e])[\x21-\x7e]+$/); if (m && /^[\x21-\x7e]/.test(s.slice(a.length)) && units(m[1]) >= max * 0.6) a = m[1]; } // 英数字のとちゅうで切らない
  while (a.length > 2 && /^[ぁぃぅぇぉっゃゅょァィゥェォッャュョー、。・）」』】〜～!?！？)\]]/.test(s.slice(a.length))) a = a.slice(0, -1); // 行のあたまに来てはいけない文字
  let b = s.slice(a.length).trim();
  if (units(b) > max) b = cut(b, max - 1).trim() + "…";
  return [a.trim(), b];
};
// 商品名を幅 maxW に入れる：1行で入る大きさ（one）があればそれ、なければ2行（two）。{ size, lines }
const fitText = (s, maxW, one, two) => {
  const w = maxW * 0.97; // 幅はめやすなので少し余裕を見る
  for (const z of one) if (units(s) * z <= w) return { size: z, lines: [s] };
  const fits = (l) => !l.some((x) => x.endsWith("…"));
  const min = two[two.length - 1];
  const hard = two.find((z) => fits(wrap2(s, w / z))) || min, soft = two.find((z) => fits(wrap2(s, w / z, true)));
  const size = soft && soft >= hard * 0.85 ? soft : hard;
  const lines = wrap2(s, w / size, size === soft);
  return { size, lines: fits(lines) ? lines : wrap2(s, w / min, false, true) };
};
const text = (t, x, y, size, fill, o = {}) => `<text x="${Math.round(x)}" y="${Math.round(y)}" text-anchor="${o.anchor || "start"}" font-family="${o.font || FONT}" font-weight="${o.weight || 700}" font-size="${size}" fill="${fill}"${o.ls ? ` letter-spacing="${o.ls}"` : ""}${o.op ? ` fill-opacity="${o.op}"` : ""}>${esc(t)}</text>`;

// ---------- 色 ----------
const hex = (h, s, l) => { // HSL → #rrggbb
  s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, "0");
  return `#${f(0)}${f(8)}${f(4)}`;
};
// 写真の色み（hue。null なら色みなし）から配色を作る
const palette = (hue, style = STYLE) => {
  const n = hue == null;
  // B案はいつもブランドの紺（写真の色みで暗い色を作ると、黄色やオレンジが茶色くにごるため）
  if (style === "B") return { style, bg1: "#2b3394", bg2: "#0e1136", ink: "#ffffff", sub: "#c3c8e0", accent: GOLD, chipBg: "#ffffff", chipFg: "#0e1136", chip2Bg: "none", chip2Fg: "#ffffff", chip2Stroke: "#ffffff", shadow: "#000000", shOp: 0.5, card: "#ffffff" };
  return { style, bg1: n ? "#f7f4f0" : hex(hue, 48, 95), bg2: n ? "#ebe6df" : hex(hue, 42, 88), ink: INK, sub: "#6b7194", accent: PINK, chipBg: INK, chipFg: "#ffffff", chip2Bg: "#ffffff", chip2Fg: INK, chip2Stroke: "none", shadow: n ? "#3b3550" : hex(hue, 40, 22), shOp: 0.26, card: "#ffffff" };
};
// 背景：A案＝うすい色の上下グラデーション、B案＝中心がほんのり明るい深い色。影のぼかしもここで定義
const bgSvg = (W, H, pal, cx = 0.5, cy = 0.45) => `<defs>${pal.style === "B"
  ? `<radialGradient id="bg" cx="${cx}" cy="${cy}" r="0.75"><stop offset="0" stop-color="${pal.bg1}"/><stop offset="1" stop-color="${pal.bg2}"/></radialGradient>`
  : `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.bg1}"/><stop offset="1" stop-color="${pal.bg2}"/></linearGradient>`}</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
// カードの下の影（rects＝[{x,y,w,h}]）。大きくやわらかい影＋近くの小さい影の2枚重ね。
// SVG のぼかしを原寸でやると1枚 0.7秒かかるので、1/8 の大きさで描いてから引きのばす（影はぼやけているので見た目は同じ）。composite に渡せるレイヤーを返す
async function shadowLayer(W, H, rects, pal, rad = 36, k = 1) {
  const q = 8, w = Math.ceil(W / q), h = Math.ceil(H / q), f = (v) => (v / q).toFixed(2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><filter id="a" x="-40%" y="-40%" width="180%" height="190%"><feGaussianBlur stdDeviation="${f(W / 50)}"/></filter><filter id="b" x="-40%" y="-40%" width="180%" height="190%"><feGaussianBlur stdDeviation="${f(W / 110)}"/></filter></defs>${rects.map((r) => `<rect x="${f(r.x + 10 * k)}" y="${f(r.y + 26 * k)}" width="${f(r.w - 20 * k)}" height="${f(r.h - 10 * k)}" rx="${f(rad)}" fill="${pal.shadow}" fill-opacity="${pal.shOp}" filter="url(#a)"/><rect x="${f(r.x + 4)}" y="${f(r.y + 6)}" width="${f(r.w - 8)}" height="${f(r.h)}" rx="${f(rad)}" fill="${pal.shadow}" fill-opacity="${pal.shOp * 0.55}" filter="url(#b)"/>`).join("")}</svg>`;
  // いったん小さいまま画像にしてから引きのばす（SVG のまま resize すると、sharp が原寸で描き直してしまい遅い）
  const sm = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = await sharp(sm.data, { raw: { width: sm.info.width, height: sm.info.height, channels: sm.info.channels } }).resize(W, H, { fit: "fill", kernel: "cubic" }).raw().toBuffer({ resolveWithObject: true });
  return { ...rawLayer(r), left: 0, top: 0 };
}

// ---------- 写真 ----------
const srcOf = (id) => ["webp", "jpg", "jpeg", "png"].map((e) => path.join(ROOT, "images", `${id}.${e}`)).find((f) => fs.existsSync(f));
// 写真を読む：白い余白を切る範囲（box）・白い背景の写真か（white）・ふちの色（edge）・色み（hue）を調べる
async function loadPhoto(id) {
  const { data, info } = await sharp(srcOf(id)).flatten({ background: "#ffffff" }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const iw = info.width, ih = info.height, ch = info.channels;
  const isW = (p) => data[p] >= 243 && data[p + 1] >= 243 && data[p + 2] >= 243;
  let x0 = iw, y0 = ih, x1 = -1, y1 = -1;
  for (let y = 0; y < ih; y++) for (let x = 0, p = y * iw * ch; x < iw; x++, p += ch) if (!isW(p)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 - x0 < 8 || y1 - y0 < 8) { x0 = 0; y0 = 0; x1 = iw - 1; y1 = ih - 1; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  // ふち（外から2px内側の1周）：白がどれくらいあるか、白でないところの平均の色
  let wn = 0, n = 0, er = 0, eg = 0, eb = 0, en = 0;
  const edge = (x, y) => { const p = (y * iw + x) * ch; n++; if (isW(p)) wn++; else { er += data[p]; eg += data[p + 1]; eb += data[p + 2]; en++; } };
  const ix0 = Math.min(x0 + 2, x1), ix1 = Math.max(x1 - 2, x0), iy0 = Math.min(y0 + 2, y1), iy1 = Math.max(y1 - 2, y0);
  for (let x = ix0; x <= ix1; x += 2) { edge(x, iy0); edge(x, iy1); }
  for (let y = iy0; y <= iy1; y += 2) { edge(ix0, y); edge(ix1, y); }
  const white = wn / n > 0.5;
  const h2 = (v) => Math.round(v).toString(16).padStart(2, "0");
  // 色み：あざやかな点の色相を、あざやかさで重みを付けて平均（色相は円なのでベクトルで足す）。ばらばら（カラフルな箱）なら「色みなし」
  let vx = 0, vy = 0, sw = 0, cnt = 0; const st = Math.max(1, Math.floor(Math.min(bw, bh) / 56));
  for (let y = y0; y <= y1; y += st) for (let x = x0; x <= x1; x += st) {
    const p = (y * iw + x) * ch, r = data[p] / 255, g = data[p + 1] / 255, b = data[p + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; cnt++;
    if (mx < 0.25 || d < 0.12 || d / mx < 0.2) continue;
    const hh = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60, w = (d / mx) * d;
    vx += Math.cos((hh * Math.PI) / 180) * w; vy += Math.sin((hh * Math.PI) / 180) * w; sw += w;
  }
  const len = Math.hypot(vx, vy), hue = sw / cnt > 0.012 && len / sw > 0.3 ? ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360 : null;
  return { id, data, raw: { width: iw, height: ih, channels: ch }, box: { left: x0, top: y0, width: bw, height: bh }, white, hue, edge: white || !en ? "#ffffff" : `#${h2(er / en)}${h2(eg / en)}${h2(eb / en)}` };
}
const mask = (w, h, r) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`);
const rawLayer = (r) => ({ input: r.data, raw: { width: r.info.width, height: r.info.height, channels: r.info.channels } });
// 写真のカード：枠（bw×bh）の中に、写真の形のままできるだけ大きく（切らない）。白い背景の写真は白いカードに少し余白を付けてのせる。
// 返り値：{ layer（sharp の composite にそのまま渡せる）, w, h } ※置く場所（left/top）は呼ぶ側で決める
async function photoCard(p, bw, bh, rad = 36) {
  const pad = p.white ? Math.round(Math.min(bw, bh) * 0.03) : 0;
  const k = Math.min((bw - pad * 2) / p.box.width, (bh - pad * 2) / p.box.height);
  const pw = Math.max(8, Math.round(p.box.width * k)), ph = Math.max(8, Math.round(p.box.height * k)), w = pw + pad * 2, h = ph + pad * 2;
  let img = sharp(p.data, { raw: p.raw }).extract(p.box).resize(pw, ph, { fit: "fill", kernel: "lanczos3" });
  if (k > 1.15) img = img.sharpen({ sigma: 0.6 }); // 元の写真が小さいので、拡大したぶん少しだけくっきりさせる
  if (pad) img = img.extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#ffffff" });
  const r = await img.ensureAlpha().composite([{ input: mask(w, h, rad), blend: "dest-in" }]).raw().toBuffer({ resolveWithObject: true });
  return { layer: rawLayer(r), w, h };
}
// 決まった大きさのタイル（コラージュ用）：写真は切らずに全体を入れる。余ったところは、白い背景の写真なら白、パッケージ写真なら同じ写真を大きくぼかしたもので埋める（白い箱に入れたように見せない）
async function tile(p, w, h, rad = 28) {
  const src = () => sharp(p.data, { raw: p.raw }).extract(p.box);
  let img;
  if (p.white) {
    const pad = Math.round(Math.min(w, h) * 0.035);
    img = src().resize(w - pad * 2, h - pad * 2, { fit: "contain", background: "#ffffff", kernel: "lanczos3" }).extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#ffffff" });
  } else {
    const k = Math.min(w / p.box.width, h / p.box.height), pw = Math.min(w, Math.round(p.box.width * k)), ph = Math.min(h, Math.round(p.box.height * k));
    if (w - pw < 6 && h - ph < 6) img = src().resize(w, h, { fit: "fill", kernel: "lanczos3" });
    else {
      const fg = await src().resize(pw, ph, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
      const sm = await src().resize(Math.ceil(w / 8), Math.ceil(h / 8), { fit: "cover" }).blur(2.5).raw().toBuffer({ resolveWithObject: true }); // 小さくしてからぼかす（速い）
      const out = await sharp(sm.data, { raw: { width: sm.info.width, height: sm.info.height, channels: sm.info.channels } }).resize(w, h, { fit: "fill", kernel: "cubic" }).modulate({ brightness: 1.04, saturation: 0.85 })
        .composite([{ ...rawLayer(fg), left: Math.round((w - pw) / 2), top: Math.round((h - ph) / 2) }]).raw().toBuffer({ resolveWithObject: true });
      img = sharp(out.data, { raw: { width: out.info.width, height: out.info.height, channels: out.info.channels } });
    }
  }
  const r = await img.ensureAlpha().composite([{ input: mask(w, h, rad), blend: "dest-in" }]).raw().toBuffer({ resolveWithObject: true });
  return rawLayer(r);
}
// モザイク（リールの表紙で中身を隠す）：写真を 36×36 のあらい点にしてから大きくする
async function mosaicTile(p, w, h, rad = 34) {
  const small = await sharp(p.data, { raw: p.raw }).extract(p.box).resize(36, 36, { fit: "cover" }).raw().toBuffer({ resolveWithObject: true });
  const r = await sharp(small.data, { raw: { width: 36, height: 36, channels: small.info.channels } }).resize(w, h, { kernel: "nearest" }).ensureAlpha().composite([{ input: mask(w, h, rad), blend: "dest-in" }]).raw().toBuffer({ resolveWithObject: true });
  return rawLayer(r);
}

// ---------- 小さな部品 ----------
// チップ（値段・種類）。1つ目は濃い色でぬり、2つ目からは白（A案）／線だけ（B案）。make(x, y) の x は左はし（anchor="end" なら右はし、"middle" なら中心）
const chips = (labels, pal, size = 32, h = 60, gap = 12) => {
  const px = Math.round(size * 0.68), ws = labels.map((t) => Math.round(units(t) * size + px * 2)), total = ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, labels.length - 1);
  return { w: total, h, make: (x, y, anchor = "start") => { let cx = anchor === "end" ? x - total : anchor === "middle" ? x - total / 2 : x; return labels.map((t, i) => { const s = `<rect x="${Math.round(cx) + (i ? 1.5 : 0)}" y="${y + (i ? 1.5 : 0)}" width="${ws[i] - (i ? 3 : 0)}" height="${h - (i ? 3 : 0)}" rx="${(h - (i ? 3 : 0)) / 2}" fill="${i ? pal.chip2Bg : pal.chipBg}"${i && pal.chip2Stroke !== "none" ? ` stroke="${pal.chip2Stroke}" stroke-opacity="0.7" stroke-width="3"` : ""}/>${text(t, cx + ws[i] / 2, y + h / 2 + size * 0.36, size, i ? pal.chip2Fg : pal.chipFg, { anchor: "middle" })}`; cx += ws[i] + gap; return s; }).join(""); } };
};
const itemChips = (it) => [Number(it.price) > 0 ? `¥${it.price}` : "", Number(it.lineup) > 0 ? (HAS_JP ? `全${it.lineup}種` : `${it.lineup} TYPES`) : ""].filter(Boolean);
// サイト名（小さく）：輪っかのある星のマーク＋ GACHA PLANET ＋ gachapla.com。x は左はし（anchor="end" なら右はし、"middle" なら中心）、y は文字の下の線
const brand = (x, y, size, pal, anchor = "start", url = true) => {
  const ls = size * 0.14, w1 = units("GACHA PLANET") * size + ls * 11.5, w2 = url ? size * 0.9 + units("gachapla.com") * size * 0.92 : 0, ic = size * 1.5, total = ic + w1 + w2;
  const x0 = anchor === "end" ? x - total : anchor === "middle" ? x - total / 2 : x, cx = x0 + size * 0.5, cy = y - size * 0.36, r = size * 0.36;
  return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${pal.accent}"/><ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(r * 1.75).toFixed(1)}" ry="${(r * 0.5).toFixed(1)}" fill="none" stroke="${pal.ink}" stroke-width="${Math.max(1.5, size * 0.09).toFixed(1)}" transform="rotate(-18 ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`
    + text("GACHA PLANET", x0 + ic, y, size, pal.ink, { ls: ls.toFixed(1) }) + (url ? text("gachapla.com", x0 + ic + w1 + size * 0.9, y, Math.round(size * 0.92), pal.sub, { weight: 400 }) : "");
};
// 発売時期のラベル（「11月第3週」「11月下旬」「2026年11月」）
const { weekStartOf, weekInfo } = require("./release-week");
const relLabel = (it) => {
  const ws = weekStartOf(it);
  if (ws) { const w = weekInfo(ws); return `${w.m}月第${w.no}週`; }
  const m = String(it.release_note || "").match(/\d+月(上旬|中旬|下旬)/);
  if (m) return m[0];
  return it.release ? `${+it.release.slice(0, 4)}年${+it.release.slice(5, 7)}月` : "";
};

module.exports = { sharp, ROOT, FONT, FONTS, HAS_JP, STYLE, INK, PINK, GOLD, esc, noEmoji, cleanName, units, wrap2, fitText, text, hex, palette, bgSvg, shadowLayer, srcOf, loadPhoto, photoCard, tile, mosaicTile, mask, chips, itemChips, brand, relLabel };
