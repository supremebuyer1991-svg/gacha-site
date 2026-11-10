// Instagram リール用の縦長動画（1080×1920・約14秒）を作る。サイトを作ったあと（deploy の SNS画像の手順のあと）に動く。
// 中身：表紙 → 商品8つ（写真を大きく・名前・値段・全何種・発売）→ しめ。音はこのファイルで作るオリジナルのピコピコ音（著作権の心配なし）。
// 出力：dist/images/social/reel-{日付}.mp4 と dist/data/social-reel.json（social.js が Instagram に投稿するときに読む）
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
let sharp; try { sharp = require("sharp"); } catch (e) { console.log("sharp がないのでリールは作りません"); process.exit(0); }
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "dist", "images", "social"), TMP = path.join(ROOT, ".reel-tmp");
const W = 1080, H = 1920, FONT = "Noto Sans CJK JP, Noto Sans JP, sans-serif", LAT = "DejaVu Sans, Arial, sans-serif";
const RING = ["#ff4f7b", "#3aa0ff", "#ffc93c", "#2fd6a3", "#a855f7"];
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = (s) => String(s || "").replace(/【[^】]*】/g, "").replace(/\s+/g, " ").trim();
// 名前を1行 n 文字くらいで折り返す（最大3行）
const wrap = (s, n) => { // 半角は0.55文字分として数え、英単語の途中ではなるべく切らない
  const w = (c) => (/[\x20-\x7e]/.test(c) ? 0.55 : 1), out = []; let cur = "", cw = 0;
  const toks = String(s).match(/[A-Za-z0-9'’.&!:-]+ ?|[\s\S]/g) || [];
  for (const t of toks) { const tw = [...t].reduce((a, c) => a + w(c), 0); if (cw + tw > n && cur) { out.push(cur.trim()); cur = ""; cw = 0; } cur += t; cw += tw; }
  if (cur.trim()) out.push(cur.trim());
  if (out.length > 3) { out.length = 3; out[2] = out[2].slice(0, -1) + "…"; }
  return out; };
const relTxt = (it) => it.release_note || (it.release ? `${+it.release.slice(5, 7)}月発売` : "");

function stars() { return Array.from({ length: 70 }, (_, i) => `<circle cx="${(i * 197) % W}" cy="${(i * 389) % H}" r="${(i % 3) + 1.2}" fill="#fff" fill-opacity="${0.2 + (i % 4) * 0.15}"/>`).join(""); }
const BG = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232a7a"/><stop offset="1" stop-color="#0d1033"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>${stars()}`;
const LOGO = `<text x="${W / 2 - 8}" y="${H - 120}" text-anchor="end" font-family="${LAT}" font-weight="700" font-size="40" fill="#ff4f7b">GACHA</text><text x="${W / 2 + 8}" y="${H - 120}" text-anchor="start" font-family="${LAT}" font-weight="700" font-size="40" fill="#3aa0ff">PLANET</text>`;

async function cover(title, sub, ids, file) {
  // 中身は見せずに「なにが出る？」と思わせる表紙：モザイクの写真＋「？」
  const fsz = title.length > 11 ? 84 : 100;
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${BG}
<text x="${W / 2}" y="300" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${fsz}" fill="#fff" stroke="#ff4f7b" stroke-width="12" paint-order="stroke" stroke-linejoin="round">${esc(title)}</text>
<rect x="${W / 2 - 230}" y="360" width="460" height="74" rx="37" fill="#ffc93c"/>
<text x="${W / 2}" y="412" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="40" fill="#1b1f5e">${esc(sub)}</text>${LOGO}</svg>`);
  const layers = [], S = 440, g = 30, x0 = (W - S * 2 - g) / 2, y0 = 520;
  for (let i = 0; i < Math.min(4, ids.length); i++) {
    const x = Math.round(x0 + (i % 2) * (S + g)), y = y0 + Math.floor(i / 2) * (S + g);
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S - 16}" height="${S - 16}"><rect width="${S - 16}" height="${S - 16}" rx="28" fill="#fff"/></svg>`);
    const tile = await sharp(await mosaic(ids[i], S - 16, S - 16)).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect x="4" y="4" width="${S - 8}" height="${S - 8}" rx="34" fill="#fff" stroke="${RING[i]}" stroke-width="8"/></svg>`), left: x, top: y });
    layers.push({ input: tile, left: x + 8, top: y + 8 });
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><circle cx="${S / 2}" cy="${S / 2}" r="60" fill="#1b1f5e" fill-opacity="0.6"/><text x="${S / 2}" y="${S / 2 + 34}" text-anchor="middle" font-family="${LAT}" font-weight="700" font-size="96" fill="#fff">?</text></svg>`), left: x, top: y });
  }
  await sharp(svg).composite(layers).png().toFile(file);
}
async function photo(id, w, h) {
  return sharp(path.join(ROOT, "images", `${id}.webp`)).flatten({ background: "#ffffff" }).trim({ background: "#ffffff", threshold: 12 }).resize(w, h, { fit: "contain", background: "#ffffff" }).toBuffer();
}
// 表紙用：写真をモザイクにして中身を隠す
async function mosaic(id, w, h) {
  const small = await sharp(path.join(ROOT, "images", `${id}.webp`)).flatten({ background: "#ffffff" }).trim({ background: "#ffffff", threshold: 12 }).resize(36, 36, { fit: "contain", background: "#ffffff" }).toBuffer();
  return sharp(small).resize(w, h, { kernel: "nearest" }).toBuffer();
}
async function card(it, i, n, file, top) {
  const lines = wrap(clean(it.name), 15), fs1 = 58, y1 = 1330;
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${BG}
<rect x="${W / 2 - 170}" y="140" width="340" height="70" rx="35" fill="${RING[i % 5]}"/>
<text x="${W / 2}" y="190" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="40" fill="#fff">${esc(top)} ${i + 1}/${n}</text>
<rect x="70" y="250" width="${W - 140}" height="${W - 140}" rx="56" fill="#fff" stroke="${RING[i % 5]}" stroke-width="12"/>
${lines.map((l, k) => `<text x="${W / 2}" y="${y1 + k * (fs1 + 14)}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${fs1}" fill="#fff">${esc(l)}</text>`).join("")}
<rect x="${W / 2 - 330}" y="${y1 + lines.length * (fs1 + 14) + 20}" width="660" height="96" rx="48" fill="#ffc93c"/>
<text x="${W / 2}" y="${y1 + lines.length * (fs1 + 14) + 84}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="50" fill="#1b1f5e">1回${it.price}円・全${it.lineup || "?"}種</text>
<text x="${W / 2}" y="${y1 + lines.length * (fs1 + 14) + 180}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="40" fill="#cfd6ff">${esc(relTxt(it))}</text>${LOGO}</svg>`);
  await sharp(svg).composite([{ input: await photo(it.id, W - 220, W - 220), left: 110, top: 290 }]).png().toFile(file);
}
async function outro(file) {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${BG}
<text x="${W / 2}" y="760" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="88" fill="#fff" stroke="#ff4f7b" stroke-width="10" paint-order="stroke">どれを回したい？</text>
<text x="${W / 2}" y="900" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="54" fill="#ffc93c">コメントで教えてね🪐</text>
<text x="${W / 2}" y="1080" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="44" fill="#cfd6ff">発売日・近くの在庫店は</text>
<text x="${W / 2}" y="1150" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="44" fill="#cfd6ff">プロフィールのリンクから</text>${LOGO}</svg>`);
  await sharp(svg).png().toFile(file);
}

// オリジナルのBGM（矩形波のメロディ＋ベース＋カプセルの「ポン」）。WAV を書き出す
function music(file, secs, beats) {
  const sr = 44100, N = Math.round(sr * secs), buf = new Float32Array(N), bpm = 150, sb = 60 / bpm / 2; // 8分音符
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
    const fav = new Set(x.fav_ids || []), seen = new Set(), pool = [];
    const has = (id) => fs.existsSync(path.join(ROOT, "images", `${id}.webp`));
    // 今週発売（人気の系統が先）→ 注目の新作 の順に、写真のある商品を8つ
    const week = ((x.week && x.week.items) || []).slice().sort((a, b) => fav.has(b.id) - fav.has(a.id));
    let title = "今週発売のガチャが熱い🔥", sub = x.week ? `${x.week.from}〜${x.week.to}` : "", top = "今週発売";
    for (const it of [...week, ...(x.picks || []), ...((x.new_info && x.new_info.items) || []), ...((x.morning && x.morning.items) || [])]) { if (pool.length >= 8) break; if (it && it.id && !seen.has(it.id) && has(it.id)) { seen.add(it.id); pool.push(it); } }
    if (week.filter((i) => has(i.id)).length < 3) { title = "注目の新作ガチャが熱い🔥"; sub = `${+x.today.slice(5, 7)}/${+x.today.slice(8, 10)}`; top = "注目"; }
    if (pool.length < 3) { console.log("リール：写真のある商品が足りないので作りません"); return; }
    fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
    const frames = [];
    await cover(title, sub, pool.map((i) => i.id), path.join(TMP, "f0.png")); frames.push([path.join(TMP, "f0.png"), 1.5]);
    for (let i = 0; i < pool.length; i++) { const f = path.join(TMP, `f${i + 1}.png`); await card(pool[i], i, pool.length, f, top); frames.push([f, 1.55]); }
    await outro(path.join(TMP, "fz.png")); frames.push([path.join(TMP, "fz.png"), 2.2]);
    // 切り替え（0.22秒のスライド）でつなぐ
    const T = 0.22, total = frames.reduce((s, [, d]) => s + d, 0) - T * (frames.length - 1);
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
    await sharp(frames[0][0]).jpeg({ quality: 86 }).toFile(path.join(OUT, file.replace(/\.mp4$/, ".jpg"))); // リールの表紙（グリッドに出る画像）
    fs.rmSync(TMP, { recursive: true, force: true });
    fs.writeFileSync(path.join(ROOT, "dist", "data", "social-reel.json"), JSON.stringify({ date: x.today, title, sub, url: `https://gachapla.com/images/social/${file}`, cover: `https://gachapla.com/images/social/${file.replace(/\.mp4$/, ".jpg")}`, items: pool.map((i) => ({ id: i.id, name: clean(i.name), price: i.price, lineup: i.lineup })) }));
    console.log(`リール：${title}（${pool.length}商品・${total.toFixed(1)}秒）`);
  } catch (e) { console.log(`⚠ リール: ${e.message}`); fs.rmSync(TMP, { recursive: true, force: true }); }
})();
