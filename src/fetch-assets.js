#!/usr/bin/env node
/*
 * 公開の前に GitHub Actions で動く「取り込み」スクリプト
 *  1) 商品画像：official_url（公式の商品ページ）から画像を取り込み、images/商品id.webp に保存
 *     - site.json の image_allowed_makers に入っているメーカーだけ（許可のあるメーカーだけ）
 *     - 公式ページのタイトルに商品名が含まれていない場合は、別の商品の可能性があるので取り込まない
 *     - すでに images/ に画像がある商品は何もしない
 *  2) 店舗の緯度経度：住所から国土地理院の住所検索で計算して stores.json に書き込む
 *     - "geo": "gsi" が付いていない店舗だけ計算（AIや手入力の緯度経度は上書きする）
 * 外部サイトへは1件ずつ間隔をあけてアクセスする。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));
const site = read("site.json");
const items = read("items.json");
const storesPath = path.join(ROOT, "data", "stores.json");
const stores = fs.existsSync(storesPath) ? read("stores.json") : [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (compatible; GachaSiteBot/1.0; +" + (process.env.SITE_URL || site.url) + ")";
const WAIT_MS = 2000;
const MAX_IMAGES_PER_RUN = 30;

// 比べるために、空白・記号・全角半角の違いをなくす
const norm = (s) => String(s || "")
  .normalize("NFKC")
  .replace(/[（(]再販[)）]/g, "")
  .replace(/[\s　・!！?？'’"“”:：\-‐–—~〜～、。,.\/／|｜【】\[\]「」『』()（）]/g, "")
  .toLowerCase();

const hasImage = (id) => ["webp", "jpg", "jpeg", "png"].some((e) => fs.existsSync(path.join(ROOT, "images", `${id}.${e}`)));

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function pickImage(html, pageUrl) {
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  let src = og && og[1];
  if (!src || /logo|ogp_default|noimage/i.test(src)) {
    const m = html.match(/<img[^>]+src=["']([^"']+\/img\/model\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
    src = m && m[1];
  }
  return src ? new URL(src, pageUrl).href : null;
}

function pageTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/｜.*$/, "").trim() : "";
}

async function importImages() {
  let sharp;
  try { sharp = require("sharp"); } catch { console.log("⚠ sharp が入っていないので画像の取り込みを飛ばします"); return 0; }
  const allowed = site.image_allowed_makers || [];
  let done = 0;
  for (const it of items) {
    if (done >= MAX_IMAGES_PER_RUN) break;
    if (hasImage(it.id) || !it.official_url) continue;
    if (!allowed.includes(it.maker)) continue;
    try {
      const html = await getText(it.official_url);
      const title = pageTitle(html);
      if (!norm(title).includes(norm(it.name)) && !norm(it.name).includes(norm(title))) {
        console.log(`⚠ ${it.id}: 公式ページの商品名「${title}」が一致しないので取り込みませんでした（official_url を確認してください）`);
        await sleep(WAIT_MS);
        continue;
      }
      const imgUrl = pickImage(html, it.official_url);
      if (!imgUrl) { console.log(`⚠ ${it.id}: 公式ページに画像が見つかりませんでした`); await sleep(WAIT_MS); continue; }
      await sleep(WAIT_MS);
      const res = await fetch(imgUrl, { headers: { "User-Agent": UA, Referer: it.official_url } });
      if (!res.ok) throw new Error(`画像 HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf)
        .resize(800, 800, { fit: "contain", background: "#ffffff" })
        .flatten({ background: "#ffffff" })
        .webp({ quality: 80 })
        .toFile(path.join(ROOT, "images", `${it.id}.webp`));
      console.log(`✔ ${it.id}: 画像を取り込みました`);
      done++;
    } catch (e) {
      console.log(`⚠ ${it.id}: 取り込みに失敗しました（${e.message}）`);
    }
    await sleep(WAIT_MS);
  }
  return done;
}

async function geocodeStores() {
  let done = 0;
  for (const s of stores) {
    if (s.geo === "gsi" || !s.address) continue;
    // 建物名・階数を外して番地までで検索する
    const q = s.address.normalize("NFKC").split(/\s+/)[0];
    try {
      const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA } });
      const list = await res.json();
      const hit = Array.isArray(list) && list[0];
      if (hit && hit.geometry && hit.geometry.coordinates) {
        const [lng, lat] = hit.geometry.coordinates;
        s.lat = Math.round(lat * 1e6) / 1e6;
        s.lng = Math.round(lng * 1e6) / 1e6;
        s.geo = "gsi";
        console.log(`✔ ${s.id}: 住所から位置を計算しました（${hit.properties && hit.properties.title}）`);
        done++;
      } else {
        delete s.lat; delete s.lng;
        console.log(`⚠ ${s.id}: 住所「${q}」から位置が見つかりませんでした`);
      }
    } catch (e) {
      console.log(`⚠ ${s.id}: 位置の計算に失敗しました（${e.message}）`);
    }
    await sleep(1000);
  }
  if (done) fs.writeFileSync(storesPath, JSON.stringify(stores, null, 2) + "\n");
  return done;
}

(async () => {
  fs.mkdirSync(path.join(ROOT, "images"), { recursive: true });
  const imgs = await importImages();
  const geos = await geocodeStores();
  console.log(`取り込み完了：画像 ${imgs}件、店舗の位置 ${geos}件`);
})();
