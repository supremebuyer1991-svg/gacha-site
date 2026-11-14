#!/usr/bin/env node
// Threads・Instagram（ガチャプラネット用アカウント）への自動投稿。どちらも Meta の公式API（無料）を使う。
//   GitHub の Secret「GACHA_THREADS_TOKEN」「GACHA_IG_TOKEN」にアクセストークンを入れると動く（無ければその分は何もしない）
//   MODE=morning … Threads：今日の注目ガチャ（1つ、写真1枚）
//   MODE=evening … Threads：今日のテーマのガチャ4選（写真4枚）／Instagram：同じ4選のカルーセル
//   MODE=reel    … Instagram：リール（デプロイで作った dist/images/social/reel-日付.mp4。src/reel.js）
//   MODE=deadline … Threads：本日締切の抽選まとめ（data/lottery.json から。文字だけの投稿。今日締切が無ければ何もしない）
// ・投稿に入れる gachapla.com のURLには、どこから来たかがわかる印（utm_source=threads&utm_medium=social&utm_campaign=モード）を付ける
// ・手元の確認：DRY=1（または DRY_RUN=1）で投稿せずに文面だけ表示（記録も書かない）。NOW_ISO=2026-11-15T07:52+09:00 で「今」を仮に決められる
// ・トークンは約60日で切れるので、20日ごとに自動で延長し、延長したものは data/social-state.json に暗号化して保存する
// ・同じ商品を続けて出さないよう、出した商品を state に記録する（14日間）
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, ".."), STATE = path.join(ROOT, "data", "social-state.json");
const SITE = "https://gachapla.com", MODE = process.env.MODE || "evening", DRY = !!(process.env.DRY || process.env.DRY_RUN);
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
const save = () => { if (DRY) return; fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + "\n"); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOW_MS = process.env.NOW_ISO ? Date.parse(process.env.NOW_ISO) : NaN; // 確認用：「今」を仮に決める
const jst = () => new Date((Number.isFinite(NOW_MS) ? NOW_MS : Date.now()) + 9 * 3600e3);
const today = jst().toISOString().slice(0, 10);
const log = (...a) => console.log(...a);

// ---- トークン（延長したものを暗号化して保存）----
const keyOf = (name, secret) => crypto.createHash("sha256").update(`gachapla-${name}|${secret}`).digest();
const xor = (buf, key) => { const out = Buffer.alloc(buf.length); for (let i = 0; i < buf.length; i += 32) { const k = crypto.createHash("sha256").update(Buffer.concat([key, Buffer.from([i >> 24, i >> 16, i >> 8, i].map((x) => x & 255))])).digest(); for (let j = 0; j < 32 && i + j < buf.length; j++) out[i + j] = buf[i + j] ^ k[j]; } return out; };
function tokenOf(name, secret) {
  const s = (state[name] ||= {});
  if (s.token_enc && s.secret_hash === crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16)) {
    try { const t = xor(Buffer.from(s.token_enc, "base64"), keyOf(name, secret)).toString(); if (/^[\x21-\x7e]{20,}$/.test(t)) return t; } catch (e) {}
  }
  return secret;
}
async function refresh(name, secret, tok, url) {
  const s = state[name];
  const last = s.refreshed_at ? Date.parse(s.refreshed_at) : 0;
  if (!last) { s.refreshed_at = new Date().toISOString(); s.secret_hash = crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16); return tok; } // できたばかりのトークンは延長できない
  if (Date.now() - last < 20 * 864e5) return tok;
  try {
    const r = await fetch(url + encodeURIComponent(tok)).then((x) => x.json());
    if (r.access_token) {
      s.token_enc = xor(Buffer.from(r.access_token), keyOf(name, secret)).toString("base64");
      s.secret_hash = crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16);
      s.refreshed_at = new Date().toISOString(); log(`${name}：トークンを延長しました`); return r.access_token;
    }
    log(`⚠ ${name}：トークンの延長に失敗`, JSON.stringify(r).slice(0, 200));
  } catch (e) { log(`⚠ ${name}：トークンの延長に失敗 ${e.message}`); }
  return tok;
}

// ---- データ ----
const getJSON = (u) => fetch(u + (u.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); });
const LOCAL = !!process.env.LOCAL; // 手元の確認用：dist の中を読む
const imgOk = async (id) => { if (LOCAL) return fs.existsSync(path.join(ROOT, "dist", "images", "social", `${id}.jpg`)); try { const r = await fetch(`${SITE}/images/social/${id}.jpg`, { method: "HEAD" }); return r.ok; } catch (e) { return false; } };
const recent = (name) => { const p = (state[name] ||= {}).posted ||= {}; const lim = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10); for (const k of Object.keys(p)) if (p[k] < lim) delete p[k]; return p; };
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const cleanName = (s) => String(s || "").replace(/【[^】]*】/g, "").trim();
// 自分のサイトのURLに「どのSNSの・どの投稿から来たか」の印を付ける（メルカリなど外のURLには付けない）
const utm = (url, source, campaign) => {
  if (!url || !String(url).startsWith(SITE) || /[?&]utm_source=/.test(url)) return url;
  const [base, hash] = String(url).split("#");
  return `${base}${base.includes("?") ? "&" : "?"}utm_source=${encodeURIComponent(source)}&utm_medium=social&utm_campaign=${encodeURIComponent(campaign)}${hash ? "#" + hash : ""}`;
};
// テーマ名 → キャラクターページ（/chara/〇〇）。ページが無いテーマは検索ページへ
const CHARA_SLUG = { "サンリオ": "sanrio", "ちいかわ": "chiikawa", "ディズニー": "disney", "たまごっち": "tamagotchi", "めじるし": "mejirushi", "めじるしアクセサリー": "mejirushi", "任天堂": "nintendo", "ポケモン": "pokemon" };
let charaList; // サイトの data/chara-ja.json（いまあるキャラクターページの一覧）
async function themeUrl(cat) {
  const search = `${SITE}/?q=${encodeURIComponent(cat)}`;
  if (charaList === undefined) { try { charaList = LOCAL ? JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "data", "chara-ja.json"), "utf8")) : await getJSON(`${SITE}/data/chara-ja.json`); } catch (e) { charaList = null; } }
  const hit = charaList && charaList.find((c) => c.j === cat || c.l === cat);
  const slug = CHARA_SLUG[cat] || (hit && hit.s);
  if (!slug) return search;
  if (charaList) return charaList.some((c) => c.s === slug) ? `${SITE}/chara/${slug}` : search;
  if (LOCAL) return fs.existsSync(path.join(ROOT, "dist", "chara", `${slug}.html`)) ? `${SITE}/chara/${slug}` : search;
  try { const r = await fetch(`${SITE}/chara/${slug}`, { method: "HEAD" }); return r.ok ? `${SITE}/chara/${slug}` : search; } catch (e) { return search; }
}
const relText = (it) => it.release_note || (it.release ? `${+it.release.slice(5, 7)}月発売` : "");

// ---- Threads ----
const TH = "https://graph.threads.net/v1.0";
async function thPost(tok, text, ids) {
  const urls = ids.map((id) => (/^https?:/.test(id) ? id : `${SITE}/images/social/${id}.jpg`));
  if (DRY) { log("[DRY threads]", text, urls); return true; }
  const call = async (p, params) => { const r = await fetch(`${TH}/${p}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, access_token: tok }) }).then((x) => x.json()); if (!r.id) throw new Error(JSON.stringify(r).slice(0, 300)); return r.id; };
  let cid;
  if (!urls.length) cid = await call("me/threads", { media_type: "TEXT", text }); // 文字だけの投稿
  else if (urls.length === 1) cid = await call("me/threads", { media_type: "IMAGE", image_url: urls[0], text });
  else {
    const kids = []; for (const u of urls) kids.push(await call("me/threads", { media_type: "IMAGE", image_url: u, is_carousel_item: "true" }));
    await sleep(5000);
    cid = await call("me/threads", { media_type: "CAROUSEL", children: kids.join(","), text });
  }
  await sleep(30000); // 公式の目安：作ってから30秒ほど待って公開
  await call("me/threads_publish", { creation_id: cid });
  return true;
}

// ---- Instagram（Facebookページにつないだ Instagram。ページのアクセストークン＝期限なしで投稿する）----
const IG = "https://graph.facebook.com/v21.0";
let IG_ID = process.env.GACHA_IG_USER_ID || "17841473598073198"; // @gacha_pla
async function igPost(tok, caption, ids) {
  const urls = ids.map((id) => (/^https?:/.test(id) ? id : `${SITE}/images/social/${id}.jpg`));
  if (DRY) { log("[DRY instagram]", caption, urls); return true; }
  const call = async (p, params) => { const r = await fetch(`${IG}/${p}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, access_token: tok }) }).then((x) => x.json()); if (!r.id) throw new Error(JSON.stringify(r).slice(0, 300)); return r.id; };
  const wait = async (id) => { for (let i = 0; i < 20; i++) { const r = await fetch(`${IG}/${id}?fields=status_code&access_token=${encodeURIComponent(tok)}`).then((x) => x.json()); if (r.status_code === "FINISHED") return; if (r.status_code === "ERROR") throw new Error("画像の処理に失敗"); await sleep(3000); } };
  if (!IG_ID) { const r = await fetch(`${IG}/me?fields=instagram_business_account&access_token=${encodeURIComponent(tok)}`).then((x) => x.json()); IG_ID = r.instagram_business_account && r.instagram_business_account.id; if (!IG_ID) throw new Error("Instagram のアカウントが見つかりません " + JSON.stringify(r).slice(0, 200)); }
  let cid;
  if (urls.length === 1) { cid = await call(`${IG_ID}/media`, { image_url: urls[0], caption }); }
  else {
    const kids = []; for (const u of urls) { const k = await call(`${IG_ID}/media`, { image_url: u, is_carousel_item: "true" }); await wait(k); kids.push(k); }
    cid = await call(`${IG_ID}/media`, { media_type: "CAROUSEL", children: kids.join(","), caption });
  }
  await wait(cid);
  await call(`${IG_ID}/media_publish`, { creation_id: cid });
  return true;
}

// ---- Instagram リール（動画は gachapla.com に置いたものを Instagram が取りに来る）----
async function igReel(tok, caption, videoUrl, coverUrl) {
  if (DRY) { log("[DRY instagram reel]", caption, videoUrl, coverUrl); return true; }
  const call = async (p, params) => { const r = await fetch(`${IG}/${p}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, access_token: tok }) }).then((x) => x.json()); if (!r.id) throw new Error(JSON.stringify(r).slice(0, 300)); return r.id; };
  const cid = await call(`${IG_ID}/media`, { media_type: "REELS", video_url: videoUrl, cover_url: coverUrl, caption, share_to_feed: "true" });
  for (let i = 0; i < 60; i++) { // 動画の処理は数十秒〜数分かかる
    const r = await fetch(`${IG}/${cid}?fields=status_code,status&access_token=${encodeURIComponent(tok)}`).then((x) => x.json());
    if (r.status_code === "FINISHED") break;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new Error("動画の処理に失敗 " + JSON.stringify(r).slice(0, 200));
    await sleep(5000);
  }
  await call(`${IG_ID}/media_publish`, { creation_id: cid });
  return true;
}

(async () => {
  const thSecret = (process.env.GACHA_THREADS_TOKEN || "").trim(), igSecret = (process.env.GACHA_IG_TOKEN || "").trim();
  if (!thSecret && !igSecret && !DRY) { log("トークンがないので何もしません"); return; }
  // 本日締切の抽選まとめ（サイトのデータではなく、リポジトリの data/lottery.json を読む）
  if (MODE === "deadline") {
    if (!thSecret && !DRY) { log("Threads のトークンがないので何もしません"); return; }
    const st = (state.threads ||= {});
    if (st.deadline_date === today && !DRY) { log("今日の締切まとめはもう投稿済み"); return; }
    let entries = [];
    try { entries = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "lottery.json"), "utf8")).entries || []; } catch (e) { log("⚠ 抽選のデータが読めません", e.message); return; }
    const nowIso = jst().toISOString().slice(0, 16);
    const L = entries.filter((e) => e && e.store && e.title && typeof e.end === "string" && e.end.slice(0, 10) === today && e.end > nowIso)
      .sort((a, b) => (a.end > b.end ? 1 : a.end < b.end ? -1 : 0));
    if (!L.length) { log("今日締切の抽選はないので投稿しません"); return; }
    const hm = (e) => { const t = e.end.slice(11, 16); return t ? t.replace(/^0/, "") : ""; };
    // 店名の「#」は Threads でタグ扱いになるので外す
    const line = (e) => `・${short(String(e.store).replace(/[#＃]/g, "").trim(), 24)}｜${short(cleanName(e.title), 26)}（${hm(e)}まで）`;
    const head = [`⏰本日締切のガチャ抽選まとめ（${+today.slice(5, 7)}/${+today.slice(8, 10)}・${L.length}件）`, ``];
    const tail = (rest) => [...(rest ? [`ほか ${rest}件`] : []), ``, `応募ページ・全国の抽選一覧はこちら👇`, utm(`${SITE}/lottery`, "threads", "deadline"), ``, `#ガチャガチャ`];
    let n = Math.min(6, L.length), text = "";
    for (; n >= 1; n--) { text = [...head, ...L.slice(0, n).map(line), ...tail(L.length - n)].join("\n"); if (text.length <= 490) break; } // 500字に収まるところまで
    try {
      const tok = DRY ? "" : await refresh("threads", thSecret, tokenOf("threads", thSecret), "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=");
      await thPost(tok, text, []); st.deadline_date = today; log("Threads：本日締切の抽選まとめを投稿", `${L.length}件`);
    } catch (e) { log("⚠ Threads の投稿に失敗", e.message); }
    save(); return;
  }
  const x = LOCAL ? JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "data", "x.json"), "utf8")) : await getJSON(`${SITE}/data/x.json`);
  if (x.today !== today) { log(`データが古いので投稿しません（${x.today}）`); return; }
  const fav = new Set(x.fav_ids || []);
  let changed = false;

  // 注目の新作（めじるし×サンリオ・ディズニー・たまごっち・ちいかわ）：予約の時刻が来たものを Threads・Instagram に出す（build.js が data/hot.json を作る）
  if (MODE === "hot") {
    let Q = [];
    try { Q = LOCAL ? JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "data", "hot.json"), "utf8")) : await getJSON(`${SITE}/data/hot.json`); } catch (e) { log("⚠ hot.json が読めません", e.message); }
    const st = (state.hot ||= {}); const nowMs = Number.isFinite(NOW_MS) ? NOW_MS : Date.now();
    for (const k of Object.keys(st)) if (nowMs - Date.parse(st[k]) > 14 * 864e5) delete st[k];
    const due = Q.filter((q) => Date.parse(q.ja_at) <= nowMs + 60e3 && nowMs - Date.parse(q.ja_at) < 2 * 864e5);
    if (!due.length) { log("注目の新作：出すものはなし"); }
    for (const q of due) {
      const body = q.ja.split("\n").filter((l) => !/リプ欄/.test(l) && !/^#/.test(l)).join("\n").replace(/\n+$/, "");
      if ((thSecret || DRY) && !st[`${q.id}|th`]) {
        const text = [body, ``, `発売日・ラインナップ・近くの取扱店はこちら👇`, utm(q.url, "threads", "hot"), ``, `#ガチャガチャ`].join("\n");
        try { const tok = DRY ? "" : await refresh("threads", thSecret, tokenOf("threads", thSecret), "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token="); await thPost(tok, short(text, 490), [q.img]); st[`${q.id}|th`] = new Date(nowMs).toISOString(); changed = true; log("Threads：注目の新作を投稿", q.id); }
        catch (e) { log("⚠ Threads の投稿に失敗", e.message); try { await thPost(await refresh("threads", thSecret, tokenOf("threads", thSecret), "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token="), short(text, 490), []); st[`${q.id}|th`] = new Date(nowMs).toISOString(); changed = true; log("Threads：写真なしで投稿"); } catch (e2) { log("⚠ 写真なしでも失敗", e2.message); } }
      }
      if ((igSecret || DRY) && !st[`${q.id}|ig`]) {
        const cap = [body, ``, `発売日・ラインナップ・近くの取扱店は、プロフィールのリンク（gachapla.com）から検索できます🪐`, ``, `#ガチャガチャ #ガチャ #カプセルトイ #めじるしアクセサリー #${q.work} #新作ガチャ`].join("\n");
        try { await igPost(igSecret, cap.slice(0, 2100), [q.img]); st[`${q.id}|ig`] = new Date(nowMs).toISOString(); changed = true; log("Instagram：注目の新作を投稿", q.id); }
        catch (e) { log("⚠ Instagram の投稿に失敗", e.message); }
      }
    }
    if (changed) save();
    return;
  }
  if (MODE === "morning" && (thSecret || DRY)) {
    const done = recent("threads");
    const cands = [...(x.picks || []), ...((x.new_info && x.new_info.items) || [])].filter((it) => it && !done[it.id]);
    cands.sort((a, b) => fav.has(b.id) - fav.has(a.id));
    let it = null; for (const c of cands) if (await imgOk(c.id)) { it = c; break; }
    if (it) {
      const names = (it.lineup_names || []).slice(0, 4).join("・");
      const text = [`🪐今日の注目ガチャ`, ``, cleanName(it.name), `1回${it.price}円・全${it.lineup}種｜${relText(it)}`, names ? `ラインナップ：${names}` : "", ``, `見かけたら回したいのはどれ？`, ``, `発売日・近くの取扱店はこちら👇`, utm(it.url, "threads", "morning"), ``, `#ガチャガチャ`].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
      try { const tok = await refresh("threads", thSecret, tokenOf("threads", thSecret), "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token="); await thPost(tok, short(text, 490), [it.id]); done[it.id] = today; changed = true; log("Threads：注目ガチャを投稿", it.name); }
      catch (e) { log("⚠ Threads の投稿に失敗", e.message); }
    } else log("Threads：出せる商品がありません");
  }

  if (MODE === "reel" && (igSecret || DRY)) {
    const st = (state.instagram ||= {});
    let rl = null;
    try { rl = LOCAL ? JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "data", "social-reel.json"), "utf8")) : await getJSON(`${SITE}/data/social-reel.json`); } catch (e) { log("⚠ リールのデータが読めません", e.message); }
    if (!rl || rl.date !== today) log("今日のリールがまだありません");
    else if (st.reel_date === today) log("今日のリールはもう投稿済み");
    else {
      const kw = new Set(rl.kawaii || []);
      const main = rl.items.filter((i) => !kw.has(i.id)), kws = rl.items.filter((i) => kw.has(i.id));
      const line = (it, i) => `${i + 1}. ${it.name}（${it.price}円・全${it.lineup}種）`;
      const tags = ["#ガチャガチャ", "#ガチャ", "#カプセルトイ", "#ガシャポン", "#新作ガチャ", "#ガチャ活", "#今週発売", rl.word ? `#${rl.word.replace(/\s/g, "")}` : ""].filter(Boolean);
      const cap = [`${rl.title}（${rl.sub}）`, ``, ...main.map(line), ...(kws.length ? [``, `ラストの${rl.word}が可愛すぎる♡`, ...kws.map((it, j) => line(it, main.length + j))] : []), ``, `どれを回したい？コメントで教えてね🪐`, `発売日・近くの在庫店は、プロフィールのリンク（gachapla.com）から検索できます`, ``, [...new Set(tags)].join(" ")].join("\n");
      try { await igReel(igSecret, cap.slice(0, 2100), rl.url, rl.cover); st.reel_date = today; changed = true; log("Instagram：リールを投稿", rl.title); }
      catch (e) { log("⚠ Instagram のリール投稿に失敗", e.message); }
    }
  }

  if (MODE === "evening" || MODE === "instagram") {
    const m = x.morning || {};
    const fromPool = async (name, pool) => { const done = recent(name); const out = []; for (const it of pool) { if (out.length >= 4) break; if (!it || done[it.id] || out.some((o) => o.id === it.id)) continue; if (await imgOk(it.id)) out.push(it); } return out; };
    // 朝のテーマ（サンリオ・ディズニーなど）で3つ以上そろえばそれ、だめなら今週発売
    let cat = "今週発売", q = `${SITE}/week`, themed = false;
    // デプロイのときに作った表紙（テーマ名＋写真2×2）があれば、その4商品を使って1枚目に表紙を付ける
    let cover = null;
    try { cover = LOCAL ? JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "data", "social-cover.json"), "utf8")) : await getJSON(`${SITE}/data/social-cover.json?${Date.now()}`); } catch (e) {}
    if (!cover || cover.date !== today || !(cover.ids || []).length) cover = null;
    const pick = async (name) => {
      if (cover) {
        const byId = {}; for (const it of [...(m.items || []), ...((x.week && x.week.items) || [])]) byId[it.id] = it;
        const L = []; for (const id of cover.ids) if (byId[id] && await imgOk(id)) L.push(byId[id]);
        if (L.length >= 2) { cat = cover.cat; themed = cover.cat !== "今週発売"; q = themed ? await themeUrl(cover.cat) : `${SITE}/week`; return L; }
      }
      if (m.active) { const L = await fromPool(name, m.items || []); if (L.length >= 3) { cat = m.category; q = await themeUrl(m.category); themed = true; return L; } }
      cat = "今週発売"; q = `${SITE}/week`; themed = false; return fromPool(name, (x.week && x.week.items) || []);
    };
    if ((thSecret || DRY) && MODE !== "instagram") {
      const L = await pick("threads");
      if (L.length >= 2) {
        const text = [`✨今日の${cat}ガチャ${L.length}選`, ``, ...L.map((it) => `・${short(cleanName(it.name), 34)}（${it.price}円）`), ``, `発売日・ラインナップ・近くの取扱店はこちら👇`, utm(q, "threads", "theme"), ``, `#ガチャガチャ`].join("\n");
        try { const tok = await refresh("threads", thSecret, tokenOf("threads", thSecret), "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token="); await thPost(tok, short(text, 490), [...(cover ? [cover.url] : []), ...L.map((i) => i.id)]); for (const it of L) recent("threads")[it.id] = today; changed = true; log("Threads：4選を投稿", cat); }
        catch (e) { log("⚠ Threads の投稿に失敗", e.message); }
      }
    }
    if (igSecret || DRY) {
      const L = await pick("instagram");
      if (L.length >= 2) {
        const tags = ["#ガチャガチャ", "#ガチャ", "#カプセルトイ", "#ガシャポン", "#新作ガチャ", "#ガチャ活", themed && m.tag ? m.tag : "#今週発売"];
        const cap = [`✨今日の${cat}ガチャ${L.length}選`, ``, ...L.map((it, i) => `${i + 1}. ${cleanName(it.name)}\n　1回${it.price}円・全${it.lineup}種｜${relText(it)}`), ``, `発売日・ラインナップ・近くの取扱店は、プロフィールのリンク（gachapla.com）から検索できます🪐`, `保存しておくと、ガチャ屋さんで見返せます📌`, ``, [...new Set(tags)].join(" ")].join("\n");
        try { const tok = igSecret; await igPost(tok, cap.slice(0, 2100), [...(cover ? [cover.url] : []), ...L.map((i) => i.id)]); for (const it of L) recent("instagram")[it.id] = today; changed = true; log("Instagram：4選を投稿", cat); }
        catch (e) { log("⚠ Instagram の投稿に失敗", e.message); }
      }
    }
  }
  if (changed || state.threads || state.instagram) save();
})();
