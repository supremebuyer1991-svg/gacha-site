// Instagram リール用の縦長動画（1080×1920・約17秒）を作る。サイトを作ったあと（deploy の SNS画像の手順のあと）に動く。
// 中身：表紙 → 商品8つ（写真を大きく・名前・値段・全何種）→ しめ。見た目は src/sns-style.js の部品で、SNS用の画像とそろえる。音はこのファイルで作るオリジナルのピコピコ音（著作権の心配なし）。
// 出力：dist/images/social/reel-{日付}.mp4（TikTok 用の音なし版 reel-{日付}-silent.mp4、写真スライド用の reel-{日付}-s1.jpg〜 も） と dist/data/social-reel.json（social.js が Instagram に投稿するときに読む）
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
let sharp, S; try { sharp = require("sharp"); S = require("./sns-style"); } catch (e) { console.log("sharp がないのでリールは作りません"); process.exit(0); }
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "dist", "images", "social"), TMP = path.join(ROOT, ".reel-tmp");
const W = 1080, H = 1920;
// 同じ日に作り直すと名前が同じになり、TikTok・Instagram が前の画像を使ってしまうので、中身から作った印を URL に付ける
const ver = (f) => require("crypto").createHash("md5").update(fs.readFileSync(f)).digest("hex").slice(0, 8);
const clean = (s) => String(s || "").replace(/【[^】]*】/g, "").replace(/\s+/g, " ").trim();
// 見た目の部品（配色・写真のカード・チップ・文字）は src/sns-style.js（SNS用の 1200×1200 画像と共通）。SNS_STYLE=B で B案（ダーク）
// TikTok の実際の画面で測った「見える範囲」：上の検索欄の下〜下の説明文の上＝ y 360〜1555 くらい。大事なもの（写真・商品名・値段）はこの中（SAFE_T〜SAFE_B）に置く。
// その外（上の y 300〜350、下の y 1650 あたり）には、隠れてもいいもの（サイト名・「おすすめ 1/8」・進みぐあいの線）だけ。
const SAFE_T = 372, SAFE_B = 1548, SX = 70;
const svgOpen = (pal) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${S.bgSvg(W, H, pal, 0.5, 0.45)}`;
// 上のほそい帯：左にサイト名、右に「おすすめ 01/08」、その下に進みぐあいの線（n 本のうち i 本目が今）
const head = (pal, right, i, n) => {
  const g = 8, sw = n ? (W - SX * 2 - g * (n - 1)) / n : 0;
  return `${S.brand(SX, 326, 24, pal, "start", false)}${right ? S.text(right, W - SX, 326, 26, pal.ink, { anchor: "end", ls: 1 }) : ""}`
    + Array.from({ length: n || 0 }, (_, k) => `<rect x="${(SX + k * (sw + g)).toFixed(1)}" y="344" width="${sw.toFixed(1)}" height="6" rx="3" fill="${pal.ink}" fill-opacity="${k === i ? 1 : 0.16}"/>`).join("");
};
const foot = (pal) => S.text("gachapla.com", W / 2, 1650, 30, pal.sub, { anchor: "middle", ls: 1.5, weight: 400 });

async function cover(title, sub, ids, file, word) {
  // 中身は見せずに「なにが出る？」と思わせる表紙：タイトル → 「ラストの〇〇が可愛すぎる♡」 → モザイクの写真＋「？」
  const pal = S.palette(S.STYLE === "B" ? null : 342), t = S.noEmoji(title), tsz = Math.min(88, Math.floor(940 / S.units(t)));
  const chip = S.chips([sub], pal, 30, 54), tease = S.STYLE === "B" ? "#ff9dbb" : S.PINK;
  const w1 = word ? `ラストの${word}が` : "", top = word ? 744 : 600, g = 20, T = Math.floor((SAFE_B - top - g) / 2), x0 = Math.round((W - T * 2 - g) / 2);
  const rects = [], layers = [];
  for (let i = 0; i < Math.min(4, ids.length); i++) {
    const x = x0 + (i % 2) * (T + g), y = top + Math.floor(i / 2) * (T + g);
    rects.push({ x, y, w: T, h: T });
    layers.push({ ...(await S.mosaicTile(await S.loadPhoto(ids[i]), T, T, 34)), left: x, top: y });
  }
  const svg = Buffer.from(`${svgOpen(pal)}${head(pal, "", 0, 0)}
${chip.make(W / 2, SAFE_T + 4, "middle")}
${S.text(t, W / 2, word ? 530 : 540, tsz, pal.ink, { anchor: "middle" })}
${word ? S.text(w1, W / 2, 612, Math.min(50, Math.floor(900 / S.units(w1))), pal.ink, { anchor: "middle" }) + S.text("可愛すぎる♡", W / 2, 708, 88, tease, { anchor: "middle" }) : ""}
${foot(pal)}</svg>`);
  // 「？」の丸はモザイクの上に重ねる
  const q = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects.map((r) => `<circle cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2 + 3}" r="48" fill="#1b1f5e" fill-opacity="0.18"/><circle cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" r="46" fill="#ffffff"/>${S.text("?", r.x + r.w / 2, r.y + r.h / 2 + 21, 58, S.INK, { anchor: "middle" })}`).join("")}</svg>`);
  await sharp(svg).composite([await S.shadowLayer(W, H, rects, pal, 34, 0.7), ...layers, { input: q, left: 0, top: 0 }]).png().toFile(file);
}
async function card(it, i, n, file, top) {
  // 下から順に場所を決める：値段と種類のチップ → 商品名（1行で入れば1行、だめなら2行）→ 残りの高さをぜんぶ写真に。
  // 写真は白い余白を付けず、写真の形のまま最大 1000×（残り）に合わせて大きく。背景は写真の色みから作る
  const p = await S.loadPhoto(it.id), pal = S.palette(p.hue);
  const cl = S.itemChips(it), ch = S.chips(cl, pal, 40, 76, 14);
  const name = S.HAS_JP ? S.cleanName(it.name) : "", ft = name ? S.fitText(name, 880, [60, 56, 52, 48], [50, 46, 42, 38]) : { size: 0, lines: [] };
  const lh = Math.round(ft.size * 1.32), chipsTop = SAFE_B - ch.h, nameBottom = cl.length ? chipsTop - 22 : SAFE_B, nameTop = nameBottom - ft.lines.length * lh;
  const boxY = SAFE_T + 6, boxH = nameTop - 30 - boxY, boxW = 1000;
  const c = await S.photoCard(p, boxW, boxH, 40), cx = Math.round((W - c.w) / 2), cy = boxY + Math.round((boxH - c.h) / 2);
  const num = (v) => String(v).padStart(2, "0");
  const svg = Buffer.from(`${svgOpen(pal)}${head(pal, S.HAS_JP ? `${top} ${num(i + 1)}/${num(n)}` : `${num(i + 1)}/${num(n)}`, i, n)}
${ft.lines.map((l, j) => S.text(l, W / 2, nameTop + j * lh + lh / 2 + ft.size * 0.36, ft.size, pal.ink, { anchor: "middle" })).join("")}
${cl.length ? ch.make(W / 2, chipsTop, "middle") : ""}${foot(pal)}</svg>`);
  await sharp(svg).composite([await S.shadowLayer(W, H, [{ x: cx, y: cy, w: c.w, h: c.h }], pal, 40), { ...c.layer, left: cx, top: cy }]).png().toFile(file);
}
async function outro(file, ids) {
  // しめ：問いかけ → 今日の商品の小さな一覧 → プロフィールへの案内
  const pal = S.palette(S.STYLE === "B" ? null : 342), T = 216, g = 16, cols = 4, list = ids.slice(0, 8), rows = Math.ceil(list.length / cols), top = 760, layers = [], rects = [];
  for (let k = 0; k < list.length; k++) {
    const inRow = Math.min(cols, list.length - Math.floor(k / cols) * cols), x0 = Math.round((W - inRow * T - (inRow - 1) * g) / 2);
    const x = x0 + (k % cols) * (T + g), y = top + Math.floor(k / cols) * (T + g);
    rects.push({ x, y, w: T, h: T }); layers.push({ ...(await S.tile(await S.loadPhoto(list[k]), T, T, 22)), left: x, top: y });
  }
  const y2 = top + rows * (T + g) + 70;
  const svg = Buffer.from(`${svgOpen(pal)}${head(pal, "", 0, 0)}
${S.text("どれを回したい？", W / 2, 560, 96, pal.ink, { anchor: "middle" })}
${S.text("コメントで教えてね", W / 2, 660, 54, S.STYLE === "B" ? "#ff9dbb" : S.PINK, { anchor: "middle" })}
${S.text("発売日・近くの在庫店は", W / 2, y2, 42, pal.ink, { anchor: "middle" })}
${S.text("プロフィールのリンクから", W / 2, y2 + 62, 42, pal.ink, { anchor: "middle" })}
${S.brand(W / 2, y2 + 150, 30, pal, "middle")}</svg>`);
  await sharp(svg).composite([await S.shadowLayer(W, H, rects, pal, 22, 0.5), ...layers]).png().toFile(file);
}

// オリジナルのBGM（矩形波のメロディ＋ベース＋カプセルの「ポン」）。WAV を書き出す
function music(file, secs, beats) {
  const sr = 44100, N = Math.round(sr * secs), buf = new Float32Array(N), bpm = 138, sb = 60 / bpm / 2; // 8分音符
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const mel = [72, 76, 79, 76, 81, 79, 76, 72, 74, 77, 81, 77, 79, 76, 72, 0, 72, 76, 79, 84, 83, 79, 76, 74, 72, 74, 76, 79, 76, 74, 72, 0];
  const bass = [48, 48, 55, 55, 53, 53, 55, 55];
  const tone = (start, dur, f, vol, type) => { const s0 = Math.round(start * sr), n = Math.round(dur * sr); for (let i = 0; i < n && s0 + i < N; i++) { const t = i / sr, env = Math.min(1, i / 300) * Math.max(0, 1 - i / n) ** 1.5; const ph = (t * f) % 1; const v = type === "sq" ? (ph < 0.5 ? 1 : -1) : type === "tri" ? 4 * Math.abs(ph - 0.5) - 1 : Math.sin(2 * Math.PI * ph); buf[s0 + i] += v * vol * env; } };
  for (let k = 0, t = 0; t < secs - 0.2; k++, t += sb) { const m = mel[k % mel.length]; if (m) tone(t, sb * 0.9, hz(m), 0.09, "sq"); if (k % 2 === 0) tone(t, sb * 1.8, hz(bass[(k / 2) % bass.length]), 0.16, "tri"); }
  for (const b of beats) { const s0 = Math.round(b * sr); for (let i = 0; i < sr * 0.12 && s0 + i < N; i++) { const t = i / sr, f = 900 - 5000 * t; buf[s0 + i] += Math.sin(2 * Math.PI * f * t) * 0.35 * (1 - t / 0.12); } }
  const fade = sr * 0.8; for (let i = 0; i < fade; i++) buf[N - 1 - i] *= i / fade;
  const out = Buffer.alloc(44 + N * 2); out.write("RIFF", 0); out.writeUInt32LE(36 + N * 2, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, out);
}

(async () => {
  try {
    const x = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "data", "x.json"), "utf8"));
    const seen = new Set(), pool = [];
    const has = (id) => fs.existsSync(path.join(ROOT, "images", `${id}.webp`));
    // 何を紹介するか（ユーザーの指定 11/10）：
    //   1・2枚目と最後の1枚＝人気の系統（サンリオ・たまごっち・ディズニー・ちいかわ・人気のめじるしアクセサリー）、間の5枚＝いい感じのガチャ
    //   商品の範囲：月の1日＝今月発売／15日＝来月発売／月曜＝今週発売／ほかの日＝過去〜これからの全部（毎日なるべくかぶらないように順番に）
    const items = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "items.json"), "utf8"));
    let votes = {}; try { votes = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "votes.json"), "utf8")) || {}; } catch (e) {}
    const score = (i) => (Number(votes[i.id]) || 0) * 10 + (i.popularity || 0);
    const ym = x.today.slice(0, 7), d0 = new Date(x.today + "T00:00:00Z"); d0.setUTCMonth(d0.getUTCMonth() + 1); const ym2 = d0.toISOString().slice(0, 7);
    const dom = +x.today.slice(8, 10), dow = new Date(x.today + "T00:00:00Z").getUTCDay();
    const weekIds = new Set(((x.week && x.week.items) || []).map((i) => i.id));
    const day = Math.floor(Date.parse(x.today + "T00:00:00Z") / 864e5);
    const MODE = process.env.REEL_MODE || (dom === 1 ? "month" : dom === 15 ? "next" : dow === 1 ? "week" : "daily");
    const range = items.filter((i) => has(i.id) && (MODE === "week" ? weekIds.has(i.id) : MODE === "month" ? i.release === ym : MODE === "next" ? i.release === ym2 : true));
    const CATS = [
      { w: "サンリオ", re: /サンリオ|ハローキティ|マイメロ|クロミ|シナモロール|ポムポムプリン|ポチャッコ|けろけろけろっぴ|ハンギョドン|タキシードサム/ },
      { w: "たまごっち", re: /たまごっち/ },
      { w: "ディズニー", re: /ディズニー|Disney|ミッキー|ミニー|ピクサー|スティッチ|トイ・ストーリー|TOY STORY|くまのプーさん/ },
      { w: "ちいかわ", re: /ちいかわ|ハチワレ/ },
      { w: "めじるしアクセサリー", re: /めじるしアクセサリー/ },
    ];
    const catOf = (i) => CATS.findIndex((c) => c.re.test(i.name));
    const add = (it) => { if (pool.length < 8 && it && it.id && !seen.has(it.id) && has(it.id)) { seen.add(it.id); pool.push(it); } };
    const h = (str) => { let v = 2166136261; for (const c of str) v = Math.imul(v ^ c.codePointAt(0), 16777619) >>> 0; return v; };
    // 系統ごとの並び：人気順（めじるしは人気の上位から）。毎日ずらして使う
    const lists = CATS.map((c, ci) => range.filter((i) => catOf(i) === ci).sort((p, q) => score(q) - score(p) || p.id.localeCompare(q.id)));
    const pickCat = (ci, k) => { const L = lists[ci]; if (!L.length) return null; const n = MODE === "daily" ? Math.min(L.length, ci === 4 ? 40 : L.length) : L.length; return L[(Math.floor(day / 5) * 1 + k) % n]; };
    const favPicks = [];
    for (let k = 0, tries = 0; favPicks.length < 3 && tries < 15; tries++, k++) {
      const ci = (day + k) % 5; const it = pickCat(ci, Math.floor(k / 5)); if (it && !favPicks.includes(it)) favPicks.push(it);
    }
    // 間の5枚：人気の系統以外から、人気の高いほうの半分くらいを候補に、名前で決まる順番で日ごとに5つずつ進める（同じシリーズ名が続かないように）
    let mid = range.filter((i) => catOf(i) < 0).sort((p, q) => score(q) - score(p));
    if (MODE === "daily") mid = mid.slice(0, Math.max(60, Math.floor(mid.length / 2)));
    mid.sort((p, q) => h(p.id) - h(q.id));
    const midPicks = [], heads = new Set();
    const st = mid.length ? (MODE === "daily" ? (day * 5) % mid.length : 0) : 0;
    for (let k = 0; k < mid.length && midPicks.length < 5; k++) { const it = mid[(st + k) % mid.length]; const hd = clean(it.name).slice(0, 5); if (heads.has(hd)) continue; heads.add(hd); midPicks.push(it); }
    for (const it of [favPicks[0], favPicks[1], ...midPicks, favPicks[2]]) add(it);
    for (const it of [...lists.flat(), ...mid]) add(it); // 足りなければ埋める
    const lastFav = favPicks[2] || null;
    let title, sub, top, word = "", kw = [];
    title = MODE === "week" ? "今週発売のガチャが熱い🔥" : MODE === "month" ? "今月発売のガチャが熱い🔥" : MODE === "next" ? "来月発売のガチャが熱い🔥" : "今日のおすすめガチャ🔥";
    sub = MODE === "week" && x.week ? `${x.week.from}〜${x.week.to}` : MODE === "month" ? `${+ym.slice(5)}月発売` : MODE === "next" ? `${+ym2.slice(5)}月発売` : `${+x.today.slice(5, 7)}/${dom}`;
    top = MODE === "week" ? "今週発売" : MODE === "month" ? "今月発売" : MODE === "next" ? "来月発売" : "おすすめ";
    // 最後の1枚は表紙で「ラストの〇〇が可愛すぎる♡」と予告する
    if (lastFav && pool[pool.length - 1] === lastFav) { word = CATS[catOf(lastFav)].w; kw = [lastFav]; }
    if (pool.length < 3) { console.log("リール：写真のある商品が足りないので作りません"); return; }
    fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
    const frames = [];
    const main = pool.filter((i) => !kw.includes(i));
    await cover(title, sub, pool.map((i) => i.id), path.join(TMP, "f0.png"), word); frames.push([path.join(TMP, "f0.png"), 1.8]);
    for (let i = 0; i < main.length; i++) { const f = path.join(TMP, `f${i + 1}.png`); await card(main[i], i, pool.length, f, top); frames.push([f, 2.0]); }
    if (kw.length) {
      for (let j = 0; j < kw.length; j++) { const f = path.join(TMP, `fk${j}.png`); await card(kw[j], main.length + j, pool.length, f, top); frames.push([f, 2.0]); }
    }
    await outro(path.join(TMP, "fz.png"), pool.map((i) => i.id)); frames.push([path.join(TMP, "fz.png"), 2.2]);
    // 切り替え（0.28秒のスライド）でつなぐ
    const T = 0.28, total = frames.reduce((s, [, d]) => s + d, 0) - T * (frames.length - 1);
    const beats = []; let acc = 0; for (let i = 0; i < frames.length - 1; i++) { acc += frames[i][1] - T; beats.push(acc); }
    music(path.join(TMP, "bgm.wav"), total, beats);
    const args = ["-y"]; for (const [f, d] of frames) args.push("-loop", "1", "-t", String(d + 0.05), "-i", f);
    args.push("-i", path.join(TMP, "bgm.wav"));
    let fc = frames.map((_, i) => `[${i}:v]scale=${W}:${H},setsar=1,fps=30,format=yuv420p[v${i}]`).join(";"), last = "v0", off = 0;
    const trans = ["slideleft", "slideup", "slideleft", "circleopen", "slideleft", "slideup", "fade"];
    for (let i = 1; i < frames.length; i++) { off += frames[i - 1][1] - T; fc += `;[${last}][v${i}]xfade=transition=${trans[(i - 1) % trans.length]}:duration=${T}:offset=${off.toFixed(2)}[x${i}]`; last = `x${i}`; }
    const file = `reel-${x.today}.mp4`;
    args.push("-filter_complex", fc, "-map", `[${last}]`, "-map", `${frames.length}:a`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", path.join(OUT, file));
    execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    // TikTok 用の音なし版（アプリで流行りの曲をのせるため）
    execFileSync("ffmpeg", ["-y", "-i", path.join(OUT, file), "-c:v", "copy", "-an", "-movflags", "+faststart", path.join(OUT, file.replace(/\.mp4$/, "-silent.mp4"))], { stdio: ["ignore", "ignore", "pipe"] });
    await sharp(frames[0][0]).jpeg({ quality: 86 }).toFile(path.join(OUT, file.replace(/\.mp4$/, ".jpg"))); // リールの表紙（グリッドに出る画像）
    // TikTok の写真スライド用：1枚ずつの画像（reel-日付-s1.jpg 〜）
    const slides = [];
    for (let k = 0; k < frames.length; k++) { const sf = file.replace(/\.mp4$/, `-s${k + 1}.jpg`); await sharp(frames[k][0]).jpeg({ quality: 88 }).toFile(path.join(OUT, sf)); slides.push(`https://gachapla.com/images/social/${sf}?v=${ver(path.join(OUT, sf))}`); }
    fs.rmSync(TMP, { recursive: true, force: true });
    fs.writeFileSync(path.join(ROOT, "dist", "data", "social-reel.json"), JSON.stringify({ date: x.today, title, sub, word, kawaii: kw.map((i) => i.id), slides, url: `https://gachapla.com/images/social/${file}?v=${ver(path.join(OUT, file))}`, cover: `https://gachapla.com/images/social/${file.replace(/\.mp4$/, ".jpg")}?v=${ver(path.join(OUT, file.replace(/\.mp4$/, ".jpg")))}`, items: pool.map((i) => ({ id: i.id, name: clean(i.name), price: i.price, lineup: i.lineup })) }));
    console.log(`リール：${title}（${pool.length}商品・${total.toFixed(1)}秒）`);
  } catch (e) { console.log(`⚠ リール: ${e.message}`); fs.rmSync(TMP, { recursive: true, force: true }); }
})();
