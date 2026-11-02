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
  await recordArrivals(env, t.id, data.gplus_data || [], now.toISOString());
  return stores.length;
}

/*
 * 入荷の記録。変わったところだけ書き込む（データベースの書き込み回数を抑えるため）。
 * - 初めて見た店 → 入荷（ただし、この商品を初めて確認したときに既にあった店は「いつ入ったか不明」として速さの集計から外す）
 * - 在庫なしだった店がまた出てきた → 補充（在庫復活）
 * - 一覧から消えた店 → 在庫なし
 */
async function recordArrivals(env, itemId, raw, nowIso) {
  const cur = new Map();
  for (const x of raw) {
    if (x.delflg === "1") continue;
    const key = String(x.shop_code || `${x.shop_title}|${x.shop_address}`);
    cur.set(key, { pref: x.shop_pref || "", name: x.shop_title || "" });
  }
  const obs = await env.DB.prepare("SELECT first_seen FROM item_obs WHERE item_id = ?1").bind(itemId).first();
  const firstTime = !obs;
  const { results } = await env.DB.prepare("SELECT shop, in_now FROM seen WHERE item_id = ?1").bind(itemId).all();
  const known = new Map((results || []).map((r) => [r.shop, r.in_now]));
  const st = [];
  let added = 0, back = 0;
  for (const [shop, v] of cur) {
    if (!known.has(shop)) {
      st.push(env.DB.prepare("INSERT INTO seen (item_id, shop, pref, name, first_seen, last_seen, in_now, restocks, baseline) VALUES (?1, ?2, ?3, ?4, ?5, ?5, 1, 0, ?6)")
        .bind(itemId, shop, v.pref, v.name, nowIso, firstTime ? 1 : 0));
      if (!firstTime) added++;
    } else if (!known.get(shop)) {
      st.push(env.DB.prepare("UPDATE seen SET in_now = 1, restocks = restocks + 1, last_seen = ?3 WHERE item_id = ?1 AND shop = ?2").bind(itemId, shop, nowIso));
      back++;
    }
  }
  for (const [shop, inNow] of known) {
    if (inNow && !cur.has(shop)) st.push(env.DB.prepare("UPDATE seen SET in_now = 0 WHERE item_id = ?1 AND shop = ?2").bind(itemId, shop));
  }
  const kind = added ? "new" : back ? "restock" : null;
  if (firstTime) {
    st.push(env.DB.prepare("INSERT INTO item_obs (item_id, first_seen, restocks, in_count, last_change, last_kind) VALUES (?1, ?2, 0, ?3, ?2, 'first')").bind(itemId, nowIso, cur.size));
  } else {
    st.push(env.DB.prepare("UPDATE item_obs SET restocks = restocks + ?2, in_count = ?3, last_change = CASE WHEN ?4 IS NULL THEN last_change ELSE ?5 END, last_kind = COALESCE(?4, last_kind) WHERE item_id = ?1")
      .bind(itemId, back, cur.size, kind, nowIso));
  }
  for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
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
