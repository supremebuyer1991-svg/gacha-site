#!/usr/bin/env node
/*
 * ガチャサイト ページ自動生成スクリプト（日本語・英語）
 * data/ のファイルを読んで、dist/ に公開用のページ一式を書き出す。
 *   node src/build.js            … 本番用（dist/）
 *   node src/build.js --preview  … プレビュー用（dist-preview/）
 * 日本語ページはサイト直下、英語ページは /en/ 以下に同じ構成で作る。
 * 外部ライブラリは使っていない（Node.js だけで動く）。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const PREF_EN = require("./prefectures.js");

const ROOT = path.join(__dirname, "..");
const PREVIEW = process.argv.includes("--preview");
const OUT = path.join(ROOT, PREVIEW ? "dist-preview" : "dist");
const LANGS = ["ja", "en"];

/* ---------- 読み込み ---------- */
const readJSON = (f, fallback) => {
  const p = path.join(ROOT, "data", f);
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { console.error(`✖ data/${f} の書き方に誤りがあります: ${e.message}`); process.exit(1); }
};
const site = readJSON("site.json");
const rawItems = readJSON("items.json", []);
const stores = readJSON("stores.json", []);
const stockFile = readJSON("stock.json", { updated_at: null, stock: [] });

const SITE_URL = (process.env.SITE_URL || site.url || "").replace(/\/$/, "");
const GENRES = site.genres;
const genreOf = (slug) => GENRES.find((g) => g.slug === slug) || GENRES[GENRES.length - 1];
const moodSlugs = site.moods.map((m) => m.slug);

/* ---------- 日付（日本時間） ---------- */
const nowJST = new Date(Date.now() + 9 * 3600e3);
const today = nowJST.toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const jstParts = (iso) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: String(d.getUTCHours()).padStart(2, "0"), mm: String(d.getUTCMinutes()).padStart(2, "0") };
};

/* ---------- 画面の言葉（日本語・英語） ---------- */
const T = {
  ja: {
    htmlLang: "ja", ogLocale: "ja_JP", switchLabel: "EN", switchAria: "English version",
    tagline: site.tagline, description: site.description,
    sampleBar: "ただいまサンプルデータを表示しています。商品・店舗・在庫はすべて架空です。",
    nav: { new: "新着", ranking: "ランキング", calendar: "発売カレンダー", genre: "ジャンル", faq: "よくある質問" },
    navAria: "メインメニュー", footAria: "サイト情報", about: "運営者情報・お問い合わせ",
    disclosure: "当サイトはAmazonアソシエイト・楽天アフィリエイトなどの広告プログラムに参加しています。掲載商品の画像・名称の権利は各メーカーに帰属します。",
    month: (ym) => { const [y, m] = ym.split("-"); return `${y}年${Number(m)}月`; },
    datetime: (iso) => { if (!iso) return ""; const p = jstParts(iso); return `${p.y}年${p.m}月${p.d}日 ${p.hh}:${p.mm}`; },
    lineup: (n) => `全${n}種`, perPlay: "1回", series: (n) => `${n} シリーズ`,
    home: "トップ", logoAria: "トップへ",
    heroH1: "手のひらの名品を、<br>いちばん早く見つける。",
    heroLead: "新作ガチャガチャの発売日・価格・ラインナップから、近くの在庫店まで。大人のコレクターのための情報を、ひとつの場所に。",
    heroCount: (a, b) => `いま <b>${a}</b> シリーズを掲載、うち <b>${b}</b> シリーズが来月以降に発売。`,
    quizTitle: "あなたに合うガチャ診断", q1: "好きなジャンル（いくつでも）", q2: "好みのテイスト（いくつでも）", q3: "1回あたりの予算",
    budgets: [["any", "こだわらない"], ["300", "300円まで"], ["500", "400〜500円"], ["premium", "600円以上"]],
    quizBtn: "診断する", results: "診断結果",
    newTitle: "新着ガチャ", toCalendar: "発売カレンダーを見る", rankTitle: "注目のガチャ", genreTitle: "ジャンルから探す",
    maker: "メーカー", release: "発売月", genre: "ジャンル", tags: "タグ",
    findStores: "近くの在庫店を探す", official: "公式サイトで見る",
    storesTitle: "近くの在庫店", geoBtn: "現在地から探す", or: "または", prefAria: "都道府県で絞り込む", loading: "読み込み中…",
    stockLoading: "在庫情報を読み込んでいます…", stockNone: "この商品の在庫情報はまだありません。",
    stockFine: "取扱店の情報はバンダイ公式「ガシャポンどこ？」をもとにしています（通信機能のあるマシンを置いている店舗のみ）。実際の在庫と異なる場合があります。営業時間はご来店前に各店舗でご確認ください。現在地は距離の計算だけに使い、どこにも送信しません。",
    officialStores: "公式の店舗検索でも確かめる",
    buyTitle: "店舗で売り切れ？ネットで全種コンプ！", buyLead: "回しても揃わない、近くに置いていない。そんなときは通販のコンプリートセットを。",
    buyAria: "ネット通販", amazon: "Amazonで探す", rakuten: "楽天市場で探す",
    related: "同じジャンルのガチャ", seeAll: (g) => `${g}をすべて見る`,
    itemTitle: (n) => `${n}｜発売日・価格・在庫店`,
    itemDesc: (it, n, mk, mo) => `${n}（${mk}）は${mo}発売、1回${it.price}円${it.lineup ? `・全${it.lineup}種` : ""}のガチャガチャ。${it.description ? it.description + " " : ""}近くの在庫店や通販での入手方法もまとめています。`,
    genrePage: (g) => `${g}のガチャガチャ`, genreLead: (g, n) => `${g}ジャンルの新作・発売予定ガチャ${n}シリーズを新しい順に掲載しています。`,
    makerPage: (m) => `${m}のガチャガチャ`, makerLead: (m, n) => `${m}のガチャ${n}シリーズを新しい順に掲載しています。`,
    empty: "まだ掲載している商品はありません。",
    calTitle: "ガチャガチャ発売カレンダー", calH1: "発売カレンダー", calLead: "月ごとの発売予定です。発売時期は地域や店舗によって前後することがあります。",
    calDesc: "新作ガチャガチャの発売予定を月ごとに一覧できるカレンダー。価格・種類数・メーカーもまとめて確認できます。",
    thisMonth: "今月", calMonth: (y, m, n) => `${y}年${m}月<br>${n}シリーズ`,
    faqTitle: "よくある質問", faqLead: "在庫情報の見方や、通販での購入についてまとめました。",
    faqDesc: "在庫情報の精度、位置情報の扱い、通販での購入方法など、よくある質問への回答です。",
    faqs: [
      ["在庫情報はどのくらい正確ですか？", "各店舗の情報を定期的に集めて表示しています。更新の間に売り切れたり補充されたりすることがあるため、表示と実際が異なる場合があります。商品ページに「○時時点の情報」と表示しているので目安にしてください。"],
      ["現在地を使うと、位置情報はどこかに送られますか？", "送られません。現在地はお使いの端末の中で店舗までの距離を計算するためだけに使い、当サイトのサーバーを含めどこにも保存・送信しません。"],
      ["近くに在庫がないときはどうすればいいですか？", "商品ページの下にあるAmazon・楽天市場のボタンから、コンプリートセットや単品を探せます。発売から日が浅い商品は、数日後に店舗へ再入荷することもあります。"],
      ["発売日がメーカーの発表と違うことはありますか？", "当サイトはメーカーの発表をもとに月単位で掲載しています。実際の店頭に並ぶ時期は地域や店舗によって前後します。"],
      ["ガチャ診断はどうやって決まっていますか？", "選んだジャンル・テイスト・予算と、各商品に付けたタグを照らし合わせて、相性の高い順に表示しています。タグはAIで付けたものを含みます。"],
      ["掲載内容の誤りを見つけたら？", "運営者情報ページのお問い合わせ先からお知らせください。確認のうえ修正します。"],
    ],
    aboutTitle: "運営者情報・お問い合わせ", aboutH1: "運営者情報", aboutDesc: `${site.name}の運営者情報、お問い合わせ先、広告・免責事項について。`,
    contactForm: "お問い合わせフォーム", contactX: (x) => `X（旧Twitter）の <b>@${x}</b> までDMでご連絡ください。`, contactNone: "お問い合わせ窓口は準備中です。",
    aboutSections: (s) => [
      ["このサイトについて", `${s.name}は、大人のガチャファン・コレクターのためのカプセルトイ情報サイトです。新作の発売日・価格・ラインナップと、近くの在庫店をひとつの場所で確かめられることを目指しています。`],
      ["運営者", s.operator],
      ["お問い合わせ", null],
      ["広告について", "Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。また、楽天アフィリエイトなどの広告プログラムに参加しています。商品ページの「PR」表示があるボタンは広告リンクです。"],
      ["免責事項", "掲載している発売日・価格・在庫などの情報は、正確さに努めていますが内容を保証するものではありません。最新の情報は各メーカー・各店舗でご確認ください。当サイトの情報を利用して生じた損害について、運営者は責任を負いかねます。"],
      ["著作権について", "掲載商品の画像・名称・キャラクターの権利は、各メーカーおよび権利者に帰属します。掲載に問題がある場合はお問い合わせください。速やかに対応します。"],
      ["位置情報の扱い", "「現在地から探す」で取得した位置情報は、お使いの端末の中で店舗までの距離を計算するためだけに使い、保存・送信はしません。"],
    ],
  },
  en: {
    htmlLang: "en", ogLocale: "en_US", switchLabel: "日本語", switchAria: "日本語版",
    tagline: site.tagline_en, description: site.description_en,
    sampleBar: "Showing sample data. All items, stores and stock levels are fictional.",
    nav: { new: "New", ranking: "Ranking", calendar: "Calendar", genre: "Genres", faq: "FAQ" },
    navAria: "Main menu", footAria: "Site information", about: "About & contact",
    disclosure: "As an Amazon Associate and Rakuten affiliate, we earn from qualifying purchases. Product images and names belong to their respective makers.",
    month: (ym) => { const [y, m] = ym.split("-"); return `${MONTH_EN[Number(m) - 1]} ${y}`; },
    datetime: (iso) => { if (!iso) return ""; const p = jstParts(iso); return `${MONTH_EN[p.m - 1]} ${p.d}, ${p.y} ${p.hh}:${p.mm} JST`; },
    lineup: (n) => `${n} designs`, perPlay: "per play", series: (n) => `${n} series`,
    home: "Home", logoAria: "Home",
    heroH1: "Find Japan's finest<br>capsule toys first.",
    heroLead: "Release dates, prices and full lineups of new gacha, plus the shops near you that still have them in stock. A guide for collectors visiting Japan.",
    heroCount: (a, b) => `<b>${a}</b> series listed, <b>${b}</b> coming next month or later.`,
    quizTitle: "Find your gacha", q1: "Genres you like (pick any)", q2: "Your style (pick any)", q3: "Budget per play",
    budgets: [["any", "Any"], ["300", "Up to ¥300"], ["500", "¥400–500"], ["premium", "¥600+"]],
    quizBtn: "Show my matches", results: "Your matches",
    newTitle: "New arrivals", toCalendar: "See release calendar", rankTitle: "Editor's picks", genreTitle: "Browse by genre",
    maker: "Maker", release: "Release", genre: "Genre", tags: "Tags",
    findStores: "Find shops near me", official: "Official page",
    storesTitle: "Shops with stock", geoBtn: "Use my location", or: "or", prefAria: "Filter by prefecture", loading: "Loading…",
    stockLoading: "Loading stock information…", stockNone: "No stock information for this item yet.",
    stockFine: "Shop information is based on Bandai's official Gashapon store finder (shops with connected machines only). Stock may differ from what is shown. Please check opening hours with each shop. Your location is only used on your device to calculate distances and is never sent anywhere.",
    officialStores: "Check the official shop finder",
    buyTitle: "Sold out nearby? Get the full set online", buyLead: "Couldn't get the one you wanted, or no shop nearby? Complete sets are available from Japanese online stores.",
    buyAria: "Buy online", amazon: "Search Amazon Japan", rakuten: "Search Rakuten",
    related: "More in this genre", seeAll: (g) => `See all ${g}`,
    itemTitle: (n) => `${n} | Release date, price & shops`,
    itemDesc: (it, n, mk, mo) => `${n} by ${mk}: released ${mo}, ¥${it.price} per play${it.lineup ? `, ${it.lineup} designs` : ""}. ${it.description_en ? it.description_en + " " : ""}Find shops in Japan that have it in stock, or buy the set online.`,
    genrePage: (g) => `${g} capsule toys`, genreLead: (g, n) => `${n} new and upcoming ${g.toLowerCase()} gacha series, newest first.`,
    makerPage: (m) => `Capsule toys by ${m}`, makerLead: (m, n) => `${n} gacha series by ${m}, newest first.`,
    empty: "No items listed yet.",
    calTitle: "Gacha release calendar", calH1: "Release calendar", calLead: "Upcoming capsule toys by month. Actual arrival in shops can vary by area and store.",
    calDesc: "Monthly calendar of new Japanese capsule toy (gacha) releases with prices, number of designs and makers.",
    thisMonth: "This month", calMonth: (y, m, n) => `${MONTH_EN[m - 1]} ${y}<br>${n} series`,
    faqTitle: "FAQ", faqLead: "How to read stock information and how to buy online.",
    faqDesc: "Answers about stock accuracy, location privacy, buying gacha online and visiting shops in Japan.",
    faqs: [
      ["What is gacha (gashapon)?", "Gacha are capsule toy vending machines found all over Japan. Insert coins, turn the handle, and get one random item from the series. Most machines take ¥100 coins only, so bring change."],
      ["How accurate is the stock information?", "We collect stock information from shops regularly. Items can sell out or be restocked between updates, so treat it as a guide. Each item page shows when the information was collected."],
      ["Is my location sent anywhere?", "No. Your location is only used on your own device to calculate the distance to each shop. It is never stored or sent to our server or anyone else."],
      ["What if no shop nearby has it?", "Use the Amazon Japan or Rakuten buttons on the item page to look for complete sets. New releases are often restocked in shops a few days later."],
      ["Can I use a credit card at gacha machines?", "Most machines take coins only. Many dedicated gacha shops have change machines, and some newer machines accept IC cards such as Suica."],
      ["I found a mistake on the site.", "Please let us know through the contact details on the About page and we will correct it."],
    ],
    aboutTitle: "About & contact", aboutH1: "About", aboutDesc: `About ${site.name}, contact details, advertising and disclaimer.`,
    contactForm: "Contact form", contactX: (x) => `Send a DM to <b>@${x}</b> on X (Twitter).`, contactNone: "Contact details coming soon.",
    aboutSections: (s) => [
      ["About this site", `${s.name} is a capsule toy guide for adult collectors. We bring release dates, prices, lineups and nearby shops with stock together in one place.`],
      ["Operator", s.operator_en || s.operator],
      ["Contact", null],
      ["Advertising", "As an Amazon Associate we earn from qualifying purchases. We also take part in the Rakuten affiliate program. Buttons marked \"PR\" on item pages are affiliate links."],
      ["Disclaimer", "We do our best to keep release dates, prices and stock information accurate, but we cannot guarantee it. Please check with makers and shops for the latest information. We are not liable for any loss arising from use of this site."],
      ["Copyright", "Product images, names and characters belong to their makers and rights holders. If you have concerns about any content, please contact us and we will respond promptly."],
      ["Location data", "Location obtained with \"Use my location\" is only used on your device to calculate distances to shops. It is never stored or sent."],
    ],
  },
};

/* ---------- 画像：images/商品id.jpg（.webp .png .jpeg）を置けば自動で使う ---------- */
const findImage = (id) => {
  for (const ext of ["webp", "jpg", "jpeg", "png"]) {
    if (fs.existsSync(path.join(ROOT, "images", `${id}.${ext}`))) return `images/${id}.${ext}`;
  }
  return "";
};

/* ---------- 商品データのチェック（おかしい商品は飛ばして警告） ---------- */
const warnings = [];
const seen = new Set();
const items = rawItems.filter((it, i) => {
  const where = `items.json ${i + 1}件目（${it && it.name ? it.name : "名前なし"}）`;
  const need = ["id", "name", "maker", "price", "release", "genre"];
  const miss = need.filter((k) => it[k] === undefined || it[k] === "");
  if (miss.length) { warnings.push(`${where}: ${miss.join(", ")} が空なので載せませんでした`); return false; }
  if (!/^[a-z0-9-]+$/.test(it.id)) { warnings.push(`${where}: id は半角英小文字・数字・ハイフンだけにしてください`); return false; }
  if (seen.has(it.id)) { warnings.push(`${where}: id「${it.id}」が重複しています`); return false; }
  if (!/^\d{4}-\d{2}$/.test(it.release)) { warnings.push(`${where}: release は「2026-11」の形にしてください`); return false; }
  if (!GENRES.some((g) => g.slug === it.genre)) warnings.push(`${where}: genre「${it.genre}」は未登録なので「その他」に入れました`);

  seen.add(it.id);
  return true;
}).map((it) => ({
  moods: [], tags: [], tags_en: [], lineup: null, image: findImage(it.id), official_url: "", store_search_url: "", popularity: 0, added: today,
  description: "", description_en: "", name_en: "", maker_en: "",
  ...it,
  image: it.image || findImage(it.id),
  price: Number(it.price),
  genre: GENRES.some((g) => g.slug === it.genre) ? it.genre : "other",
  moods: (it.moods || []).filter((m) => moodSlugs.includes(m)),
}));

const validStores = stores.filter((s) => {
  if (typeof s.lat !== "number" || typeof s.lng !== "number") { warnings.push(`stores.json: ${s.id} は位置（緯度経度）がまだないので載せませんでした`); return false; }
  if (!s.source_url) warnings.push(`stores.json: ${s.id} に情報元（source_url）がありません`);
  return true;
});
const storeById = new Map(validStores.map((s) => [s.id, s]));
const stockByItem = new Map();
for (const row of stockFile.stock || []) {
  const s = storeById.get(row.store_id);
  if (!s) { warnings.push(`stock.json: 店舗ID「${row.store_id}」が stores.json にありません`); continue; }
  if (!["in_stock", "few", "out_of_stock"].includes(row.status)) { warnings.push(`stock.json: status「${row.status}」は使えません`); continue; }
  if (!stockByItem.has(row.item_id)) stockByItem.set(row.item_id, []);
  stockByItem.get(row.item_id).push({
    name: s.name, name_en: s.name_en || "", prefecture: s.prefecture, prefecture_en: PREF_EN[s.prefecture] || s.prefecture,
    address: s.address, address_en: s.address_en || "", lat: s.lat, lng: s.lng, status: row.status,
  });
}

/* ---------- 便利関数 ---------- */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const up = (n) => "../".repeat(n);
const langDir = (lang) => (lang === "ja" ? "" : `${lang}/`);
const canonical = (lang, p) => SITE_URL + "/" + langDir(lang) + p.replace(/^index\.html$/, "").replace(/\.html$/, "");
const absImg = (it) => (!it.image ? "" : /^https?:/.test(it.image) ? it.image : SITE_URL + "/" + it.image);
const makerSlug = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0; return "m" + h.toString(36); };
const isNew = (it) => daysBetween(it.added, today) <= 7;
const byNewest = (a, b) => (b.added > a.added ? 1 : b.added < a.added ? -1 : b.popularity - a.popularity);
const byPopular = (a, b) => b.popularity - a.popularity;

// 言語ごとの表示名
const nameOf = (it, lang) => (lang === "en" && it.name_en) || it.name;
const makerOf = (it, lang) => (lang === "en" && it.maker_en) || it.maker;
const descOf = (it, lang) => (lang === "en" ? it.description_en : it.description);
const tagsOf = (it, lang) => (lang === "en" && it.tags_en.length ? it.tags_en : it.tags);
const genreLabel = (g, lang) => (lang === "en" ? g.en : g.label);
const moodLabel = (m, lang) => (lang === "en" ? m.en || m.label : m.label);

const affiliate = (it) => {
  const q = `${it.name.replace(/【サンプル】/g, "")} ガチャ コンプ`;
  const amazon = `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}${site.amazon_tag ? `&tag=${encodeURIComponent(site.amazon_tag)}` : ""}`;
  const rakutenSearch = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`;
  const rakuten = site.rakuten_affiliate_id
    ? `https://hb.afl.rakuten.co.jp/hgc/${site.rakuten_affiliate_id}/?pc=${encodeURIComponent(rakutenSearch)}&m=${encodeURIComponent(rakutenSearch)}`
    : rakutenSearch;
  return { amazon, rakuten };
};

/* ---------- 書き出し ---------- */
const pages = []; // サイトマップ用 [lang, rel]
const write = (rel, content) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "style.css"), path.join(OUT, "assets/style.css"));
fs.copyFileSync(path.join(__dirname, "app.js"), path.join(OUT, "assets/app.js"));
if (fs.existsSync(path.join(ROOT, "images"))) fs.cpSync(path.join(ROOT, "images"), path.join(OUT, "images"), { recursive: true });

// 在庫データ（言語共通）
for (const it of items) {
  write(`data/stock/${it.id}.json`, JSON.stringify({
    updated_at: stockFile.updated_at, updated_ja: T.ja.datetime(stockFile.updated_at), updated_en: T.en.datetime(stockFile.updated_at),
    stores: stockByItem.get(it.id) || [],
  }));
}

const FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Noto+Sans+JP:wght@400;500;700&family=Shippori+Mincho+B1:wght@700;800&display=swap";

/* ================= 言語ごとにページを作る ================= */
for (const lang of LANGS) {
  const t = T[lang];
  const other = lang === "ja" ? "en" : "ja";

  /*
   * rel   … 言語フォルダの中での場所（例 item/abc.html）
   * depth … rel のフォルダの深さ（item/abc.html なら 1）
   * H     … 今のページから「この言語のトップ」への相対パス
   * R     … 今のページから「サイト直下（画像・CSS）」への相対パス
   */
  const ctx = (rel) => {
    const depth = rel.split("/").length - 1;
    return { depth, H: up(depth), R: up(depth + (lang === "ja" ? 0 : 1)) };
  };
  const imgURL = (it, R) => (!it.image ? "" : /^https?:/.test(it.image) ? it.image : R + it.image);

  const thumb = (it, R, { eager = false, badge = true } = {}) => {
    const src = imgURL(it, R);
    const img = src
      ? `<img src="${esc(src)}" alt="${esc(nameOf(it, lang))}" width="400" height="400" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
      : `<div class="capsule" aria-hidden="true"><i></i><span>NO IMAGE</span></div>`;
    return `<div class="thumb">${img}${badge && isNew(it) ? '<span class="badge-new">NEW</span>' : ""}</div>`;
  };
  const card = (it, c) => `<a class="card" href="${c.H}item/${it.id}.html">
  ${thumb(it, c.R)}
  <div class="card-meta">${esc(genreLabel(genreOf(it.genre), lang))}</div>
  <div class="card-name">${esc(nameOf(it, lang))}</div>
  <div class="card-foot"><span><b>¥${it.price}</b>${it.lineup ? ` / ${t.lineup(it.lineup)}` : ""}</span><span>${t.month(it.release)}</span></div>
</a>`;

  const layout = ({ rel, title, description, body, jsonld = [], ogImage = "", ogType = "website", current = "" }) => {
    const c = ctx(rel);
    const fragment = PREVIEW && lang === "ja" && rel === "index.html";
    const fullTitle = rel === "index.html" ? `${site.name}｜${t.tagline}` : `${title}｜${site.name}`;
    // 反対の言語の同じページへのリンク
    const switchHref = lang === "ja" ? `${c.H}en/${rel}` : `${c.R}${rel}`;
    const ld = jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n");
    const NAV = [["index.html#new", "new"], ["index.html#ranking", "ranking"], ["calendar.html", "calendar"], ["index.html#genres", "genre"], ["faq.html", "faq"]];
    const head = `<title>${esc(fullTitle)}</title>
${fragment ? '<meta name="claude:viewport-fit-sides" content="cover">' : ""}
<meta name="site-lang" content="${lang}">
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical(lang, rel))}">
<link rel="alternate" hreflang="ja" href="${esc(canonical("ja", rel))}">
<link rel="alternate" hreflang="en" href="${esc(canonical("en", rel))}">
<link rel="alternate" hreflang="x-default" href="${esc(canonical("ja", rel))}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="${t.ogLocale}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${esc(canonical(lang, rel))}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">
${site.x_account ? `<meta name="twitter:site" content="@${esc(site.x_account.replace(/^@/, ""))}">` : ""}
<meta name="theme-color" content="#121212">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${c.R}assets/style.css">
${ld}`;
    const content = `${site.sample_mode ? `<div class="sample-bar">${t.sampleBar}</div>` : ""}
<header class="site-header"><div class="wrap">
  <a class="logo" href="${c.H}index.html" aria-label="${esc(site.name)} ${t.logoAria}"><span class="logo-en">${esc(site.name)}</span><span class="logo-ja">${esc(t.tagline)}</span></a>
  <nav class="nav" aria-label="${t.navAria}">${NAV.map(([h, k]) => `<a href="${c.H}${h}"${k === current ? ' aria-current="page"' : ""}>${t.nav[k]}</a>`).join("")}</nav>
  <a class="lang-switch" href="${switchHref}" hreflang="${other}" lang="${other}" aria-label="${t.switchAria}">${t.switchLabel}</a>
</div></header>
<main>${body}</main>
<footer class="site-footer"><div class="wrap">
  <div>© ${nowJST.getUTCFullYear()} ${esc(site.name)}</div>
  <nav aria-label="${t.footAria}"><a href="${c.H}faq.html">${t.nav.faq}</a><a href="${c.H}about.html">${t.about}</a><a href="${c.H}calendar.html">${t.nav.calendar}</a><a href="${switchHref}" hreflang="${other}" lang="${other}">${t.switchLabel}</a></nav>
  <p class="disclosure">${t.disclosure}</p>
</div></footer>
<script src="${c.R}assets/app.js" defer></script>`;
    const html = fragment ? `${head}\n${content}` : `<!doctype html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${content}
</body>
</html>`;
    write(langDir(lang) + rel, html);
    pages.push([lang, rel]);
  };

  /* ---------- トップページ ---------- */
  {
    const c = ctx("index.html");
    const newest = [...items].sort(byNewest).slice(0, 8);
    const ranking = [...items].sort(byPopular).slice(0, 5);
    const upcoming = items.filter((it) => it.release > thisMonth).length;
    const embed = {
      home: c.H, root: c.R,
      items: items.map((it) => ({
        id: it.id, name: nameOf(it, lang), price: it.price, lineup: it.lineup, genre: it.genre, genre_label: genreLabel(genreOf(it.genre), lang),
        moods: it.moods, popularity: it.popularity, image: it.image, release_label: t.month(it.release),
      })),
    };
    const opt = (name, type, value, label, checked) =>
      `<label class="opt"><input type="${type}" name="${name}" value="${value}"${checked ? " checked" : ""}><span>${label}</span></label>`;

    const body = `
<div class="wrap">
  <section class="hero">
    <div>
      <h1>${t.heroH1}</h1>
      <p class="lead">${t.heroLead}</p>
      <p class="hero-count">${t.heroCount(items.length, upcoming)}</p>
    </div>
    <form class="quiz" id="quiz" aria-labelledby="quiz-title">
      <h2 id="quiz-title">${t.quizTitle}</h2>
      <fieldset><legend><b>1</b>${t.q1}</legend>
        <div class="opts">${GENRES.filter((g) => g.slug !== "other").map((g) => opt("genre", "checkbox", g.slug, genreLabel(g, lang))).join("")}</div>
      </fieldset>
      <fieldset><legend><b>2</b>${t.q2}</legend>
        <div class="opts">${site.moods.map((m) => opt("mood", "checkbox", m.slug, moodLabel(m, lang))).join("")}</div>
      </fieldset>
      <fieldset><legend><b>3</b>${t.q3}</legend>
        <div class="opts">${t.budgets.map(([v, l], i) => opt("budget", "radio", v, l, i === 0)).join("")}</div>
      </fieldset>
      <button class="btn btn-gold" type="submit">${t.quizBtn}</button>
    </form>
  </section>

  <section class="section" id="results" hidden aria-live="polite">
    <div class="section-head"><h2>${t.results}</h2></div>
    <p class="results-note" id="results-note"></p>
    <div class="grid" id="results-grid"></div>
  </section>

  <section class="section" id="new">
    <div class="section-head"><h2>${t.newTitle}</h2><a class="more" href="${c.H}calendar.html">${t.toCalendar}</a></div>
    <div class="grid">${newest.map((it) => card(it, c)).join("")}</div>
  </section>

  <section class="section" id="ranking">
    <div class="section-head"><h2>${t.rankTitle}</h2></div>
    <ol class="rank">${ranking.map((it, i) => `<li><a href="${c.H}item/${it.id}.html">
      <span class="rank-no">${i + 1}</span>${thumb(it, c.R, { badge: false })}
      <span style="min-width:0"><span class="card-name">${esc(nameOf(it, lang))}</span><span class="card-foot"><span><b>¥${it.price}</b></span><span>${t.month(it.release)}</span></span></span>
    </a></li>`).join("")}</ol>
  </section>

  <section class="section" id="genres">
    <div class="section-head"><h2>${t.genreTitle}</h2></div>
    <div class="genres">${GENRES.map((g) => `<a href="${c.H}genre/${g.slug}.html"><span class="ja">${genreLabel(g, lang)}</span><span class="n">${t.series(items.filter((it) => it.genre === g.slug).length)}</span></a>`).join("")}</div>
  </section>
</div>
<script type="application/json" id="items-data">${JSON.stringify(embed).replace(/</g, "\\u003c")}</script>`;

    layout({
      rel: "index.html", title: site.name, description: t.description, body, current: "new",
      jsonld: [{ "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: canonical(lang, "index.html"), description: t.description, inLanguage: lang }],
    });
  }

  /* ---------- 商品ページ ---------- */
  for (const it of items) {
    const rel = `item/${it.id}.html`;
    const c = ctx(rel);
    const g = genreOf(it.genre);
    const gl = genreLabel(g, lang);
    const name = nameOf(it, lang);
    const maker = makerOf(it, lang);
    const description = descOf(it, lang);
    const tags = tagsOf(it, lang);
    const aff = affiliate(it);
    const hasStock = (stockByItem.get(it.id) || []).length > 0;
    const related = items.filter((x) => x.genre === it.genre && x.id !== it.id).sort(byNewest).slice(0, 4);
    const desc = t.itemDesc(it, name, maker, t.month(it.release));

    const body = `
<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.H}genre/${g.slug}.html">${gl}</a><span>/</span><span>${esc(name)}</span></nav>
  <article class="item">
    <div>${thumb(it, c.R, { eager: true })}</div>
    <div>
      <h1>${esc(name)}</h1>
      ${lang === "en" && it.name_en ? `<p class="name-ja" lang="ja">${esc(it.name)}</p>` : ""}
      <div class="price"><small>${lang === "ja" ? t.perPlay : ""}</small><b>¥${it.price}</b><span>${lang === "en" ? t.perPlay : ""}${it.lineup ? `${lang === "en" ? " · " : ""}${t.lineup(it.lineup)}` : ""}</span></div>
      <dl class="spec">
        <dt>${t.maker}</dt><dd><a href="${c.H}maker/${makerSlug(it.maker)}.html">${esc(maker)}</a></dd>
        <dt>${t.release}</dt><dd>${t.month(it.release)}</dd>
        <dt>${t.genre}</dt><dd><a href="${c.H}genre/${g.slug}.html">${gl}</a></dd>
        ${tags.length ? `<dt>${t.tags}</dt><dd><div class="tags">${tags.map((x) => `<span class="chip chip-ai">${esc(x)}</span>`).join("")}</div></dd>` : ""}
      </dl>
      ${description ? `<p class="desc">${esc(description)}</p>` : ""}
      <div class="item-actions">
        <a class="btn btn-gold" href="#stock">${t.findStores}</a>
        ${it.official_url ? `<a class="btn" href="${esc(it.official_url)}" target="_blank" rel="noopener">${t.official}</a>` : ""}
      </div>
    </div>
  </article>

  <section class="section" id="stock" data-src="${c.R}data/stock/${it.id}.json" style="scroll-margin-top:24px">
    <div class="panel">
      <h2 style="font-size:22px">${t.storesTitle}</h2>
      <div class="stock-tools">
        <button class="btn btn-gold" type="button" id="geo-btn">${t.geoBtn}</button>
        <label for="pref" style="font-size:13px;color:var(--muted)">${t.or}</label>
        <select id="pref" aria-label="${t.prefAria}"><option value="">${t.loading}</option></select>
      </div>
      <p class="stock-status" id="stock-status" role="status">${hasStock ? t.stockLoading : t.stockNone}</p>
      <ul class="stores" id="store-list"></ul>
      <p class="fine"><span id="stock-updated"></span>${t.stockFine}
      ${it.store_search_url ? `<br><a href="${esc(it.store_search_url)}" target="_blank" rel="noopener" style="color:var(--gold-soft);border-bottom:1px solid var(--line-strong)">${t.officialStores}</a>` : ""}</p>
    </div>

    <aside class="buy" id="buy" aria-label="${t.buyAria}">
      <div>
        <h3>${t.buyTitle}<span class="pr">PR</span></h3>
        <p>${t.buyLead}</p>
      </div>
      <div class="btns">
        <a class="btn btn-gold" href="${esc(aff.amazon)}" target="_blank" rel="sponsored noopener">${t.amazon}</a>
        <a class="btn" href="${esc(aff.rakuten)}" target="_blank" rel="sponsored noopener">${t.rakuten}</a>
      </div>
    </aside>
  </section>

  ${related.length ? `<section class="section">
    <div class="section-head"><h2>${t.related}</h2><a class="more" href="${c.H}genre/${g.slug}.html">${t.seeAll(gl)}</a></div>
    <div class="grid">${related.map((x) => card(x, c)).join("")}</div>
  </section>` : ""}
</div>`;

    const product = {
      "@context": "https://schema.org", "@type": "Product", name, description: description || desc, sku: it.id,
      brand: { "@type": "Brand", name: maker }, category: gl, releaseDate: it.release,
      offers: { "@type": "Offer", price: it.price, priceCurrency: "JPY", url: canonical(lang, rel) },
    };
    if (absImg(it)) product.image = [absImg(it)];
    const crumbs = {
      "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
        { "@type": "ListItem", position: 2, name: gl, item: canonical(lang, `genre/${g.slug}.html`) },
        { "@type": "ListItem", position: 3, name },
      ],
    };
    layout({ rel, title: t.itemTitle(name), description: desc, body, jsonld: [product, crumbs], ogImage: absImg(it), ogType: "product" });
  }

  /* ---------- 一覧ページ（ジャンル別・メーカー別） ---------- */
  const listPage = (rel, { title, lead, list, current = "" }) => {
    const c = ctx(rel);
    const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>${esc(title)}</span></nav>
  <header class="page-head"><h1>${esc(title)}</h1><p class="lead">${esc(lead)}</p></header>
  <section class="section" style="padding-top:40px">${list.length ? `<div class="grid">${list.map((it) => card(it, c)).join("")}</div>` : `<p class="empty">${t.empty}</p>`}</section>
</div>`;
    layout({ rel, title, description: lead, body, current });
  };
  for (const g of GENRES) {
    const list = items.filter((it) => it.genre === g.slug).sort(byNewest);
    listPage(`genre/${g.slug}.html`, { title: t.genrePage(genreLabel(g, lang)), lead: t.genreLead(genreLabel(g, lang), list.length), list, current: "genre" });
  }
  for (const maker of [...new Set(items.map((it) => it.maker))]) {
    const list = items.filter((it) => it.maker === maker).sort(byNewest);
    const label = makerOf(list[0], lang);
    listPage(`maker/${makerSlug(maker)}.html`, { title: t.makerPage(label), lead: t.makerLead(label, list.length), list });
  }

  /* ---------- 発売カレンダー ---------- */
  {
    const c = ctx("calendar.html");
    const months = [...new Set(items.map((it) => it.release))].sort();
    const body = `<div class="wrap">
  <header class="page-head"><h1>${t.calH1}</h1><p class="lead">${t.calLead}</p></header>
  <div class="section" style="padding-top:40px">${months.map((m) => {
    const [y, mo] = m.split("-");
    const list = items.filter((it) => it.release === m).sort(byPopular);
    return `<section class="month" id="m${m}"><div class="month-label"><b>${mo}</b><span>${t.calMonth(y, Number(mo), list.length)}</span>${m === thisMonth ? `<br><span class="now">${t.thisMonth}</span>` : ""}</div>
      <div class="grid">${list.map((it) => card(it, c)).join("")}</div></section>`;
  }).join("")}</div>
</div>`;
    layout({ rel: "calendar.html", title: t.calTitle, description: t.calDesc, body, current: "calendar" });
  }

  /* ---------- よくある質問 ---------- */
  {
    const body = `<div class="wrap">
  <header class="page-head"><h1>${t.faqTitle}</h1><p class="lead">${t.faqLead}</p></header>
  <div class="faq">${t.faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><div class="a">${esc(a)}</div></details>`).join("")}</div>
</div>`;
    const jsonld = [{ "@context": "https://schema.org", "@type": "FAQPage", inLanguage: lang, mainEntity: t.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }];
    layout({ rel: "faq.html", title: t.faqTitle, description: t.faqDesc, body, jsonld, current: "faq" });
  }

  /* ---------- 運営者情報 ---------- */
  {
    const x = site.x_account ? site.x_account.replace(/^@/, "") : "";
    const contact = site.contact_url
      ? `<p><a class="btn btn-gold" href="${esc(site.contact_url)}" target="_blank" rel="noopener">${t.contactForm}</a></p>`
      : x ? `<p>${t.contactX(esc(x))}</p>` : `<p>${t.contactNone}</p>`;
    const body = `<div class="wrap">
  <header class="page-head"><h1>${t.aboutH1}</h1></header>
  <div class="prose">${t.aboutSections(site).map(([h, p]) => `<h2>${h}</h2>${p === null ? contact : `<p>${esc(p)}</p>`}`).join("\n")}</div>
</div>`;
    layout({ rel: "about.html", title: t.aboutTitle, description: t.aboutDesc, body });
  }
}

/* ---------- 404・サイトマップ・robots・キャッシュ設定 ---------- */
write("404.html", `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ページが見つかりません / Page not found｜${esc(site.name)}</title><link rel="stylesheet" href="/assets/style.css"></head>
<body><main><div class="wrap"><header class="page-head"><h1>ページが見つかりません</h1><p class="lead">販売終了などで掲載を終えた可能性があります。<br><span lang="en">This page could not be found. It may have been removed.</span></p>
<p style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-gold" href="/">トップへ戻る</a><a class="btn" href="/en/" lang="en">English home</a></p></header></div></main></body></html>`);

const urlEntry = ([lang, rel]) => `  <url><loc>${esc(canonical(lang, rel))}</loc><lastmod>${today}</lastmod>
    <xhtml:link rel="alternate" hreflang="ja" href="${esc(canonical("ja", rel))}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${esc(canonical("en", rel))}"/>
  </url>`;
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.map(urlEntry).join("\n")}
</urlset>
`);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
write("_headers", `/assets/*\n  Cache-Control: public, max-age=86400\n/images/*\n  Cache-Control: public, max-age=604800\n/data/*\n  Cache-Control: public, max-age=300\n`);

const noEn = items.filter((it) => !it.name_en).length;
if (noEn) warnings.push(`英語名（name_en）がまだない商品が${noEn}件あります（英語ページでは日本語名を表示）`);

/* ---------- 結果 ---------- */
console.log(`✔ ${items.length}商品・${validStores.length}店舗から 日本語${pages.filter((p) => p[0] === "ja").length}・英語${pages.filter((p) => p[0] === "en").length}ページを ${path.relative(ROOT, OUT)}/ に書き出しました`);
if (warnings.length) { console.log(`⚠ 注意 ${warnings.length}件:`); warnings.forEach((w) => console.log("  - " + w)); }
