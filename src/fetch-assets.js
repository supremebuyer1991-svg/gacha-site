#!/usr/bin/env node
/*
 * 公開の前に GitHub Actions で動く「取り込み」スクリプト
 *  1) 商品画像：official_url（公式の商品ページ）から画像を取り込み、images/商品id.webp に保存
 *     - site.json の image_allowed_makers に入っているメーカーだけ（許可のあるメーカーだけ）
 *     - 公式ページのタイトルに商品名が含まれていない場合は、別の商品の可能性があるので取り込まない
 *     - すでに images/ に画像がある商品は何もしない
 *  2) 店舗と在庫：バンダイ公式「ガシャポンどこ？」から商品ごとの取扱店を取り込む（公式の緯度経度を使う）
 *  3) 手入力の店舗の緯度経度：住所から国土地理院の住所検索で計算（"geo" が付いていない店舗だけ）
 * 外部サイトへは1件ずつ間隔をあけてアクセスする。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));
const site = read("site.json");
let items = read("items.json");
const storesPath = path.join(ROOT, "data", "stores.json");
const stores = fs.existsSync(storesPath) ? read("stores.json") : [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (compatible; GachaSiteBot/1.0; +" + (process.env.SITE_URL || site.url) + ")";
const WAIT_MS = 2000;
const MAX_IMAGES_PER_RUN = 60;

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

// 公式の「準備中」画像（ほぼ一色のグレー）かどうか
async function isPlaceholder(sharp, input) {
  const { channels } = await sharp(input).resize(64, 64, { fit: "fill" }).stats();
  const sd = channels.slice(0, 3).reduce((a, c) => a + c.stdev, 0) / 3;
  return sd < 18;
}

// すでに保存した画像のうち「準備中」のものを消して、次回取り込み直す
async function removePlaceholders(sharp) {
  let n = 0;
  for (const f of fs.readdirSync(path.join(ROOT, "images"))) {
    if (!/\.(webp|jpg|jpeg|png)$/.test(f)) continue;
    const p = path.join(ROOT, "images", f);
    try { if (await isPlaceholder(sharp, p)) { fs.unlinkSync(p); n++; } } catch {}
  }
  if (n) console.log(`- 「準備中」の画像 ${n}件を外しました（公式に写真が出たら自動で入れ直します）`);
}

async function importImages() {
  let sharp;
  try { sharp = require("sharp"); } catch { console.log("⚠ sharp が入っていないので画像の取り込みを飛ばします"); return 0; }
  await removePlaceholders(sharp);
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
      if (await isPlaceholder(sharp, buf)) { console.log(`- ${it.id}: 公式画像がまだ「準備中」なので、次回また確認します`); await sleep(WAIT_MS); continue; }
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
    if (s.geo || !s.address) continue;
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

/*
 * 3) 店舗と在庫（バンダイ公式「ガシャポンどこ？」）
 *    official_url が gashapon.jp の商品について、その商品を置いている店舗の一覧（店名・住所・公式の緯度経度）を取り込み、
 *    stores.json と stock.json を作り直す。1商品につき1回だけアクセスする。
 *    発売前でマシンに入っていない商品は 0件になる（発売後に自動で出てくる）。
 */
async function importStock() {
  const targets = items.filter((it) => /gashapon\.jp\/products\/detail\.php\?jan_code=\d{13}/.test(it.official_url || ""));
  if (!targets.length) return { stores: 0, rows: 0 };
  const storeMap = new Map(stores.filter((s) => !String(s.id).startsWith("g-")).map((s) => [s.id, s])); // 手入力の店舗は残す
  const stockPath = path.join(ROOT, "data", "stock.json");
  const old = fs.existsSync(stockPath) ? JSON.parse(fs.readFileSync(stockPath, "utf8")) : { stock: [] };
  const otherRows = (old.stock || []).filter((r) => !targets.some((t) => t.id === r.item_id)); // 対象外の商品の在庫は残す
  const rows = [];
  let ok = 0;
  for (const it of targets) {
    const code = it.official_url.match(/jan_code=(\d{13})/)[1];
    const page = `https://gashapon.jp/shop/gplus_list.php?product_code=${code}`;
    try {
      const body = new URLSearchParams({ pref: "", free: "", product_code: code, gplus_type: "gplus", center_lat: "35.681236", center_lng: "139.767125", map_distance_flg: "false" });
      const res = await fetch("https://gashapon.jp/shop/leaflet/getShops.php", {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Referer: page },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = (data.gplus_data || []).filter((x) => x.shop_code && x.latitude && x.longitude && x.delflg !== "1");
      for (const x of list) {
        const id = "g-" + String(x.shop_code).toLowerCase();
        storeMap.set(id, {
          id, name: x.shop_title, name_en: "", prefecture: x.shop_pref, address: x.shop_address, address_en: "",
          lat: Number(x.latitude), lng: Number(x.longitude), geo: "official",
          source_url: `https://gashapon.jp/shop/shop.php?shop_code=${x.shop_code}`,
        });
        rows.push({ item_id: it.id, store_id: id, status: "in_stock" });
      }
      console.log(`✔ ${it.id}: 取扱店 ${list.length}件`);
      ok++;
    } catch (e) {
      console.log(`⚠ ${it.id}: 店舗の取り込みに失敗しました（${e.message}）。前回の在庫を残します`);
      rows.push(...(old.stock || []).filter((r) => r.item_id === it.id));
    }
    await sleep(WAIT_MS);
  }
  if (!ok) return { stores: 0, rows: 0 };
  const allRows = [...otherRows, ...rows];
  const used = new Set(allRows.map((r) => r.store_id));
  const keep = [...storeMap.values()].filter((s) => !String(s.id).startsWith("g-") || used.has(s.id));
  stores.length = 0; stores.push(...keep);
  fs.writeFileSync(storesPath, JSON.stringify(stores, null, 2) + "\n");
  fs.writeFileSync(stockPath, JSON.stringify({ updated_at: new Date().toISOString(), source: "ガシャポンどこ？（バンダイ公式）", stock: allRows }, null, 1) + "\n");
  return { stores: keep.length, rows: allRows.length };
}

(async () => {
  fs.mkdirSync(path.join(ROOT, "images"), { recursive: true });
  await require("./import-schedule.js")();
  items = read("items.json");
  // 新しく入った商品に診断用のタグを仮に付ける（毎晩Claudeが見直す）
  const tagged = require("./auto-tags.js")(items, site.quiz_groups);
  if (tagged) { fs.writeFileSync(path.join(ROOT, "data", "items.json"), JSON.stringify(items, null, 2) + "\n"); console.log(`- 診断タグを仮に付けた商品：${tagged}件`); }
  const imgs = await importImages();
  const st = await importStock();
  const geos = await geocodeStores();
  console.log(`取り込み完了：画像 ${imgs}件、店舗 ${st.stores}件・在庫 ${st.rows}件、住所からの位置計算 ${geos}件`);
})();
