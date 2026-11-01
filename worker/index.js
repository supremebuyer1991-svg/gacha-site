/*
 * ガチャプラネット 在庫確認ワーカー（Cloudflare Workers・10分おきに自動実行）
 * サイトが公開している「確認する商品の一覧」を読み、毎回 BATCH 件ずつ、
 * バンダイ公式「ガシャポンどこ？」から取扱店を取得して D1 データベースに保存する。
 * 1件ごとに2秒あけ、公式サイトへの負担を抑える。
 */
const BATCH = 6;
const WAIT_MS = 2000;
const PREF_EN = { "北海道": "Hokkaido", "青森県": "Aomori", "岩手県": "Iwate", "宮城県": "Miyagi", "秋田県": "Akita", "山形県": "Yamagata", "福島県": "Fukushima", "茨城県": "Ibaraki", "栃木県": "Tochigi", "群馬県": "Gunma", "埼玉県": "Saitama", "千葉県": "Chiba", "東京都": "Tokyo", "神奈川県": "Kanagawa", "新潟県": "Niigata", "富山県": "Toyama", "石川県": "Ishikawa", "福井県": "Fukui", "山梨県": "Yamanashi", "長野県": "Nagano", "岐阜県": "Gifu", "静岡県": "Shizuoka", "愛知県": "Aichi", "三重県": "Mie", "滋賀県": "Shiga", "京都府": "Kyoto", "大阪府": "Osaka", "兵庫県": "Hyogo", "奈良県": "Nara", "和歌山県": "Wakayama", "鳥取県": "Tottori", "島根県": "Shimane", "岡山県": "Okayama", "広島県": "Hiroshima", "山口県": "Yamaguchi", "徳島県": "Tokushima", "香川県": "Kagawa", "愛媛県": "Ehime", "高知県": "Kochi", "福岡県": "Fukuoka", "佐賀県": "Saga", "長崎県": "Nagasaki", "熊本県": "Kumamoto", "大分県": "Oita", "宮崎県": "Miyazaki", "鹿児島県": "Kagoshima", "沖縄県": "Okinawa" };
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function labels(d) {
  const j = new Date(d.getTime() + 9 * 3600e3);
  const p = (n) => String(n).padStart(2, "0");
  return {
    ja: `${j.getUTCFullYear()}年${j.getUTCMonth() + 1}月${j.getUTCDate()}日 ${p(j.getUTCHours())}:${p(j.getUTCMinutes())}`,
    en: `${MONTH_EN[j.getUTCMonth()]} ${j.getUTCDate()}, ${j.getUTCFullYear()} ${p(j.getUTCHours())}:${p(j.getUTCMinutes())} JST`,
  };
}

async function checkItem(env, t) {
  const page = `https://gashapon.jp/shop/gplus_list.php?product_code=${t.code}`;
  const body = new URLSearchParams({ pref: "", free: "", product_code: t.code, gplus_type: "gplus", center_lat: "35.681236", center_lng: "139.767125", map_distance_flg: "false" });
  const res = await fetch("https://gashapon.jp/shop/leaflet/getShops.php", {
    method: "POST",
    headers: { "User-Agent": `Mozilla/5.0 (compatible; GachaPlanetBot/1.0; +${env.SITE_URL})`, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Referer: page },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const stores = (data.gplus_data || []).filter((x) => x.latitude && x.longitude && x.delflg !== "1").map((x) => ({
    name: x.shop_title, name_en: "", prefecture: x.shop_pref, prefecture_en: PREF_EN[x.shop_pref] || x.shop_pref,
    address: x.shop_address, address_en: "", lat: Number(x.latitude), lng: Number(x.longitude), status: "in_stock",
    url: x.shop_code ? `https://gashapon.jp/shop/shop.php?shop_code=${x.shop_code}` : "",
  }));
  const now = new Date();
  const l = labels(now);
  const json = JSON.stringify({ updated_at: now.toISOString(), updated_ja: l.ja, updated_en: l.en, source: "gashapon", stores });
  await env.DB.prepare("INSERT INTO stock (item_id, data, updated_at, count) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(item_id) DO UPDATE SET data = ?2, updated_at = ?3, count = ?4")
    .bind(t.id, json, now.toISOString(), stores.length).run();
  return stores.length;
}

async function run(env) {
  const targets = await (await fetch(`${env.SITE_URL}/data/stock-targets.json`, { cf: { cacheTtl: 300 } })).json();
  if (!Array.isArray(targets) || !targets.length) return;
  const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'cursor'").first();
  let cursor = row ? Number(row.v) || 0 : 0;
  if (cursor >= targets.length) cursor = 0;
  for (let i = 0; i < BATCH && i < targets.length; i++) {
    const t = targets[(cursor + i) % targets.length];
    try { await checkItem(env, t); } catch (e) { console.log(`skip ${t.id}: ${e.message}`); }
    await sleep(WAIT_MS);
  }
  cursor = (cursor + BATCH) % targets.length;
  await env.DB.prepare("INSERT INTO meta (k, v) VALUES ('cursor', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(String(cursor)).run();
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); },
  async fetch() { return new Response("gacha-planet stock worker", { status: 200 }); },
};
