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
const titles = readJSON("titles.json", []); // 診断の「作品名」カタログ
// ハートの数（公開の直前に GitHub Actions がサイトから読み込む。無ければ空）
const votes = (() => { try { const v = readJSON("votes.json", {}); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } })();
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
    navShort: { calendar: "カレンダー", map: "マップ", toprated: "高評価店", faq: "Q&A" },
    nav: { map: "ガチャマップ", katsu: "ガチャ活", week: "今週発売", lottery: "抽選情報", toprated: "評価の高いお店", new: "新着", ranking: "人気", calendar: "発売カレンダー", genre: "種類", faq: "よくある質問" },
    navAria: "メインメニュー", footAria: "サイト情報", about: "運営者情報・お問い合わせ",
    disclosure: "当サイトはAmazonアソシエイト・楽天アフィリエイトなどの広告プログラムに参加しています。掲載商品の画像・名称の権利は各メーカーに帰属します。",
    month: (ym) => { const [y, m] = ym.split("-"); return `${y}年${Number(m)}月`; },
    datetime: (iso) => { if (!iso) return ""; const p = jstParts(iso); return `${p.y}年${p.m}月${p.d}日 ${p.hh}:${p.mm}`; },
    lineup: (n) => `全${n}種`, perPlay: "1回", series: (n) => `${n} シリーズ`,
    home: "トップ", logoAria: "トップへ",
    heroH1: "手のひらの名品を、<br>いちばん早く見つける。",
    heroLead: "<span class=\"ph\">新作ガチャの</span><span class=\"ph\">発売日・</span><span class=\"ph\">価格・</span><span class=\"ph\">ラインナップから、</span><br class=\"br-pc\"><span class=\"ph\">近くの在庫店まで。</span>",
    heroSub: "<span class=\"ph\">ガチャ好きのための情報を、</span><span class=\"ph\">ひとつの場所に。</span>",
    stats: ["掲載シリーズ", "今月の発売", "取扱店舗"],
    quizTitle: "あなたに合うガチャ診断", qGender: "あなたの性別は？", qAge: "年代は？", q1: "好きなジャンルは？（いくつでも）", q2: "好みのテイストは？（いくつでも）", q3: "1回あたりの予算は？",
    genders: [["male", "男性"], ["female", "女性"], ["none", "答えない"]],
    ages: [["10", "10代"], ["20", "20代"], ["30", "30代"], ["40", "40代"], ["50", "50代以上"]],
    next: "次へ", skip: "こだわらない", back: "戻る",
    searchPh: "商品名・作品名で探す", searchAria: "商品を検索", searchTitle: "検索結果", searchNone: "見つかりませんでした。ことばを短くするか、ひらがな・カタカナを変えてみてください。", searchCount: "件",
    leafPrefix: (n) => `「${n}」からさらに選ぶ`, leafFilter: "作品名・名前でしぼりこむ", leafAll: (n) => `ぜんぶ見る（${n}件）`, leafNone: "見つかりません",
    sortAria: "並び替え", sorts: [["match", "相性順"], ["new", "新着順"], ["popular", "人気順"], ["release", "発売日順"], ["cheap", "安い順"]], showMore: "もっと見る",
    qGroups: "好きな系統は？（いくつでも）", more: "さらに詳しく選ぶ", less: "閉じる",
    groupsHint: "詳しく選ばない場合は、その系統のすべてが対象になります。詳しい項目を選ぶと、さらに細かい項目が出てきます。",
    budgets: [["any", "こだわらない"], ["300", "300円まで"], ["500", "400〜500円"], ["premium", "600円以上"]],
    quizBtn: "診断する", results: "診断結果",
    newTitle: "新着ガチャ", toCalendar: "発売カレンダーを見る", rankTitle: "人気ランキング", genreTitle: "ジャンルから探す", typeTitle: "種類から探す", typePage: (g) => `${g}のガチャガチャ新作・発売日一覧【${YM_NOW}】`, typeLead: (g, n) => `${g}のガチャ${n}シリーズを新しい順に掲載しています。`,
    maker: "メーカー", release: "発売月", genre: "ジャンル", tags: "タグ",
    findStores: "近くの在庫店を探す", official: "公式サイトで見る",
    storesTitle: "近くの在庫店", geoBtn: "現在地から探す", or: "または", prefAria: "都道府県で絞り込む", loading: "読み込み中…",
    stockLoading: "在庫情報を読み込んでいます…", stockNone: "この商品の在庫情報はまだありません。",
    stockFine: "取扱店の情報はバンダイ公式「ガシャポンどこ？」をもとにしています（通信機能のあるマシンを置いている店舗のみ）。実際の在庫と異なる場合があります。営業時間はご来店前に各店舗でご確認ください。現在地は距離の計算だけに使い、どこにも送信しません。",
    officialStores: "公式の店舗検索でも確かめる",
    buyTitle: "店舗で売り切れ？ネットで全種コンプ！", buyLead: "回しても揃わない、近くに置いていない。そんなときは通販のコンプリートセットを。",
    buyAria: "ネット通販", amazon: "Amazonで探す", rakuten: "楽天市場で探す",
    fleaTitle: "単品で欲しいならフリマ・オークション", fleaLead: "「あのキャラだけ欲しい」「1つだけ安く」ならこちら。", mercari: "メルカリで探す", yahoo: "ヤフオクで探す", rakuma: "ラクマで探す",
    lineupTitle: (n) => `ラインナップ（全${n}種）`, lineupNote: "メーカー公式の商品情報をもとにしています。", ageMin: (n) => `${n}才以上`, ageLabel: "対象年齢",
    heart: "推し", heartAria: "ハートで応援（人気ランキングに反映）", heartNote: "ハートを押すと人気ランキングに反映されます（1日1回）",
    arrTitle: "入荷情報", arrLoading: "入荷情報を読み込んでいます…", arrNone: "まだ入荷を確認できていません。設置店に入り次第ここに出ます。",
    arrIn: "在庫あり", arrRestock: "累計補充", arrFirst: "初回観測", arrShops: (n) => `${n}店舗`, arrTimes: (n) => `${n}回`,
    arrFastTitle: "入荷が早かった店", arrFastNote: "初回観測からどれくらいで入ったか（売り切れの店も含む）。",
    arrPrefTitle: "都道府県別", arrPrefNote: "入荷を確認できた店の数と、早かった上位10店の平均（初回観測から14日以内）。",
    arrAvg: (d) => `平均${d}日`, arrNoAvg: "14日以内の入荷なし", arrStockOn: "在庫あり", arrStockOff: "在庫なし",
    feedTitle: "入荷速報", feedNew: "新入荷", feedBack: "在庫復活", feedNote: (n, s) => `${s}店で在庫あり${n ? `・補充${n}回` : ""}`,
    oshiLabel: "推しの名前・キャラ名（あれば）", oshiPh: "例：タママ、ちいかわ、ルフィ",
    related: "同じジャンルのガチャ", seeAll: (g) => `${g}をすべて見る`,
    itemTitle: (n) => `${n}${/ガチャ|ガシャ/.test(n) ? "" : "（ガチャ）"}｜発売日・値段・どこで売ってる？`,
    itemDesc: (it, n, mk, mo) => `${n}（${mk}）は${mo}発売${it.price ? `、1回${it.price}円` : ""}${it.lineup ? `・全${it.lineup}種` : ""}のガチャガチャ。${it.description ? it.description + " " : ""}近くの在庫店や通販での入手方法もまとめています。`,
    genrePage: (g) => `${g}のガチャガチャ新作・発売日一覧【${YM_NOW}】`, genreLead: (g, n) => `${g}ジャンルの新作・発売予定ガチャ${n}シリーズを新しい順に掲載しています。`,
    makerPage: (m) => `${m}のガチャガチャ新作・発売日一覧【${YM_NOW}】`, makerLead: (m, n) => `${m}のガチャ${n}シリーズを新しい順に掲載しています。`,
    empty: "まだ掲載している商品はありません。",
    calTitle: "ガチャガチャ発売カレンダー", calH1: "発売カレンダー", calLead: "公式に発表されている先の月まで、発売週ごとに並べています。「第◯週」はその週から順次発売という意味で、お店や地域によって前後します。",
    calDesc: "新作ガチャガチャの発売予定を月ごとに一覧できるカレンダー。価格・種類数・メーカーもまとめて確認できます。",
    calPast: "過去の発売", calMonthTitle: (y, m) => `${y}年${m}月発売のガチャガチャ`,
    thisMonth: "今月", calMonth: (y, m, n) => `${y}年${m}月<br>${n}シリーズ`,
    faqTitle: "よくある質問", faqLead: "在庫情報の見方や、通販での購入についてまとめました。",
    faqDesc: "在庫情報の精度、位置情報の扱い、通販での購入方法など、よくある質問への回答です。",
    faqs: [
      ["在庫情報はどのくらい正確ですか？", "各店舗の情報を定期的に集めて表示しています。更新の間に売り切れたり補充されたりすることがあるため、表示と実際が異なる場合があります。商品ページに「○時時点の情報」と表示しているので目安にしてください。"],
      ["現在地を使うと、位置情報はどこかに送られますか？", "送られません。現在地はお使いの端末の中で店舗までの距離を計算するためだけに使い、当サイトのサーバーを含めどこにも保存・送信しません。"],
      ["近くに在庫がないときはどうすればいいですか？", "商品ページの下にあるAmazon・楽天市場のボタンから、コンプリートセットや単品を探せます。発売から日が浅い商品は、数日後に店舗へ再入荷することもあります。"],
      ["発売日がメーカーの発表と違うことはありますか？", "当サイトはメーカーの発表をもとに、発売週ごとに掲載しています。実際の店頭に並ぶ時期は地域や店舗によって前後します。"],
      ["「11月第2週発売」は何日から売られますか？", "当サイトでは、その月の最初の月曜日から始まる週を「第1週」として数えています（例：2026年11月の第1週は11/2〜11/8、第2週は11/9〜11/15）。メーカーの「第◯週」は、その週から順次お店に並ぶという意味で、決まった発売日はありません。早いお店で週の初め、遅いお店では翌週になることもあります。"],
      ["先の月の新作はいつごろわかりますか？", "バンダイ・タカラトミーアーツは、おおむね1〜2か月前に発売予定を公式サイトで発表します。当サイトは1日3回公式の発表を確かめ、3か月先まで発売カレンダーに自動で追加しています。"],
      ["ガチャ診断はどうやって決まっていますか？", "選んだジャンル・テイスト・予算と、各商品に付けたタグを照らし合わせて、相性の高い順に表示しています。タグはAIで付けたものを含みます。"],
      ["掲載内容の誤りを見つけたら？", "運営者情報ページのお問い合わせ先からお知らせください。確認のうえ修正します。"],
    ],
    aboutTitle: "運営者情報・お問い合わせ", aboutH1: "運営者情報", aboutDesc: `${site.name}の運営者情報、お問い合わせ先、広告・免責事項について。`,
    contactForm: "お問い合わせフォーム", contactX: (x) => `X（旧Twitter）の <b>@${x}</b> までDMでご連絡ください。`, contactNone: "お問い合わせ窓口は準備中です。",
    aboutSections: (s) => [
      ["このサイトについて", `${s.name}は、ガチャガチャ好きのためのカプセルトイ情報サイトです。新作の発売日・価格・ラインナップと、近くの在庫店をひとつの場所で確かめられることを目指しています。`],
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
    navShort: { map: "Map", katsu: "Route", toprated: "Top shops", lottery: "Lottery", ranking: "Popular" },
    nav: { map: "Gacha map", katsu: "Gacha route", week: "This week", lottery: "Lotteries", toprated: "Top shops", new: "New", ranking: "Popular", calendar: "Calendar", genre: "Types", faq: "FAQ" },
    navAria: "Main menu", footAria: "Site information", about: "About & contact",
    disclosure: "As an Amazon Associate and Rakuten affiliate, we earn from qualifying purchases. Product images and names belong to their respective makers.",
    month: (ym) => { const [y, m] = ym.split("-"); return `${MONTH_EN[Number(m) - 1]} ${y}`; },
    datetime: (iso) => { if (!iso) return ""; const p = jstParts(iso); return `${MONTH_EN[p.m - 1]} ${p.d}, ${p.y} ${p.hh}:${p.mm} JST`; },
    lineup: (n) => `${n} designs`, perPlay: "per play", series: (n) => `${n} series`,
    home: "Home", logoAria: "Home",
    heroH1: "Find Japan's finest<br>capsule toys first.",
    heroLead: "Found a capsule toy you love? See when it comes out, how much it costs, and which shops in Japan have it — near where you are right now.",
    heroSub: "The capsule toy guide for visitors and residents in Japan. Look for signs that say ガチャ or ガシャポン!",
    stats: ["Toys listed", "Out this month", "Shops on the map"],
    quizTitle: "Find a gacha you'll love", qGender: "You are…", qAge: "Your age", q1: "Genres you like (pick any)", q2: "Your style (pick any)", q3: "Budget per play",
    genders: [["male", "Male"], ["female", "Female"], ["none", "Prefer not to say"]],
    ages: [["10", "Teens"], ["20", "20s"], ["30", "30s"], ["40", "40s"], ["50", "50+"]],
    next: "Next", skip: "No preference", back: "Back",
    searchPh: "Search items or series", searchAria: "Search items", searchTitle: "Search results", searchNone: "No results. Try a shorter word.", searchCount: " results",
    leafPrefix: (n) => `Narrow down ${n}`, leafFilter: "Filter by title or name", leafAll: (n) => `Show all (${n})`, leafNone: "No matches",
    sortAria: "Sort", sorts: [["match", "Best match"], ["new", "Newest"], ["popular", "Popular"], ["release", "Release date"], ["cheap", "Lowest price"]], showMore: "Show more",
    qGroups: "What do you like? (pick any)", more: "Narrow it down", less: "Close",
    groupsHint: "If you don't narrow it down, everything in that group counts. Pick a detail to see even finer options.",
    budgets: [["any", "Any"], ["300", "Up to ¥300"], ["500", "¥400–500"], ["premium", "¥600+"]],
    quizBtn: "Show my matches", results: "Your matches",
    newTitle: "New in Japan", toCalendar: "Release calendar", rankTitle: "Most popular right now", genreTitle: "Browse by genre", typeTitle: "Browse by type", typePage: (g) => `${g} capsule toys in Japan – new releases`, typeLead: (g, n) => `${n} ${g.toLowerCase()} gacha series sold in Japan, newest first. Tap one to see the price, release week and shops that have it.`,
    maker: "Maker", release: "Release", genre: "Genre", tags: "Tags",
    findStores: "Where can I buy it?", official: "Maker's page (Japanese)",
    storesTitle: "Shops in Japan that have it", geoBtn: "Show shops near me", or: "or", prefAria: "Filter by prefecture", loading: "Loading…",
    stockLoading: "Loading stock information…", stockNone: "No stock information for this item yet.",
    stockFine: "Shop list comes from Bandai's official Gashapon shop finder (only shops with online-connected machines). Popular toys sell out fast, so stock may be different when you arrive. Please check opening hours before you go. Your location stays on your phone — it is only used to sort shops by distance.",
    officialStores: "Check Bandai's official shop finder (Japanese)",
    buyTitle: "Sold out? Buy the full set online", buyLead: "Couldn't find it in shops? Japanese online stores often sell the complete set. If you are staying in Japan, you can usually have it delivered to a Japanese address — many hotels will hold a parcel for guests (ask your hotel first).",
    buyAria: "Buy online", amazon: "Search on Amazon Japan", rakuten: "Search on Rakuten",
    fleaTitle: "Want just one design? Try resale apps", fleaLead: "People in Japan often resell single pieces they got twice. Japanese resale apps and auction sites are a good place to look.", mercari: "Search on Mercari", yahoo: "Search on Yahoo! Auctions", rakuma: "Search on Rakuma",
    lineupTitle: (n) => `Lineup (${n} designs)`, lineupNote: "From the maker's official information. Names are shown in Japanese, as they appear on the machine.", ageMin: (n) => `Ages ${n}+`, ageLabel: "Ages",
    heart: "Like", heartAria: "Send a like (counts toward the popularity ranking)", heartNote: "Likes count toward the popularity ranking (once a day)",
    arrTitle: "When did shops get it?", arrLoading: "Loading arrival data…", arrNone: "No shop has it yet. Shops will appear here as soon as it arrives.",
    arrIn: "In stock", arrRestock: "Restocks", arrFirst: "First seen", arrShops: (n) => `${n} shops`, arrTimes: (n) => `${n}`,
    arrFastTitle: "Fastest shops", arrFastNote: "How soon after first sighting each shop got it (including sold-out shops).",
    arrPrefTitle: "By prefecture", arrPrefNote: "Shops that got it, and the average of the 10 fastest (within 14 days of first sighting).",
    arrAvg: (d) => `avg ${d} days`, arrNoAvg: "none within 14 days", arrStockOn: "in stock", arrStockOff: "sold out",
    feedTitle: "Just arrived in shops", feedNew: "New arrival", feedBack: "Back in stock", feedNote: (n, s) => `In stock at ${s} shops${n ? ` · ${n} restocks` : ""}`,
    oshiLabel: "Favorite character (optional)", oshiPh: "e.g. Pokémon, Hello Kitty, Chiikawa",
    related: "You might also like", seeAll: (g) => `See all ${g}`,
    itemTitle: (n) => `${n} | Gacha in Japan: price, release date & where to buy`,
    itemDesc: (it, n, mk, mo) => `${n} by ${mk}: released ${mo}${it.price ? `, ¥${it.price} per play` : ""}${it.lineup ? `, ${it.lineup} designs` : ""}. ${it.description_en ? it.description_en + " " : ""}See which shops in Japan have it, or buy the full set online.`,
    genrePage: (g) => `${g} capsule toys in Japan – new releases`, genreLead: (g, n) => `${n} new and upcoming ${g.toLowerCase()} gacha in Japan, newest first. Tap one to see the price, release week and shops that have it.`,
    makerPage: (m) => `${m} capsule toys – new releases in Japan`, makerLead: (m, n) => `${n} gacha series by ${m}, newest first.`,
    empty: "No items listed yet.",
    calTitle: "Japan gacha release calendar", calH1: "Gacha release calendar", calLead: "Every announced capsule toy in Japan, sorted by release week. Visiting soon? Check what comes out during your trip. Shops can get them a few days earlier or later.",
    calDesc: "Monthly calendar of new Japanese capsule toy (gacha) releases with prices, number of designs and makers.",
    calPast: "Past releases", calMonthTitle: (y, m) => `Gacha released in ${MONTH_EN[m - 1]} ${y}`,
    thisMonth: "This month", calMonth: (y, m, n) => `${MONTH_EN[m - 1]} ${y}<br>${n} series`,
    faqTitle: "Gacha in Japan: FAQ", faqLead: "New to gacha? Here is how to play, where to find machines, and how to pay.",
    faqDesc: "How to play gacha in Japan, where to find capsule toy machines, coins and payment, and how to read release weeks and stock information.",
    faqs: [
      ["What is gacha (gashapon)?", "Gacha are capsule toy vending machines you can find all over Japan. You put in coins, turn the handle, and get one random toy from the series shown on the machine. You can't choose which one you get — that's part of the fun!"],
      ["How do I play?", "1) Check the price on the machine (usually ¥200–¥500). 2) Put in ¥100 coins. 3) Turn the handle clockwise until the capsule drops. 4) Open it and enjoy. Most shops have a box next to the machines for empty capsules."],
      ["Where can I find gacha machines?", "Almost everywhere: train stations, shopping malls, electronics stores, bookstores, airports and dedicated gacha shops with hundreds of machines. Big gacha shops are easy to find in areas like Akihabara and Ikebukuro in Tokyo, or Namba in Osaka. Use our map or the \"Show shops near me\" button on each toy's page."],
      ["What coins do I need? Can I use a credit card?", "Most machines take ¥100 coins only. Gacha shops usually have a change machine (it turns ¥1,000 bills into ¥100 coins). Some newer machines also accept IC cards like Suica or PASMO, but credit cards generally can't be used."],
      ["What does \"week 2 of November\" mean?", "Makers announce a release week, not an exact date. We count the week starting on the first Monday of the month as week 1 (in November 2026, week 1 is Nov 2–8 and week 2 is Nov 9–15). Shops add new toys during that week, so they may appear a few days earlier or later depending on the shop."],
      ["How accurate is the stock information?", "We collect it from shops regularly, but popular toys can sell out quickly. Please use it as a guide. Each toy's page shows when the information was last updated."],
      ["What if it's sold out everywhere?", "Shops often restock a few days after release. You can also look for the full set on Amazon Japan or Rakuten, or a single piece on Japanese resale apps, using the buttons on each toy's page."],
      ["Is my location sent anywhere?", "No. Your location is only used on your own phone to sort shops by distance. It is never saved or sent to us or anyone else."],
      ["I found a mistake on the site.", "Please let us know through the contact details on the About page and we will fix it."],
    ],
    aboutTitle: "About & contact", aboutH1: "About", aboutDesc: `About ${site.name}, contact details, advertising and disclaimer.`,
    contactForm: "Contact form", contactX: (x) => `Send a DM to <b>@${x}</b> on X (Twitter).`, contactNone: "Contact details coming soon.",
    aboutSections: (s) => [
      ["About this site", `${s.name} is a guide to capsule toys (gacha) in Japan for visitors and residents. We bring release dates, prices, lineups and the shops that have them together in one place, so you can find the toy you want during your stay.`],
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
// 一覧用の小さい画像（images/thumb/商品id.webp。取り込みのときに作る）。無ければ元の画像
const thumbOf = (img) => {
  const m = /^images\/([^/]+)\.\w+$/.exec(img || "");
  return m && fs.existsSync(path.join(ROOT, "images", "thumb", `${m[1]}.webp`)) ? `images/thumb/${m[1]}.webp` : img;
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

  seen.add(it.id);
  return true;
}).map((it) => ({
  moods: [], tags: [], tags_en: [], lineup: null, image: findImage(it.id), official_url: "", store_search_url: "", popularity: 0, added: today,
  description: "", description_en: "", name_en: "", maker_en: "",
  ...it,
  image: it.image || findImage(it.id),
  price: Number(it.price),
  legacy_genre: it.genre,
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
const hashSlug = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0; return "m" + h.toString(36); };
const MAKER_SLUG = { "バンダイ": "bandai", "タカラトミーアーツ": "takara-tomy-arts", "キタンクラブ": "kitan-club", "クオリア": "qualia", "ブシロード": "bushiroad", "エポック社": "epoch", "ケンエレファント": "kenelephant" };
const makerSlug = (name) => MAKER_SLUG[name] || hashSlug(name);
const isNew = (it) => daysBetween(it.added, today) <= 7;
const byNewest = (a, b) => (b.added > a.added ? 1 : b.added < a.added ? -1 : b.popularity - a.popularity);
const heartsOf = (it) => Number(votes[it.id]) || 0;
const byPopular = (a, b) => heartsOf(b) - heartsOf(a) || b.popularity - a.popularity;

// 言語ごとの表示名
const nameOf = (it, lang) => (lang === "en" && it.name_en) || it.name;
const makerOf = (it, lang) => (lang === "en" && it.maker_en) || it.maker;
const descOf = (it, lang) => (lang === "en" ? it.description_en : it.description);
const tagsOf = (it, lang) => (lang === "en" && it.tags_en.length ? it.tags_en : it.tags);
const genreLabel = (g, lang) => (lang === "en" ? g.en : g.label);
// 「・」の後ろでだけ改行する（言葉の途中で折り返さない）
const phr = (s) => esc(s).split(/(?<=・)/).map((w) => `<span class="ph">${w}</span>`).join("");
const inGenre = (slug) => items.filter((it) => it._genres.includes(slug));
const TYPES = site.types || [];
const inType = (slug) => { const ty = TYPES.find((x) => x.slug === slug); return ty ? items.filter((it) => it._qs.some((k) => ty.subs.includes(k))) : []; };
const moodLabel = (m, lang) => (lang === "en" ? m.en || m.label : m.label);

const affSearch = (q) => {
  const amazon = `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}${site.amazon_tag ? `&tag=${encodeURIComponent(site.amazon_tag)}` : ""}`;
  const rs = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`;
  const rakuten = site.rakuten_affiliate_id ? `https://hb.afl.rakuten.co.jp/hgc/${site.rakuten_affiliate_id}/?pc=${encodeURIComponent(rs)}&m=${encodeURIComponent(rs)}` : rs;
  return { amazon, rakuten };
};
const affiliate = (it) => {
  const q = `${it.name.replace(/【サンプル】/g, "")} ガチャ コンプ`;
  const amazon = `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}${site.amazon_tag ? `&tag=${encodeURIComponent(site.amazon_tag)}` : ""}`;
  const rakutenSearch = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`;
  const rakuten = site.rakuten_affiliate_id
    ? `https://hb.afl.rakuten.co.jp/hgc/${site.rakuten_affiliate_id}/?pc=${encodeURIComponent(rakutenSearch)}&m=${encodeURIComponent(rakutenSearch)}`
    : rakutenSearch;
  return { amazon, rakuten };
};

// 英語ページ用：海外の人向けのリンク（site.json にIDを入れたものだけ出す）
//   amazon_us_tag：アメリカのAmazonアソシエイトのトラッキングID（OneLink で見た人の国のAmazonへ）
//   ebay_campid：eBay Partner Network のキャンペーンID
//   buyee_link：Buyee のアフィリエイトリンク（飛び先の場所に {url} と書いておく）
const overseas = (it) => {
  const base = (it.name_en || it.name.replace(/【[^】]*】/g, "").trim());
  const q = `${base} gashapon`;
  const out = {};
  if (site.amazon_us_tag) out.amazon = `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=${encodeURIComponent(site.amazon_us_tag)}`;
  if (site.ebay_campid) out.ebay = `https://www.ebay.com/sch/i.html?${new URLSearchParams({ _nkw: q, mkcid: "1", mkrid: "711-53200-19255-0", siteid: "0", campid: String(site.ebay_campid), customid: "gachapla", toolid: "10001", mkevt: "1" }).toString()}`;
  if (site.buyee_link && site.buyee_link.includes("{url}")) out.buyee = site.buyee_link.replace("{url}", encodeURIComponent(`https://buyee.jp/mercari/search?keyword=${encodeURIComponent(it.name.replace(/【[^】]*】/g, "").trim())}`));
  return out;
};

// JANコード（バンダイは公式URLや商品IDに入っている。タカラトミーアーツは取り込み時に jan に入れる）
const janOf = (it) => {
  if (it.jan && /^\d{13}$/.test(it.jan)) return it.jan;
  const m = (it.official_url || "").match(/jan_code=(\d{13})/) || String(it.id).match(/^bandai-(4[59]\d{11})$/);
  return m ? m[1] : "";
};
// メルカリアンバサダーのリンク（公式ツールで作ったものをそのまま使う。書きかえない）
const MERCARI_AF = (readJSON("mercari-links.json", { links: [] }) || { links: [] }).links || [];
const KW_ALIAS = { "ポケモン": /ポケモン|ポケットモンスター|ピカチュウ/, "ワンピース": /ワンピース|ONE PIECE/i, "ハローキティ": /ハローキティ|キティ/, "マイメロディ": /マイメロ/, "ジブリ": /ジブリ|トトロ|千と千尋|魔女の宅急便/, "めじるしアクセサリー": /めじるし/ };
// 商品ごとのメルカリリンク：メルカリの公式ツールで1件ずつ作って、ツールが出したものと同じだと確かめた商品のID
const MERCARI_ITEM_IDS = new Set((readJSON("mercari-item-ids.json", { ids: [] }) || { ids: [] }).ids || []);
const mercariQ = (it) => `${it.name.replace(/【[^】]*】/g, "").trim()} ガチャ`;
const mercariItemUrl = (it) => MERCARI_ITEM_IDS.has(it.id) ? "https://jp.mercari.com/search?afid=1350793153&" + new URLSearchParams({ keyword: mercariQ(it), status: "on_sale" }).toString() : "";
const mercariAf = (it) => { const tx = [it.name, (it.lineup_names || []).join(" ")].join(" "); const hit = MERCARI_AF.find(([k]) => (KW_ALIAS[k] || new RegExp(k)).test(tx)); return hit ? { kw: hit[0], url: hit[1] } : null; };
// 通販・フリマで探すリンク（JANがあればJANで、なければ商品名で）
const shopLinks = (it) => {
  const jan = janOf(it), name = it.name.replace(/【[^】]*】/g, "").trim();
  const q = jan || `${name} ガチャ`;
  const a = affSearch(q);
  const ys = `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(q)}`;
  const yahoo = site.yahoo_vc_sid && site.yahoo_vc_pid ? `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=${site.yahoo_vc_sid}&pid=${site.yahoo_vc_pid}&vc_url=${encodeURIComponent(ys)}` : ys;
  const mi = mercariItemUrl(it), maf = mi ? null : mercariAf(it);
  const mercari = mi ? mi : maf ? maf.url : `https://jp.mercari.com/search?keyword=${encodeURIComponent(`${name} ガチャ`)}&status=on_sale`;
  return { jan, rakuten: a.rakuten, amazon: a.amazon, yahoo, mercari, mercariLabel: maf ? `メルカリ（${maf.kw}）` : "メルカリ", mercariAf: !!(mi || maf) };
};

// 人気シリーズだけのページ（/series/〇〇.html）
const SERIES = [
  { slug: "sanrio", label: "サンリオ", en: "Sanrio", emoji: "🎀", re: /サンリオ|ハローキティ|キティ|マイメロ|クロミ|シナモロール|ポムポムプリン|ポチャッコ|ハンギョドン|けろけろけろっぴ|キキ&ララ|キキララ|タキシードサム|ばつ丸|ぐでたま|Sanrio/i },
  { slug: "disney", label: "ディズニー", en: "Disney", emoji: "🏰", re: /ディズニー|ミッキー|ミニー|ドナルド|くまのプーさん|スティッチ|ピクサー|トイ・ストーリー|ラプンツェル|アナと雪|プリンセス|ツイステ|Disney/i },
  { slug: "tamagotchi", label: "たまごっち", en: "Tamagotchi", emoji: "🥚", re: /たまごっち|Tamagotchi/i },
  { slug: "mejirushi", label: "めじるしアクセサリー", en: "Mejirushi Accessory", emoji: "🔖", re: /めじるし/ },
];
const seriesItems = (sr) => items.filter((it) => sr.re.test([it.name, it.name_en, (it.lineup_names || []).join(" ")].join(" ")));

/* ---------- 診断：作品名カタログで細かい項目を作る ---------- */
// 商品名に作品名が入っていれば、その作品が属する項目（例 oshi:kids）を自動で足す
const subKeys = new Set((site.quiz_groups || []).flatMap((g) => g.subs.map((x) => `${g.slug}:${x.slug}`)));
const titleRx = titles.map((tt) => ({ ...tt, rx: new RegExp(tt.match, "i") }));
// キャラクター・作品ごとのページ（作品名カタログから、3シリーズ以上あるものだけ）
const CHARAS = (() => {
  const by = new Map(); // 同じ作品がカタログに2回あるときはまとめる
  for (const tt of titleRx) {
    const slug = String(tt.en || "").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-") || hashSlug(tt.label);
    const list = items.filter((it) => tt.rx.test([it.name, it.name_en, (it.lineup_names || []).join(" ")].join(" ")));
    const cur = by.get(slug);
    if (cur) { for (const it of list) if (!cur.list.includes(it)) cur.list.push(it); }
    else by.set(slug, { label: tt.label, en: tt.en || tt.label, slug, list });
  }
  // 人気シリーズ（サンリオ・ディズニー・たまごっち・めじるし）も同じ形のページに（/series/ は /chara/ へ転送）
  for (const k of ["sanrio-characters-all", "tamagotchi"]) by.delete(k);
  for (const sr of SERIES) by.set(sr.slug, { label: sr.label, en: sr.en, slug: sr.slug, list: seriesItems(sr) });
  return [...by.values()].filter((x) => x.list.length >= 3).sort((a, b) => b.list.length - a.list.length);
})();
const charasOf = (it) => CHARAS.filter((ch) => ch.list.includes(it));
const YM_NOW = `${nowJST.getUTCFullYear()}年${nowJST.getUTCMonth() + 1}月`;
const autoSubs = (site.quiz_groups || []).flatMap((g) => g.subs.filter((x) => x.auto && x.match).map((x) => ({ key: `${g.slug}:${x.slug}`, rx: new RegExp(x.match) })));
const LEGACY_GENRE = { anime: "anime", miniature: "miniature", animal: "animal", retro: "retro", other: "other" };
for (const it of items) {
  const qs = new Set((it.q_subs || []).filter((k) => subKeys.has(k)));
  for (const tt of titleRx) if (tt.rx.test(it.name)) tt.subs.forEach((k) => subKeys.has(k) && qs.add(k));
  // "auto" の項目（あとから増やした項目）は、商品名から毎回自動で判定する
  for (const a of autoSubs) if (a.rx.test(it.name)) qs.add(a.key);
  it._qs = [...qs];
  // ジャンル：診断の項目から決める（複数のジャンルに入ることもある）。最初に当てはまったものがカードに出る
  it._genres = GENRES.filter((g) => (g.subs || []).some((k) => it._qs.includes(k))).map((g) => g.slug);
  if (!it._genres.length) it._genres = [LEGACY_GENRE[it.legacy_genre] || "other"];
  it.genre = it._genres[0];
}
const slugOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "t";
for (const g of site.quiz_groups || []) for (const x of g.subs) {
  const key = `${g.slug}:${x.slug}`;
  const cat = titleRx.filter((tt) => tt.subs.includes(key));
  if (!cat.length) continue;
  const used = new Set();
  x.leaves = cat.map((tt) => {
    let slug = slugOf(tt.en);
    while (used.has(slug)) slug += "x";
    used.add(slug);
    return { slug, label: tt.label, en: tt.en, match: tt.match };
  });
}
/* ---------- 診断：商品が1件もない項目は出さない ---------- */
const hasSub = (key) => items.some((it) => it._qs.includes(key));
const liveSubs = (g) => g.subs.filter((x) => hasSub(`${g.slug}:${x.slug}`));
const liveLeaves = (g, x) => (x.leaves || []).map((l) => {
  const rx = new RegExp(l.match, "i");
  return { ...l, n: items.filter((it) => it._qs.includes(`${g.slug}:${x.slug}`) && rx.test(it.name)).length };
}).filter((l) => l.n > 0).sort((a, b) => b.n - a.n);
const LEAF_SHOW = 12; // これより多いときは、しぼりこみ欄と「ぜんぶ見る」を出す

/* ---------- 今週発売（バンダイ「11月第2週」、タカラトミーアーツ「11月9日週」の表記から判定） ---------- */
/* ---------- 発売週 ----------
   週は月曜はじまり。その月の最初の月曜日から始まる週を「第1週」とする（例：2026年11月の第1週＝11/2〜11/8）。
   バンダイの「11月第2週」、タカラトミーアーツの「11月9日週」を、どちらも「その週の月曜日」にそろえる */
const { mondayOf, weekStartOf, weekInfo } = require("./release-week");
const WEEK = (() => {
  const mon = mondayOf(nowJST);
  const w = weekInfo(mon);
  const inWeek = (it) => { const s = weekStartOf(it); return !!s && s.getTime() === mon.getTime(); };
  return { m: w.m, weekNo: w.no, key: w.key, label: `${w.m}月第${w.no}週`, range: w.range, items: items.filter(inWeek).sort(byPopular) };
})();

// 来週発売（土日の「来週発売のガチャ」ポスト・next-week.html 用）
const NEXT_WEEK = (() => {
  const mon = new Date(mondayOf(nowJST).getTime() + 7 * 864e5);
  const w = weekInfo(mon);
  const inWeek = (it) => { const s = weekStartOf(it); return !!s && s.getTime() === mon.getTime(); };
  return { m: w.m, weekNo: w.no, key: w.key, label: `${w.m}月第${w.no}週`, range: w.range, items: items.filter(inWeek).sort(byPopular) };
})();

/* ---------- みんなのガチャマップ：お店 ---------- */
const shopsLive = readJSON("shops-live.json", {}) || {};
const SHOPS = (() => {
  const list = Array.isArray(shopsLive.shops) && shopsLive.shops.length ? shopsLive.shops
    : stores.filter((x) => /^g-s\d+$/i.test(x.id) && x.lat && x.lng).map((x) => ({ id: x.id.slice(2).toLowerCase(), name: x.name, pref: x.prefecture, address: x.address, lat: x.lat, lng: x.lng, src: "bandai", hidden: 0 }));
  const PN = Object.keys(PREF_EN);
  for (const x of list) if (!x.pref && x.address) x.pref = PN.find((p) => String(x.address).startsWith(p)) || "";
  return list.filter((x) => !x.hidden && x.lat && x.lng && /^[a-z0-9-]+$/.test(x.id));
})();
const SHOP_OFFICIAL = shopsLive.official || {};
const SHOP_REPORTS = shopsLive.reports || {};
const SHOP_BY_ID = new Map(SHOPS.map((x) => [x.id, x]));
// 商品 → 公式の取扱店（お店ごとの一覧を逆引き）
const OFFICIAL_BY_ITEM = (() => {
  const m = new Map();
  for (const [sid, ids] of Object.entries(SHOP_OFFICIAL)) for (const id of ids || []) { if (!m.has(id)) m.set(id, []); m.get(id).push(sid); }
  return m;
})();
const hashStr = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
const rotate = (arr, n, seed) => { if (arr.length <= n) return arr; const st = seed % arr.length; return [...arr.slice(st), ...arr.slice(0, st)].slice(0, n); };
// 全種類そろえるまでの平均回数（どれも同じ確率で出るとした場合）
const compDraws = (n) => { let h = 0; for (let k = 1; k <= n; k++) h += 1 / k; return Math.round(n * h); };
const MAKER_WHERE = {
  "バンダイ": "全国のガシャポン設置店（ガシャポンバンダイオフィシャルショップ、ショッピングモール、家電量販店、駅や空港など）",
  "タカラトミーアーツ": "全国のカプセルトイ専門店やショッピングモール、量販店のガチャコーナー",
};
const SHOP_RATINGS = shopsLive.ratings || {};
const LOTTERY = (readJSON("lottery.json", { entries: [] }) || { entries: [] }).entries || [];
const starsHtml = (r) => r && r.n ? `<span class="stars-v" style="--v:${r.avg}" aria-label="☆${r.avg}"></span><b class="stars-n">${Number(r.avg).toFixed(1)}</b><small>（${r.n}）</small>` : "";
const PREF_ORDER = Object.keys(PREF_EN);
const KIND_LABEL = { gacha: "ガチャ専門店", game: "ゲームセンター", mall: "ショッピングモール・スーパー", station: "駅・空港・サービスエリア", shop: "そのほかのお店" };
const prefSlug = (p) => (PREF_EN[p] || "other").toLowerCase().replace(/[^a-z]+/g, "-");
const itemById = new Map(items.map((it) => [it.id, it]));

/* ---------- 書き出し ---------- */
const pages = []; // サイトマップ用 [lang, rel]
// サイト内のリンクは「.html なし」の住所にする（Cloudflare が .html 付きを毎回転送してしまうため）
const cleanLinks = (html) => html.replace(/href="([^"]*?)\.html((?:[?#][^"]*)?)"/g, (m, p, q) => {
  if (/^(https?:)?\/\//.test(p) || /^(mailto|javascript):/.test(p)) return m;
  let u = p.replace(/(^|\/)index$/, "$1");
  if (u === "") u = "./";
  return `href="${u}${q}"`;
});
const write = (rel, content) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, /\.html$/.test(rel) && typeof content === "string" ? cleanLinks(content) : content);
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "style.css"), path.join(OUT, "assets/style.css"));
fs.copyFileSync(path.join(__dirname, "app.js"), path.join(OUT, "assets/app.js"));
if (fs.existsSync(path.join(ROOT, "images"))) fs.cpSync(path.join(ROOT, "images"), path.join(OUT, "images"), { recursive: true });
fs.mkdirSync(path.join(OUT, "images", "og"), { recursive: true });
if (fs.existsSync(path.join(ROOT, "brand", "header.png"))) fs.copyFileSync(path.join(ROOT, "brand", "header.png"), path.join(OUT, "images", "og", "site.png"));
// SNSの共有画像（1200×630。Xのカードは横長すぎる画像だと出ないため）
if (fs.existsSync(path.join(ROOT, "brand", "og-site.jpg"))) fs.copyFileSync(path.join(ROOT, "brand", "og-site.jpg"), path.join(OUT, "images", "og", "site.jpg"));

// 在庫を確認する商品の一覧（Cloudflareの在庫確認ワーカーが読む）：先月以降に発売のバンダイ商品
{
  const from = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const targets = items
    .filter((it) => it.release >= from)
    .map((it) => ({ id: it.id, code: ((it.official_url || "").match(/gashapon\.jp\/products\/detail\.php\?jan_code=(\d{13})/) || [])[1] }))
    .filter((t) => t.code);
  write("data/stock-targets.json", JSON.stringify(targets));
}

// 在庫データ（言語共通）
for (const it of items) {
  write(`data/stock/${it.id}.json`, JSON.stringify({
    updated_at: stockFile.updated_at, updated_ja: T.ja.datetime(stockFile.updated_at), updated_en: T.en.datetime(stockFile.updated_at),
    stores: stockByItem.get(it.id) || [],
  }));
}

// デザイン・動きのファイルが変わったら、ブラウザに古いものが残らないよう番号を付ける
const crypto = require("crypto");
const ver = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(__dirname, f))).digest("hex").slice(0, 8);
const QUIZ_V = crypto.createHash("md5").update(JSON.stringify(rawItems) + JSON.stringify(votes) + JSON.stringify(titles) + JSON.stringify(site)).digest("hex").slice(0, 8);
const CSS_V = ver("style.css");
const JS_V = ver("app.js");

const FONTS = "https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700;800&family=Zen+Maru+Gothic:wght@500;700;900&display=swap";

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
    const src = eager ? imgURL(it, R) : imgURL({ image: thumbOf(it.image) }, R);
    const img = src
      ? `<img src="${esc(src)}" alt="${esc(nameOf(it, lang))}" width="400" height="400" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
      : `<div class="capsule" aria-hidden="true"><i></i><span>NO IMAGE</span></div>`;
    return `<div class="thumb">${img}${badge && isNew(it) ? '<span class="badge-new">NEW</span>' : ""}</div>`;
  };
  // 発売の状態（今週発売・◯/◯〜発売予定・発売中）
  const THIS_MON = mondayOf(nowJST).getTime();
  const NOW_YM = nowJST.toISOString().slice(0, 7);
  const relLabel = (it) => {
    const w = weekStartOf(it);
    if (w) {
      const d = w.getTime();
      if (d === THIS_MON) return lang === "ja" ? `<em class="rel-st rel-now">今週発売</em>` : `<em class="rel-st rel-now">This week</em>`;
      if (d > THIS_MON) return lang === "ja" ? `<em class="rel-st rel-soon">${w.getUTCMonth() + 1}/${w.getUTCDate()}〜発売</em>` : `<em class="rel-st rel-soon">From ${w.getUTCMonth() + 1}/${w.getUTCDate()}</em>`;
      return lang === "ja" ? `<span class="rel-st">発売中</span>` : `<span class="rel-st">Out now</span>`;
    }
    if (it.release > NOW_YM) return lang === "ja" ? `<em class="rel-st rel-soon">${+it.release.slice(5)}月発売予定</em>` : `<em class="rel-st rel-soon">${t.month(it.release)}</em>`;
    return `<span>${t.month(it.release)}</span>`;
  };
  const card = (it, c) => `<a class="card" href="${c.H}item/${it.id}.html">
  ${thumb(it, c.R)}
  <div class="card-meta">${esc(genreLabel(genreOf(it.genre), lang))}</div>
  <div class="card-name">${esc(nameOf(it, lang))}</div>
  <div class="card-foot"><span><b>¥${it.price}</b>${it.lineup ? ` / ${t.lineup(it.lineup)}` : ""}</span>${relLabel(it)}</div>
</a>`;

  const layout = ({ rel, title, description, body, jsonld = [], ogImage = "", ogType = "website", current = "", jaOnly = false, extraHead = "", noindex = false, noAlt = false, lastmod = "" }) => {
    const c = ctx(rel);
    const fragment = PREVIEW && lang === "ja" && rel === "index.html";
    const fullTitle = rel === "index.html" ? (lang === "en" ? `${site.name} | Gacha (capsule toys) in Japan: new releases & shops near you` : `ガチャガチャ新作・発売日一覧【${YM_NOW}最新】在庫店・入荷速報｜ガチャプラネット`) : `${title}${lang === "ja" ? "｜ガチャプラネット" : ` | ${site.name}`}`;
    // 反対の言語の同じページへのリンク
    const switchHref = jaOnly ? `${c.H}en/index.html` : lang === "ja" ? `${c.H}en/${rel}` : `${c.R}${rel}`;
    const ld = jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n");
    const NAV = [["index.html#new", "new"], ["week.html", "week"], ["index.html#ranking", "ranking"], ["calendar.html", "calendar"], ["@lottery.html", "lottery"], ["@map.html", "map"], ["@gachakatsu.html", "katsu"], ["@toprated.html", "toprated"], ["index.html#types", "genre"], ["faq.html", "faq"]];
    const head = `<title>${esc(fullTitle)}</title>
${fragment ? '<meta name="claude:viewport-fit-sides" content="cover">' : ""}
<meta name="site-lang" content="${lang}">
${site.vc_linkswitch_pid ? `<script>var vc_pid = "${esc(site.vc_linkswitch_pid)}";</script><script src="//aml.valuecommerce.com/vcdal.js" async></script>` : ""}
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical(lang, rel))}">
${noindex ? `<meta name="robots" content="noindex, follow">\n` : ""}${jaOnly || noAlt ? "" : `<link rel="alternate" hreflang="ja" href="${esc(canonical("ja", rel))}">
<link rel="alternate" hreflang="en" href="${esc(canonical("en", rel))}">
<link rel="alternate" hreflang="x-default" href="${esc(canonical("ja", rel))}">`}
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="${t.ogLocale}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${esc(canonical(lang, rel))}">
<meta property="og:image" content="${esc(ogImage || `${SITE_URL}/images/og/site.jpg`)}">
<meta name="twitter:card" content="summary_large_image">
${site.x_account ? `<meta name="twitter:site" content="@${esc(site.x_account.replace(/^@/, ""))}">` : ""}
<meta name="theme-color" content="#121212">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${c.R}assets/style.css?v=${CSS_V}">
${extraHead}
${ld}`;
    const content = `${site.sample_mode ? `<div class="sample-bar">${t.sampleBar}</div>` : ""}
<header class="site-header"><div class="wrap">
  <a class="logo logo-b3" href="${c.H}index.html" aria-label="${esc(site.name)} ${t.logoAria}"><svg class="logo-pl" viewBox="0 0 48 48" aria-hidden="true"><defs><clipPath id="lgcp"><circle cx="24" cy="24" r="14"/></clipPath></defs><ellipse cx="24" cy="25" rx="22" ry="7" fill="none" stroke="#3aa0ff" stroke-width="3" transform="rotate(-18 24 25)"/><g clip-path="url(#lgcp)"><rect x="8" y="8" width="32" height="15" fill="#ff5c8a"/><rect x="8" y="23" width="32" height="2.4" fill="#fff"/><rect x="8" y="25.4" width="32" height="16" fill="#ffc23c"/></g><path d="M4.5 31 A22 7 -18 0 0 44 19" fill="none" stroke="#3aa0ff" stroke-width="3"/></svg><span class="logo-txt">${lang === "ja" ? `<span class="logo-small">GACHA PLANET</span><span class="logo-main">ガチャプラネット</span>` : `<span class="logo-small">${esc(t.tagline)}</span><span class="logo-main logo-main-en">GACHA PLANET</span>`}</span></a>
  <nav class="nav" aria-label="${t.navAria}">${NAV.map(([h, k]) => `<a href="${h[0] === "@" ? c.R + h.slice(1) : c.H + h}"${k === current ? ' aria-current="page"' : ""}>${t.navShort && t.navShort[k] ? `<span class="nl">${t.nav[k]}</span><span class="ns">${t.navShort[k]}</span>` : t.nav[k]}</a>`).join("")}</nav>
  <form class="search" role="search" action="${c.H}search.html" data-index="${c.R}data/search-${lang}.json" data-home="${c.H}" data-root="${c.R}">
    <input type="search" name="q" id="search-q" placeholder="${t.searchPh}" aria-label="${t.searchAria}" autocomplete="off" enterkeyhint="search">
    <div class="search-pop" id="search-pop" hidden></div>
  </form>
  <a class="lang-switch" href="${switchHref}" hreflang="${other}" lang="${other}" aria-label="${t.switchAria}">${t.switchLabel}</a>
</div></header>
<main>${body}</main>
<footer class="site-footer"><div class="wrap">
  <div>© ${nowJST.getUTCFullYear()} ${esc(site.name)}</div>
  <nav aria-label="${t.footAria}"><a href="${c.H}faq.html">${t.nav.faq}</a><a href="${c.H}about.html">${t.about}</a>${lang === "ja" ? `<a href="${c.H}privacy.html">プライバシーポリシー</a>` : ""}<a href="${c.H}calendar.html">${t.nav.calendar}</a><a href="${switchHref}" hreflang="${other}" lang="${other}">${t.switchLabel}</a></nav>
  <p class="disclosure">${t.disclosure}</p>
</div></footer>
<script src="${c.R}assets/app.js?v=${JS_V}" defer></script>`;
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
    pages.push([lang, rel, jaOnly || noAlt, noindex, lastmod]);
  };

  /* ---------- トップページ ---------- */
  {
    const c = ctx("index.html");
    const newest = [...items].sort(byNewest).slice(0, 8);
    const ranking = [...items].sort(byPopular).slice(0, 50); // 5位まで表示、6位以降は「もっと見る」
    const releasingNow = items.filter((it) => it.release === thisMonth).length;
    const stockedStores = new Set([...stockByItem.values()].flat().map((s) => s.name + s.address)).size;
    const embed = {
      home: c.H, root: c.R,
      groups: (site.quiz_groups || []).map((g) => ({ slug: g.slug, subs: g.subs.map((x) => ({ slug: x.slug, leaves: (x.leaves || []).map((l) => ({ slug: l.slug, match: l.match })) })) })),
      src: `${c.R}data/quiz-${lang}.json?v=${QUIZ_V}`,
      _items: items.map((it) => ({
        id: it.id, name: nameOf(it, lang), jn: it.name, price: it.price, lineup: it.lineup, genre: it.genre, genre_label: genreLabel(genreOf(it.genre), lang),
        moods: it.moods, popularity: it.popularity * 0.01 + heartsOf(it), on: (it.lineup_names || []).join("｜"), ad: it.added, rl: it.release, qa: it.q_ages || [], qg: it.q_genders || [], qs: it._qs, image: thumbOf(it.image), release_label: t.month(it.release),
      })),
    };
    const opt = (name, type, value, label, checked) =>
      `<label class="opt"><input type="${type}" name="${name}" value="${value}"${checked ? " checked" : ""}><span>${label}</span></label>`;

    const body = `
<div class="wrap">
  <section class="hero">
    <div class="hero-intro">
      <div class="hero-text">
        <h1 class="hero-lead">${t.heroLead}</h1>
        <div class="hero-planet" aria-hidden="true"><i class="ring"></i><i class="orb"></i><i class="ring ring-front"></i><i class="moon"></i></div>
        <p class="hero-sub">${t.heroSub}</p>
        <dl class="hero-stats">
          ${[items.length, releasingNow, stockedStores].map((n, i) => `<div><dt>${t.stats[i]}</dt><dd>${n.toLocaleString("en-US")}</dd></div>`).join("")}
        </dl>
      </div>
    </div>
    <a class="katsu-banner" href="${c.R}gachakatsu.html">
      <span class="kb-art" aria-hidden="true"><i class="kb-dot a">1</i><i class="kb-dot b">2</i><i class="kb-dot c">3</i><svg viewBox="0 0 120 60"><path d="M10 50 C 35 10, 60 55, 85 18 S 112 30, 112 30" fill="none" stroke="#3aa0ff" stroke-width="3" stroke-dasharray="6 6"/></svg></span>
      <span class="kb-text"><b>${lang === "en" ? "NEW｜Gacha route planner" : "NEW｜ガチャ活しよう！"}</b><span>${lang === "en" ? "Find capsule-toy shops near you and get the most efficient route — by number of shops, time limit, or stops on the way." : "近くのガチャのお店を、いちばん効率よく回るルートを自動で作成。お店の数・時間・目的地までの寄り道から選べます。"}</span></span>
      <span class="kb-go">${lang === "en" ? "Plan a route →" : "ルートを作る →"}</span>
    </a>
    <form class="quiz" id="quiz" aria-labelledby="quiz-title">
      <div class="quiz-head">
        <h2 id="quiz-title">${t.quizTitle}</h2>
        <span class="quiz-step" id="quiz-step" aria-live="polite"></span>
      </div>
      <div class="quiz-bar" aria-hidden="true"><i id="quiz-bar"></i></div>
      <div class="quiz-qs">
      <fieldset data-auto><legend><b>1</b>${t.qGender}</legend>
        <div class="opts opts-lg">${t.genders.map(([v, l]) => opt("gender", "radio", v, l)).join("")}</div>
      </fieldset>
      <fieldset data-auto><legend><b>2</b>${t.qAge}</legend>
        <div class="opts opts-lg opts-age">${t.ages.map(([v, l]) => opt("age", "radio", v, l)).join("")}</div>
      </fieldset>
      <fieldset data-last><legend><b>3</b>${t.qGroups}</legend>
        <p class="q-hint">${t.groupsHint}</p>
        <div class="groups">${(site.quiz_groups || []).map((g) => `<div class="grp" data-group="${g.slug}">
          <label class="grp-main"><input type="checkbox" name="group" value="${g.slug}"><span>${lang === "en" ? g.en : g.label}</span></label>
          <button type="button" class="grp-more" aria-expanded="false" aria-controls="sub-${g.slug}" data-more="${t.more}" data-less="${t.less}">${t.more}</button>
          <div class="grp-subs" id="sub-${g.slug}" hidden>
            <div class="opts">${liveSubs(g).map((x) => opt("sub", "checkbox", `${g.slug}:${x.slug}`, lang === "en" ? x.en : x.label)).join("")}</div>
            ${liveSubs(g).map((x) => ({ x, leaves: liveLeaves(g, x) })).filter((v) => v.leaves.length > 1).map(({ x, leaves }) => `<div class="leaf-row" data-sub="${g.slug}:${x.slug}" hidden>
              <span class="leaf-label">${t.leafPrefix(lang === "en" ? x.en : x.label)}</span>
              ${leaves.length > LEAF_SHOW ? `<input class="leaf-filter" type="search" placeholder="${t.leafFilter}" aria-label="${t.leafFilter}">` : ""}
              <div class="opts opts-sm${leaves.length > LEAF_SHOW ? " is-clipped" : ""}">${leaves.map((l, i) => opt("leaf", "checkbox", `${g.slug}:${x.slug}:${l.slug}`, `${esc(lang === "en" ? l.en : l.label)}<small>${l.n}</small>`).replace('<label class="opt"', i >= LEAF_SHOW ? '<label class="opt is-extra"' : '<label class="opt"')).join("")}</div>
              ${leaves.length > LEAF_SHOW ? `<p class="leaf-none" hidden>${t.leafNone}</p><button type="button" class="leaf-all">${t.leafAll(leaves.length)}</button>` : ""}
            </div>`).join("")}
          </div>
        </div>`).join("")}</div>
        <label class="oshi-in"><span>${t.oshiLabel}</span><input type="search" name="oshi" placeholder="${t.oshiPh}" autocomplete="off"></label>
      </fieldset>
      </div>
      <div class="quiz-nav">
        <button class="btn btn-ghost" type="button" id="quiz-back" hidden>${t.back}</button>
        <button class="btn btn-gold" type="button" id="quiz-next" hidden>${t.next}</button>
        <button class="btn btn-gold" type="submit" id="quiz-submit">${t.quizBtn}</button>
      </div>
    </form>
  </section>

  <section class="section" id="results" hidden aria-live="polite">
    <div class="section-head"><h2>${t.results}</h2>
      <div class="sortbar" role="group" aria-label="${t.sortAria}">${t.sorts.map(([v, l], i) => `<button type="button" class="sort${i === 0 ? " is-on" : ""}" data-sort="${v}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>
    </div>
    <p class="results-note" id="results-note"></p>
    <div class="grid" id="results-grid"></div>
    <p class="more-wrap"><button type="button" class="btn" id="results-more" hidden>${t.showMore}</button></p>
  </section>

  ${WEEK.items.length ? `<section class="section section-tight" id="thisweek">
    <div class="section-head"><h2>${lang === "en" ? "Releasing this week" : "今週発売のガチャ"}</h2><a class="more" href="${c.H}week.html">${lang === "en" ? `${WEEK.range} · all ${WEEK.items.length}` : `${WEEK.range}・全${WEEK.items.length}件`}</a></div>
    <div class="grid row-scroll">${WEEK.items.slice(0, 12).map((it) => card(it, c)).join("")}<a class="card see-all" href="${c.H}week.html"><span class="see-all-in"><b>${lang === "en" ? "See all" : "全部見る"}</b><span>→</span></span></a></div>
  </section>` : ""}

  <section class="section" id="new">
    <div class="section-head"><h2>${t.newTitle}</h2><span><a class="more" href="${c.H}week.html">${lang === "en" ? "This week" : "今週発売"}</a>　<a class="more" href="${c.H}calendar.html">${t.toCalendar}</a></span></div>
    <div class="grid row-scroll">${newest.map((it) => card(it, c)).join("")}<a class="card see-all" href="${c.H}new.html"><span class="see-all-in"><b>${lang === "en" ? "See all" : "全部見る"}</b><span>→</span></span></a></div>
  </section>

  <section class="section section-tight" id="feed" data-api="${c.R}api/feed" hidden>
    <div class="section-head"><h2>${t.feedTitle}</h2></div>
    <div class="grid row-scroll" id="feed-grid"></div>
    <script type="application/json" id="feed-i18n">${JSON.stringify({ isNew: t.feedNew, back: t.feedBack, note: t.feedNote(9, 8).replace("8", "{s}").replace("9", "{n}"), note0: t.feedNote(0, 8).replace("8", "{s}") })}</script>
  </section>

  <section class="section" id="ranking">
    <div class="section-head"><h2>${t.rankTitle}</h2></div>
    <ol class="rank">${ranking.map((it, i) => `<li${i >= 5 ? ' class="rank-more" hidden' : ""}><a href="${c.H}item/${it.id}.html">
      <span class="rank-no">${i + 1}</span>${thumb(it, c.R, { badge: false })}
      <span style="min-width:0"><span class="card-name">${esc(nameOf(it, lang))}</span><span class="card-foot"><span><b>¥${it.price}</b></span><span>${heartsOf(it) ? `<em class="hearts">♥ ${heartsOf(it)}</em>` : t.month(it.release)}</span></span></span>
    </a></li>`).join("")}</ol>
    ${ranking.length > 5 ? `<p class="more-wrap"><button type="button" class="btn" id="rank-more">${t.showMore}</button></p>` : ""}
  </section>

  <section class="section section-tight" id="series">
    <div class="section-head"><h2>${lang === "ja" ? "人気シリーズ" : "Popular series"}</h2></div>
    <div class="series-tiles">${SERIES.map((sr) => { const n = seriesItems(sr).length; return n ? `<a class="st st-${sr.slug}" href="${c.H}chara/${sr.slug}.html"><span class="st-e" aria-hidden="true">${sr.emoji}</span><span class="st-l">${lang === "ja" ? sr.label : sr.en}</span><span class="st-n">${t.series(n)}</span></a>` : ""; }).join("")}</div>
    <div class="chara-list chara-list-top">${CHARAS.slice(0, 15).map((ch) => `<a class="chara-chip" href="${c.H}chara/${ch.slug}.html">${esc(lang === "ja" ? ch.label : ch.en)}<small>${ch.list.length}</small></a>`).join("")}<a class="chara-chip chara-more" href="${c.H}chara.html">${lang === "ja" ? "キャラクター・作品をすべて見る →" : "All characters →"}</a></div>
  </section>

  <section class="section" id="types">
    <div class="section-head"><h2>${t.typeTitle}</h2></div>
    <div class="genres types">${TYPES.filter((g) => inType(g.slug).length).map((g) => `<a href="${c.H}type/${g.slug}.html"><span class="ja">${phr(genreLabel(g, lang))}</span><span class="n">${t.series(inType(g.slug).length)}</span></a>`).join("")}</div>
  </section>

  <section class="section" id="genres">
    <div class="section-head"><h2>${t.genreTitle}</h2></div>
    <div class="genres">${GENRES.filter((g) => inGenre(g.slug).length).map((g) => `<a href="${c.H}genre/${g.slug}.html"><span class="ja">${phr(genreLabel(g, lang))}</span><span class="n">${t.series(inGenre(g.slug).length)}</span></a>`).join("")}</div>
  </section>
</div>
<script type="application/json" id="items-data">${JSON.stringify({ ...embed, _items: undefined }).replace(/</g, "\\u003c")}</script>`;
    write(`data/quiz-${lang}.json`, JSON.stringify(embed._items));

    layout({
      rel: "index.html", title: site.name, description: t.description, body, current: "new",
      jsonld: [{ "@context": "https://schema.org", "@type": "WebSite", name: site.name, alternateName: ["ガチャプラネット", "GACHA PLANET"], url: canonical(lang, "index.html"), description: t.description, inLanguage: lang,
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: canonical(lang, "search.html") + "?q={search_term_string}" }, "query-input": "required name=search_term_string" } },
        { "@context": "https://schema.org", "@type": "Organization", name: site.name, alternateName: "ガチャプラネット", url: SITE_URL + "/", logo: `${SITE_URL}/images/og/site.png` }],
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
    const related = (() => {
      const seed = hashStr(it.id), chs = charasOf(it);
      const sameChara = items.filter((x) => x !== it && chs.some((ch) => ch.list.includes(x))).sort(byNewest);
      const sameMonth = items.filter((x) => x !== it && x.release === it.release && x.genre === it.genre).sort((a, b) => b.popularity - a.popularity);
      const sameGenre = items.filter((x) => x !== it && x.genre === it.genre).sort(byNewest);
      return [...new Set([...rotate(sameChara, 4, seed), ...rotate(sameMonth, 4, seed >>> 3), ...rotate(sameGenre, 8, seed >>> 6)])].slice(0, 8);
    })();
    // 説明文：発売週とラインナップ名も入れて、ページごとに中身の違う説明にする
    const ws = weekStartOf(it), wi = ws ? weekInfo(ws) : null;
    const mo = wi ? (lang === "en" ? `${t.month(it.release)} (week of ${wi.range.split("〜")[0]})` : `${wi.m}月第${wi.no}週（${wi.range.split("〜")[0]}〜）`) : t.month(it.release);
    const ln = (it.lineup_names || []).slice(0, 3);
    let desc = t.itemDesc(it, name, maker, mo);
    if (ln.length && lang === "ja") desc = desc.replace("のガチャガチャ。", `のガチャガチャ。ラインナップは${ln.join("、")}${it.lineup > ln.length ? "など" : ""}。`);

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
        <dt>${t.release}</dt><dd><a href="${c.H}calendar/${ws ? ws.toISOString().slice(0, 7) : it.release}.html">${t.month(it.release)}</a>${lang === "ja" && it.release_note ? (ws ? `<a class="rel-note" href="${c.H}calendar/${ws.toISOString().slice(0, 7)}.html#w${wi.key}">${esc(it.release_note)}</a>` : `<span class="rel-note">${esc(it.release_note)}</span>`) : ""}</dd>
        ${it.age_min ? `<dt>${t.ageLabel}</dt><dd>${t.ageMin(it.age_min)}</dd>` : ""}
        <dt>${t.genre}</dt><dd><a href="${c.H}genre/${g.slug}.html">${gl}</a></dd>
        ${tags.length ? `<dt>${t.tags}</dt><dd><div class="tags">${tags.map((x) => `<span class="chip chip-ai">${esc(x)}</span>`).join("")}</div></dd>` : ""}
      </dl>
      ${description ? `<p class="desc">${esc(description)}</p>` : ""}
      <div class="item-actions">
        <a class="btn btn-gold" href="#stock">${t.findStores}</a>
        ${it.official_url ? `<a class="btn" href="${esc(it.official_url)}" target="_blank" rel="noopener">${t.official}</a>` : ""}
        <button type="button" class="heart" data-vote="${c.R}api/vote/${it.id}" data-id="${it.id}" aria-label="${t.heartAria}" title="${t.heartNote}"><i aria-hidden="true">♥</i><span>${t.heart}</span><b>${heartsOf(it)}</b></button>
      </div>
      ${lang === "en" ? (() => { const O = overseas(it); const L = shopLinks(it); const b = [
        ["sl-amz", O.amazon || L.amazon, O.amazon ? "Amazon" : "Amazon Japan"],
        ...(O.ebay ? [["sl-ebay", O.ebay, "eBay"]] : []),
        ...(O.buyee ? [["sl-buyee", O.buyee, "Buyee (Mercari Japan)"]] : []),
        ["sl-rak", L.rakuten, "Rakuten Japan"],
      ]; return `<div class="shop-links"><span class="sl-pr">PR</span>${b.map(([k, u, l]) => `<a class="sl ${k}" href="${esc(u)}" target="_blank" rel="sponsored noopener">${l}</a>`).join("")}</div>${L.jan ? `<p class="jan">JAN code: <span>${L.jan}</span></p>` : ""}`; })() : (() => { const L = shopLinks(it); return `<div class="shop-links"><span class="sl-pr">PR</span><a class="sl sl-rak" href="${esc(L.rakuten)}" target="_blank" rel="sponsored noopener">楽天市場</a><a class="sl sl-amz" href="${esc(L.amazon)}" target="_blank" rel="sponsored noopener">Amazon</a><a class="sl sl-yah" href="${esc(L.yahoo)}" target="_blank" rel="sponsored noopener">Yahoo!ショッピング</a><a class="sl sl-mer" href="${esc(L.mercari)}" target="_blank" rel="${L.mercariAf ? "sponsored noopener" : "noopener"}">${esc(L.mercariLabel)}</a></div>${L.jan ? `<p class="jan">JANコード：<span>${L.jan}</span></p>` : ""}`; })()}
    </div>
  </article>
  ${(it.lineup_names || []).length ? `<section class="section lineup-sec">
    <div class="section-head"><h2>${t.lineupTitle(it.lineup || it.lineup_names.length)}</h2></div>
    <ol class="lineup">${it.lineup_names.map((n) => `<li lang="ja">${esc(n)}</li>`).join("")}</ol>
    <p class="fine">${t.lineupNote}</p>
  </section>` : ""}


  ${lang === "ja" ? (() => {
    const sids = OFFICIAL_BY_ITEM.get(it.id) || [];
    const shs = sids.map((id) => SHOP_BY_ID.get(id)).filter(Boolean);
    const byPref = {};
    for (const x of shs) if (x.pref) byPref[x.pref] = (byPref[x.pref] || 0) + 1;
    const prefTop = Object.entries(byPref).sort((a, b) => b[1] - a[1]);
    const n = Number(it.lineup) || (it.lineup_names || []).length;
    const draws = n >= 2 && n <= 40 ? compDraws(n) : 0;
    const whenTxt = ws ? `${wi.m}月${wi.no ? `第${wi.no}週` : ""}（${wi.range}）ごろ` : `${t.month(it.release)}${it.release_note ? `（${it.release_note}）` : ""}`;
    const whereTxt = shs.length
      ? `バンダイ公式の取扱店情報では、全国${shs.length}店で取扱があります（${prefTop.slice(0, 5).map(([p, k]) => `${p}${k}店`).join("・")}${prefTop.length > 5 ? "など" : ""}）。`
      : `${MAKER_WHERE[it.maker] || "全国のカプセルトイ専門店やショッピングモールのガチャコーナー"}で販売されます。取扱店はお店ごとに違うので、下の在庫店リストやみんなの報告も参考にしてください。`;
    const qa = [
      [`${it.name}は1回いくら？`, `1回${it.price}円です。`],
      ...(n ? [[`全部で何種類？`, `全${n}種${(it.lineup_names || []).length ? `（${it.lineup_names.slice(0, 4).join("、")}${it.lineup_names.length > 4 ? "など" : ""}）` : ""}です。`]] : []),
      [`発売日はいつ？`, `${whenTxt}の発売です。地域やお店によって並ぶ日が前後します。`],
      [`どこで売ってる？`, whereTxt],
      ...(draws ? [[`全種類そろえるには何回くらい？`, `どれも同じ確率で出るとすると、全${n}種そろうまでに平均で約${draws}回（約${(draws * it.price).toLocaleString("ja-JP")}円）かかる計算です。欲しいものが決まっているなら、フリマアプリなどで単品を探すのも手です。`]] : []),
    ];
    return `<section class="section where-sec">
    <div class="panel">
      <h2 style="font-size:22px">${esc(it.name)}はどこで売ってる？</h2>
      <p>${esc(whereTxt)}</p>
      ${shs.length ? `<ul class="where-shops">${rotate(shs, 10, hashStr(it.id)).map((x) => `<li><a href="${c.R}shop/${x.id}.html">${esc(x.name)}</a><span>${esc(x.pref || "")}</span></li>`).join("")}</ul>` : ""}
      ${draws ? `<p class="comp-cost">全${n}種そろえる目安：<b>平均 約${draws}回・約${(draws * it.price).toLocaleString("ja-JP")}円</b><small>（どれも同じ確率で出る場合の計算）</small></p>` : ""}
      <h3 class="arr-h">よくある質問</h3>
      <dl class="item-qa">${qa.map(([q, a]) => `<div><dt>${esc(q)}</dt><dd>${esc(a)}</dd></div>`).join("")}</dl>
    </div>
  </section>`;
  })() : ""}

  <section class="section" id="stock" data-api="${c.R}api/stock/${it.id}" data-src="${c.R}data/stock/${it.id}.json" style="scroll-margin-top:24px">
    <div class="panel">
      <h2 style="font-size:22px">${t.storesTitle}</h2>
      <div class="stock-tools">
        <button class="btn btn-gold" type="button" id="geo-btn">${t.geoBtn}</button>
        <label for="pref" style="font-size:13px;color:var(--muted)">${t.or}</label>
        <select id="pref" aria-label="${t.prefAria}"><option value="">${t.loading}</option></select>
      </div>
      <p class="stock-status" id="stock-status" role="status">${t.stockLoading}</p>
      <ul class="stores" id="store-list"></ul>
      <p class="fine"><span id="stock-updated"></span>${t.stockFine}
      ${it.store_search_url ? `<br><a href="${esc(it.store_search_url)}" target="_blank" rel="noopener" style="color:var(--gold-soft);border-bottom:1px solid var(--line-strong)">${t.officialStores}</a>` : ""}</p>
    </div>

    <div class="panel arrivals" id="arrivals" data-api="${c.R}api/arrivals/${it.id}" data-lang="${lang}">
      <h2 style="font-size:22px">${t.arrTitle}</h2>
      <p class="stock-status" id="arr-status">${t.arrLoading}</p>
      <div id="arr-body" hidden>
        <dl class="arr-stats"><div><dt>${t.arrIn}</dt><dd id="arr-in"></dd></div><div><dt>${t.arrRestock}</dt><dd id="arr-re"></dd></div><div><dt>${t.arrFirst}</dt><dd id="arr-first"></dd></div></dl>
        <h3 class="arr-h">${t.arrFastTitle}</h3><p class="fine" style="margin-top:4px">${t.arrFastNote}</p>
        <ol class="arr-fast" id="arr-fast"></ol>
        <h3 class="arr-h">${t.arrPrefTitle}</h3><p class="fine" style="margin-top:4px">${t.arrPrefNote}</p>
        <ul class="arr-prefs" id="arr-prefs"></ul>
      </div>
      <script type="application/json" id="arr-i18n">${JSON.stringify({ shops: t.arrShops(0).replace("0", "{n}"), times: t.arrTimes(0).replace("0", "{n}"), avg: t.arrAvg(0).replace("0", "{n}"), noavg: t.arrNoAvg, on: t.arrStockOn, off: t.arrStockOff, none: t.arrNone })}</script>
    </div>

    <aside class="buy" id="buy" aria-label="${t.buyAria}">
      <div>
        <h3>${t.buyTitle}<span class="pr">PR</span></h3>
        <p>${t.buyLead}</p>
      </div>
      <div class="btns">
        ${lang === "en" && overseas(it).amazon ? `<a class="btn btn-gold" href="${esc(overseas(it).amazon)}" target="_blank" rel="sponsored noopener">Search on Amazon</a>` : `<a class="btn btn-gold" href="${esc(aff.amazon)}" target="_blank" rel="sponsored noopener">${t.amazon}</a>`}
        ${lang === "en" && overseas(it).ebay ? `<a class="btn" href="${esc(overseas(it).ebay)}" target="_blank" rel="sponsored noopener">Search on eBay</a>` : ""}
        <a class="btn" href="${esc(aff.rakuten)}" target="_blank" rel="sponsored noopener">${t.rakuten}</a>
      </div>
    </aside>
    <aside class="buy flea" aria-label="${t.fleaTitle}">
      <div>
        <h3>${t.fleaTitle}</h3>
        <p>${t.fleaLead}</p>
      </div>
      <div class="btns">
        ${lang === "en" && overseas(it).buyee ? `<a class="btn btn-gold" href="${esc(overseas(it).buyee)}" target="_blank" rel="sponsored noopener">Buy from Mercari Japan via Buyee</a>` : ""}
        ${[["mercari", `https://jp.mercari.com/search?keyword=${encodeURIComponent(it.name)}`], ["yahoo", `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(it.name)}`], ["rakuma", `https://fril.jp/s?query=${encodeURIComponent(it.name)}`]]
          .map(([k, u]) => `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">${t[k]}</a>`).join("")}
      </div>
    </aside>
  </section>

  ${charasOf(it).length ? `<section class="section section-tight"><div class="section-head"><h2>${lang === "ja" ? "このキャラクター・作品のガチャ" : "More from this series"}</h2></div><div class="chara-list">${charasOf(it).map((ch) => `<a class="chara-chip" href="${c.H}chara/${ch.slug}.html">${esc(lang === "ja" ? `${ch.label}のガチャ一覧` : `${ch.en} gacha`)}<small>${ch.list.length}</small></a>`).join("")}</div></section>` : ""}
  ${related.length ? `<section class="section">
    <div class="section-head"><h2>${lang === "ja" ? "関連するガチャ" : t.related}</h2><a class="more" href="${c.H}genre/${g.slug}.html">${t.seeAll(gl)}</a></div>
    <div class="grid">${related.map((x) => card(x, c)).join("")}</div>
  </section>` : ""}
</div>`;

    const product = {
      "@context": "https://schema.org", "@type": "Product", name, description: description || desc, sku: it.id,
      brand: { "@type": "Brand", name: maker }, category: gl, releaseDate: ws ? ws.toISOString().slice(0, 10) : `${it.release}-01`,
      ...(janOf(it) ? { gtin13: janOf(it) } : {}),
      ...(it.price ? { offers: { "@type": "Offer", price: it.price, priceCurrency: "JPY", url: canonical(lang, rel), availability: "https://schema.org/InStoreOnly" } } : {}),
    };
    if (absImg(it)) product.image = [absImg(it)];
    const crumbs = {
      "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
        { "@type": "ListItem", position: 2, name: gl, item: canonical(lang, `genre/${g.slug}.html`) },
        { "@type": "ListItem", position: 3, name },
      ],
    };
    layout({ rel, title: t.itemTitle(name), description: desc, body, jsonld: [product, crumbs], ogImage: absImg(it), ogType: "product",
      noindex: lang === "en" && !it.name_en, noAlt: !it.name_en, lastmod: it.updated || it.added || "" });
  }

  /* ---------- 一覧ページ（ジャンル別・メーカー別） ---------- */
  const LIST_MAX = 150;
  const listPage = (rel, { title, lead, list, current = "", ogImage = "" }) => {
    const c = ctx(rel);
    const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>${esc(title)}</span></nav>
  <header class="page-head"><h1>${esc(title)}</h1><p class="lead">${esc(lead)}</p></header>
  <section class="section" style="padding-top:40px">${list.length ? `<div class="grid">${list.slice(0, LIST_MAX).map((it) => card(it, c)).join("")}</div>${list.length > LIST_MAX ? `<p class="more-wrap fine">${lang === "ja" ? `新しい${LIST_MAX}件を表示しています（全${list.length}件）。それより前のガチャは<a href="${c.H}calendar.html">発売カレンダー</a>の月ごとのページで見られます。` : `Showing the latest ${LIST_MAX} of ${list.length}. Older ones are in the <a href="${c.H}calendar.html">release calendar</a>.`}</p>` : ""}` : `<p class="empty">${t.empty}</p>`}</section>
</div>`;
    const jsonld = [
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
        { "@type": "ListItem", position: 2, name: title } ] },
      ...(list.length ? [{ "@context": "https://schema.org", "@type": "ItemList", numberOfItems: list.length,
        itemListElement: list.slice(0, 30).map((it, i) => ({ "@type": "ListItem", position: i + 1, url: canonical(lang, `item/${it.id}.html`), name: nameOf(it, lang) })) }] : []),
    ];
    layout({ rel, title, description: lead, body, current, ogImage, jsonld, lastmod: list.reduce((m, it) => (it.added > m ? it.added : m), "") });
  };
  // キャラクター・作品ごとのページ
  for (const ch of CHARAS) {
    const list = [...ch.list].sort(byNewest);
    const L = lang === "ja" ? ch.label : ch.en;
    const top = list[0];
    listPage(`chara/${ch.slug}.html`, {
      title: lang === "ja" ? `${L}のガチャガチャ新作・発売日一覧【${YM_NOW}最新】` : `${L} gacha (capsule toys) in Japan – new releases & where to buy`,
      lead: lang === "ja"
        ? `${L}のガチャガチャ${list.length}シリーズを新しい順にまとめました。最新は「${top.name}」（${t.month(top.release)}・1回${top.price}円）。それぞれのページで発売日・値段・全何種か・どこで売っているか（在庫店）を確認できます。`
        : `${list.length} ${L} capsule toy series, newest first, with release dates, prices and where to buy.`,
      list, current: "genre",
    });
  }
  {
    const rel = "chara.html", c = ctx(rel);
    const title = lang === "ja" ? "キャラクター・作品からガチャガチャを探す" : "Gacha by character & series";
    const lead = lang === "ja" ? `サンリオ・ポケモン・ディズニーなど${CHARAS.length}のキャラクター・作品ごとに、新作ガチャガチャの発売日・値段をまとめています。` : `Looking for a favorite character? Browse capsule toys sold in Japan by character or series – ${CHARAS.length} lists.`;
    const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>${esc(title)}</span></nav>
  <header class="page-head"><h1>${esc(title)}</h1><p class="lead">${esc(lead)}</p></header>
  <section class="section" style="padding-top:32px"><div class="chara-list">${CHARAS.map((ch) => `<a class="chara-chip" href="${c.H}chara/${ch.slug}.html">${esc(lang === "ja" ? ch.label : ch.en)}<small>${ch.list.length}</small></a>`).join("")}</div></section>
</div>`;
    layout({ rel, title, description: lead, body, current: "genre", jsonld: [] });
  }
  // 今週発売のガチャ（X の「今週発売」投稿のリンク先）
  listPage("week.html", {
    title: lang === "en" ? `New gacha releasing this week (${WEEK.range}) – ${WEEK.items.length} series` : `今週発売のガチャガチャ新作（${WEEK.range}）${WEEK.items.length}シリーズ`,
    lead: lang === "en" ? `${WEEK.items.length} capsule toy series releasing this week, most popular first.` : `${WEEK.label}（${WEEK.range}）に発売されるガチャ${WEEK.items.length}シリーズを、人気の順に並べています。発売日は地域や店舗によって前後します。`,
    list: WEEK.items, current: "calendar",
    ogImage: fs.existsSync(path.join(ROOT, "images", "og", "week.jpg")) ? `${SITE_URL}/images/og/week.jpg?v=${today}` : "",
  });
  listPage("next-week.html", {
    title: lang === "en" ? `Gacha releasing next week (${NEXT_WEEK.range}) – ${NEXT_WEEK.items.length} series` : `来週発売のガチャガチャ新作（${NEXT_WEEK.range}）${NEXT_WEEK.items.length}シリーズ`,
    lead: lang === "en" ? `${NEXT_WEEK.items.length} capsule toy series releasing next week.` : `${NEXT_WEEK.label}（${NEXT_WEEK.range}）に発売予定のガチャ${NEXT_WEEK.items.length}シリーズです。発売日は地域や店舗によって前後します。`,
    list: NEXT_WEEK.items, current: "calendar",
  });
  // 新着ガチャ（トップの「全部見る」のリンク先）
  listPage("new.html", {
    title: lang === "en" ? "Latest gacha (capsule toys) added" : "新着ガチャガチャ一覧（最新の新作情報）",
    lead: lang === "en" ? "The latest Japanese capsule toys added to the site, newest first, with release month, price and number of designs." : "バンダイ・タカラトミーアーツなどの新作ガチャガチャを、サイトに載った新しい順に並べています。発売月・価格・全何種かもひと目でわかります。",
    list: [...items].sort(byNewest).slice(0, 120), current: "new",
  });
  for (const g of TYPES) {
    const list = inType(g.slug).sort(byNewest);
    if (list.length) listPage(`type/${g.slug}.html`, { title: t.typePage(genreLabel(g, lang)), lead: t.typeLead(genreLabel(g, lang), list.length), list, current: "genre" });
  }
  for (const g of GENRES) {
    const list = inGenre(g.slug).sort(byNewest);
    if (!list.length) continue;
    listPage(`genre/${g.slug}.html`, { title: t.genrePage(genreLabel(g, lang)), lead: t.genreLead(genreLabel(g, lang), list.length), list, current: "genre" });
  }
  for (const maker of [...new Set(items.map((it) => it.maker))]) {
    const list = items.filter((it) => it.maker === maker).sort(byNewest);
    const label = makerOf(list[0], lang);
    listPage(`maker/${makerSlug(maker)}.html`, { title: t.makerPage(label), lead: t.makerLead(label, list.length), list });
  }

  /* ---------- 発売カレンダー（今月〜わかる範囲の先の月、週ごと）と、過去の月ごとのページ ---------- */
  {
    // 発売週が分かる商品は、その週の月に入れる（バンダイの10月分に「11月第1週」発売が混ざるため）
    const calMonthOf = (it) => { const s = weekStartOf(it); return s ? s.toISOString().slice(0, 7) : it.release; };
    const allMonths = [...new Set(items.map(calMonthOf))].sort();
    const prevMonth = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    // 今月 → 来月以降（公式に載っている分すべて）→ 先月 の順
    const recent = [...allMonths.filter((m) => m >= thisMonth), ...allMonths.filter((m) => m >= prevMonth && m < thisMonth)];
    const past = allMonths.filter((m) => m < prevMonth).reverse();
    const en = lang === "en";
    const weekTitle = (w) => en ? `${MONTH_EN[w.m - 1]} week ${w.no}` : `${w.m}月 第${w.no}週`;
    const weekBadge = (w) => w.key === WEEK.key ? `<span class="wk-now">${en ? "This week" : "今週"}</span>`
      : w.key < WEEK.key ? `<span class="wk-past">${en ? "Out now" : "発売済み"}</span>` : "";
    // 1か月分を「週ごと」に分ける。週が分からないものは最後に「週未定」
    const weeksOf = (m) => {
      const list = items.filter((it) => calMonthOf(it) === m);
      const groups = new Map();
      const none = [];
      for (const it of list) {
        const s = weekStartOf(it);
        if (!s) { none.push(it); continue; }
        const w = weekInfo(s);
        if (!groups.has(w.key)) groups.set(w.key, { w, list: [] });
        groups.get(w.key).list.push(it);
      }
      const out = [...groups.values()].sort((a, b) => (a.w.key < b.w.key ? -1 : 1));
      for (const g of out) g.list.sort(byPopular);
      if (none.length) out.push({ w: null, list: none.sort(byPopular) });
      return { list, groups: out };
    };
    // 週の見出し：日付を大きく。たくさんある週は最初の何件かだけ出して「この週をもっと見る」
    const calCard = (it, c) => card(it, c).replace('class="card"', 'class="card cal-card"');
    const weekBlock = (m, g, c) => {
      const id = g.w ? `w${g.w.key}` : `w${m}-tbd`;
      const n = g.list.length;
      const cls = ["cal-week", g.w && g.w.key === WEEK.key ? "is-now" : "", g.w && g.w.key < WEEK.key ? "is-past" : "", n > 12 ? "many" : "", n > 9 ? "some" : ""].filter(Boolean).join(" ");
      const head = g.w
        ? `<div class="cal-date"><span class="cal-no">${en ? `Week ${g.w.no}` : `第${g.w.no}週`}</span><b>${g.w.range}</b></div>
          <div class="cal-info"><span>${weekTitle(g.w)}${en ? " releases" : "発売"}</span><small>${n}${en ? " series" : "シリーズ"}</small>${weekBadge(g.w)}</div>`
        : `<div class="cal-date tbd"><span class="cal-no">${en ? "TBA" : "週未定"}</span><b>${en ? "Date TBA" : "発売日未定"}</b></div>
          <div class="cal-info"><span>${en ? "Release week not announced" : "発売週がまだ発表されていない商品"}</span><small>${n}${en ? " series" : "シリーズ"}</small></div>`;
      return `<section class="${cls}" id="${id}"><header class="cal-head">${head}</header>
        <div class="grid cal-grid">${g.list.map((it) => calCard(it, c)).join("")}</div>
        <p class="cal-more-wrap"><button type="button" class="btn cal-more-btn" data-open="${en ? `Show all ${n}` : `この週をもっと見る（全${n}件）`}" data-close="${en ? "Show less" : "閉じる"}">${en ? `Show all ${n}` : `この週をもっと見る（全${n}件）`}</button></p></section>`;
    };
    const monthBlock = (m, c) => {
      const [y, mo] = m.split("-");
      const { list, groups } = weeksOf(m);
      return `<div class="cal-month" id="m${m}"><h2 class="cal-month-head"><span class="cal-y">${y}</span><b>${en ? MONTH_EN[Number(mo) - 1] : `${Number(mo)}月`}</b><small>${list.length}${en ? " series" : "シリーズ"}</small>${m === thisMonth ? `<span class="now">${t.thisMonth}</span>` : ""}</h2>
      ${groups.map((g) => weekBlock(m, g, c)).join("")}</div>`;
    };
    // ページ上部の週ボタン：先月 → 今月 → 来月以降を1段ずつ。どの月も第1〜4週（あれば第5週）＋週未定が横一列におさまる
    const jumpNav = () => {
      const rows = [];
      for (const m of recent.slice().sort()) {
        const [y, mo] = m.split("-").map(Number);
        const groups = weeksOf(m).groups;
        const byKey = new Map(groups.filter((g) => g.w).map((g) => [g.w.key, g]));
        const tbd = groups.find((g) => !g.w);
        const first = new Date(Date.UTC(y, mo - 1, 1));
        const mondays = [];
        for (let d = 1 + ((8 - first.getUTCDay()) % 7); d <= new Date(Date.UTC(y, mo, 0)).getUTCDate(); d += 7) mondays.push(new Date(Date.UTC(y, mo - 1, d)));
        const cells = mondays.map((mon) => {
          const w = weekInfo(mon), g = byKey.get(w.key);
          const lab = `<b>${en ? `W${w.no}` : `第${w.no}週`}</b><small>${w.range.split("〜")[0]}〜</small>`;
          const cls = [w.key === WEEK.key ? "on" : "", w.key < WEEK.key ? "past" : ""].filter(Boolean).join(" ");
          return g ? `<a href="#w${w.key}"${cls ? ` class="${cls}"` : ""}>${lab}<i>${g.list.length}${en ? "" : "件"}</i></a>` : `<span class="off">${lab}<i>-</i></span>`;
        });
        if (mondays.length < 5) cells.push(`<span class="blank"></span>`);
        cells.push(tbd ? `<a href="#w${m}-tbd" class="tbd"><b>${en ? "TBA" : "未定"}</b><small>${en ? "week" : "週未定"}</small><i>${tbd.list.length}${en ? "" : "件"}</i></a>` : `<span class="off tbd"><b>${en ? "TBA" : "未定"}</b><small>&nbsp;</small><i>-</i></span>`);
        rows.push(`<div class="wg-row${m === thisMonth ? " now" : ""}"><a class="wg-month" href="#m${m}"><b>${en ? MONTH_EN[mo - 1] : `${mo}月`}</b><small>${weeksOf(m).list.length}${en ? "" : "件"}</small></a>${cells.join("")}</div>`);
      }
      return rows.length ? `<nav class="week-grid" id="week-grid" aria-label="${en ? "Jump to week" : "週へジャンプ"}">${rows.join("")}</nav>
  <a class="wg-back" href="#week-grid" aria-label="${en ? "Back to weeks" : "週のボタンにもどる"}">${en ? "Weeks" : "週をえらぶ"}<span>▲</span></a>` : "";
    };
    // 月ごとのページ（先の月も含めて全部）。「2026年12月発売 ガチャ」のような検索の受け皿
    const monthPages = allMonths.slice().reverse();
    const monthLabel = (m) => { const [y, mo] = m.split("-"); return en ? `${MONTH_EN[Number(mo) - 1]} ${y}` : `${y}年${Number(mo)}月`; };
    const monthCount = (m) => items.filter((it) => calMonthOf(it) === m).length;
    const archiveNav = (c, cur) => `<nav class="archive" aria-label="${en ? "Monthly pages" : "月ごとのページ"}"><h2>${en ? "Browse by month" : "月ごとに見る"}</h2><div class="archive-list">${monthPages.map((m) =>
      m === cur ? `<span class="cur">${monthLabel(m)} ${monthCount(m)}${en ? " series" : "シリーズ"}</span>`
        : `<a href="${c.H}calendar/${m}.html">${monthLabel(m)} ${monthCount(m)}${en ? " series" : "シリーズ"}</a>`).join("")}</div></nav>`;
    const itemListLd = (rel, list) => ({ "@context": "https://schema.org", "@type": "ItemList", numberOfItems: list.length,
      itemListElement: list.slice(0, 30).map((it, i) => ({ "@type": "ListItem", position: i + 1, url: canonical(lang, `item/${it.id}.html`), name: nameOf(it, lang) })) });
    const crumbLd = (rel, name) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
      { "@type": "ListItem", position: 2, name: t.calH1, item: canonical(lang, "calendar.html") },
      ...(name ? [{ "@type": "ListItem", position: 3, name }] : []) ] });
    {
      const c = ctx("calendar.html");
      const ahead = allMonths.filter((m) => m >= prevMonth);
      const span = ahead.length ? `${monthLabel(ahead[0])}〜${monthLabel(ahead[ahead.length - 1])}` : "";
      const title = en ? `Gacha release calendar ${span.replace("〜", " – ")}: new capsule toys by week` : `ガチャガチャ発売日カレンダー｜${span}の新作を週ごとに一覧`;
      const desc = en ? `New Japanese capsule toys (gacha) by release week, ${span.replace("〜", " – ")}. ${WEEK.items.length} series this week (${WEEK.range}) and ${monthCount(thisMonth)} this month, with prices, number of designs and makers.`
        : `新作ガチャガチャの発売日を週ごとにまとめたカレンダー（${span}）。今週（${WEEK.range}）は${WEEK.items.length}シリーズ、今月は${monthCount(thisMonth)}シリーズ発売。バンダイ・タカラトミーアーツの価格・種類数もひと目でわかります。`;
      const upcoming = recent.flatMap((m) => weeksOf(m).groups.flatMap((g) => g.list));
      const body = `<div class="wrap">
  <header class="page-head"><h1>${t.calH1}</h1><p class="lead">${t.calLead}</p></header>
  ${jumpNav()}
  <div class="cal">${recent.map((m) => monthBlock(m, c)).join("")}</div>
  ${archiveNav(c, "")}
</div>`;
      layout({ rel: "calendar.html", title, description: desc, body, current: "calendar", jsonld: [crumbLd("calendar.html", ""), itemListLd("calendar.html", upcoming)] });
    }
    for (const m of allMonths) {
      const rel = `calendar/${m}.html`;
      const c = ctx(rel);
      const [y, mo] = m.split("-");
      const n = monthCount(m);
      const future = m >= thisMonth;
      const title = en ? `${future ? "New gacha releasing in" : "Gacha released in"} ${monthLabel(m)} (${n} series)`
        : `${y}年${Number(mo)}月発売のガチャガチャ${future ? "新作" : ""}一覧（${n}シリーズ）`;
      const groups = weeksOf(m).groups;
      const weeksTxt = groups.filter((g) => g.w).map((g) => en ? `week ${g.w.no}: ${g.list.length}` : `第${g.w.no}週${g.list.length}件`).join(en ? ", " : "・");
      const top = groups.flatMap((g) => g.list).sort(byPopular).slice(0, 3).map((it) => nameOf(it, lang));
      const desc = en ? `${n} capsule toy series ${future ? "releasing" : "released"} in ${monthLabel(m)}, grouped by release week${weeksTxt ? ` (${weeksTxt})` : ""}. Including ${top.join(", ")}.`
        : `${y}年${Number(mo)}月に発売${future ? "される" : "された"}ガチャガチャ${n}シリーズを発売週ごとに掲載${weeksTxt ? `（${weeksTxt}）` : ""}。${top.join("、")}など。`;
      const i = allMonths.indexOf(m), prev = allMonths[i - 1], next = allMonths[i + 1];
      const pager = `<nav class="month-pager">${prev ? `<a href="${c.H}calendar/${prev}.html">← ${monthLabel(prev)}</a>` : "<span></span>"}<a href="${c.H}calendar.html">${en ? "Calendar" : "カレンダーへ"}</a>${next ? `<a href="${c.H}calendar/${next}.html">${monthLabel(next)} →</a>` : "<span></span>"}</nav>`;
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.H}calendar.html">${t.calH1}</a><span>/</span><span>${esc(monthLabel(m))}</span></nav>
  <header class="page-head"><h1>${esc(title)}</h1><p class="lead">${esc(desc)}</p></header>
  <div class="cal">${monthBlock(m, c)}</div>
  ${pager}
  ${archiveNav(c, m)}
</div>`;
      layout({ rel, title, description: desc, body, current: "calendar", jsonld: [crumbLd(rel, monthLabel(m)), itemListLd(rel, groups.flatMap((g) => g.list))] });
    }
    void past;
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

  /* ---------- 検索結果ページ ---------- */
  {
    const body = `<div class="wrap">
  <header class="page-head"><h1 id="sr-title">${t.searchTitle}</h1><p class="lead" id="sr-note"></p></header>
  <section class="section" style="padding-top:32px"><div class="grid" id="sr-grid"></div></section>
</div>`;
    layout({ rel: "search.html", title: t.searchTitle, description: t.searchTitle, body, extraHead: `<meta name="robots" content="noindex, follow">` });
  }
  write(`data/search-${lang}.json`, JSON.stringify(items.map((it) => ({
    id: it.id, n: nameOf(it, lang), a: lang === "en" ? it.name : it.name_en, m: makerOf(it, lang), img: thumbOf(it.image), p: it.price, l: it.lineup, r: t.month(it.release), g: genreLabel(genreOf(it.genre), lang),
    k: [...(it.tags || []), ...(it.tags_en || []), ...(it.lineup_names || [])].join(" "),
  }))));

  /* ---------- みんなのガチャマップ（日本語だけ） ---------- */
  if (lang === "ja") {
    const LEAF = `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="" defer></script>`;
    const shopCard = (sh, c) => `<a class="shop-row" href="${c.R}shop/${sh.id}.html"><b>${esc(sh.name)}</b><span>${esc(sh.address || sh.pref || "")}</span>${SHOP_RATINGS[sh.id] ? `<span class="shop-stars">${starsHtml(SHOP_RATINGS[sh.id])}</span>` : ""}${(SHOP_OFFICIAL[sh.id] || []).length ? `<em>取扱中 ${(SHOP_OFFICIAL[sh.id] || []).length}種</em>` : ""}${sh.src === "user" ? '<i class="tag-user">みんなが追加</i>' : ""}</a>`;
    // 地図ページ（map.html）と、ガチャ活ページ（gachakatsu.html：ルート作りを先頭に）
    for (const [rel, katsu] of [["map.html", false], ["gachakatsu.html", true]]) {
      const c = ctx(rel);
      const prefs = PREF_ORDER.filter((p) => SHOPS.some((x) => x.pref === p));
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>${katsu ? "ガチャ活" : "みんなのガチャマップ"}</span></nav>
  <header class="page-head"><h1>${katsu ? "ガチャ活｜近くのガチャを効率よく回ろう" : "みんなのガチャマップ"}</h1><p class="lead">${katsu ? "ガチャ活は、ガチャのあるお店を巡ってお目当てのガチャを探すこと。今いる場所から近いお店を、回りやすい順番でご案内します。" : "全国のガチャのあるお店を地図で探せます。お店の在庫や台数は、みんなの報告で更新されます。地図にないお店は「ガチャのある場所をピン」から、だれでも足せます。"}</p></header>
  <section class="map-wrap${katsu ? " is-katsu" : ""}">
    <div class="map-tools">
      <button class="btn btn-gold" type="button" id="map-geo">現在地のまわり</button>
      <input type="search" id="map-q" class="map-q" placeholder="お店の名前・地名・駅名で探す" autocomplete="off">
      <button class="btn" type="button" id="map-add">＋ ガチャのある場所をピン</button>
    </div>
    <div id="map" class="map" data-shops="${c.R}api/shops" data-fallback="${c.R}data/shops.json" data-root="${c.R}"></div>
    <div class="map-add" id="map-add-box" hidden>
      <p><b>地図を動かして、真ん中の＋をお店の場所に合わせてください。</b></p>
      <p class="fine" style="margin:0">イオンなどの中にあるお店は、まず建物の名前で探すとかんたんです。拡大すると地図に建物やお店の名前が出ます。</p>
      <div class="add-place"><input type="search" id="add-place" maxlength="60" placeholder="建物の名前で探す（例：イオンモール和泉府中）" autocomplete="off"><button class="btn" type="button" id="add-place-go">探す</button></div>
      <div class="add-place-c" id="add-place-c"></div>
      <label>お店の名前<input type="text" id="add-name" maxlength="60" placeholder="例：ガシャポンのデパート 池袋総本店"></label>
      <label>住所（わかれば）<input type="text" id="add-addr" maxlength="120"></label>
      <label>どんな場所？<select id="add-kind"><option value="gacha">ガチャ専門店</option><option value="game">ゲームセンター</option><option value="mall">ショッピングモール・スーパー</option><option value="station">駅・空港・サービスエリア</option><option value="shop">そのほかのお店（本屋・おもちゃ屋など）</option><option value="other">そのほか</option></select></label>
      <label>ひとことコメント（なくてもOK）<textarea id="add-memo" maxlength="140" rows="2" placeholder="例：2階の奥に50台くらい。ちいかわ多め"></textarea></label>
      <div class="map-add-btns"><button class="btn btn-gold" type="button" id="add-send">この場所で追加する</button><button class="btn btn-ghost" type="button" id="add-cancel">やめる</button></div>
      <p class="fine" id="add-msg" role="status"></p>
    </div>
    <div class="katsu panel" id="katsu" data-items="${c.R}data/shop-items.json?v=${QUIZ_V}" data-search="${c.R}data/search-ja.json" data-quiz="${c.R}data/quiz-ja.json?v=${QUIZ_V}" data-amz="${esc(site.amazon_tag || "")}" data-rak="${esc(site.rakuten_affiliate_id || "")}">
      <h2 style="font-size:20px">🪐 ガチャ活ルートを作る</h2>
      <p class="fine" style="margin-top:4px">今いる場所から近いお店を、効率よく回れる順番に並べます。探したいガチャを入れると、そのガチャの取扱があるお店だけで作ります。</p>
      <div class="k-tabs" role="tablist">
        <button class="sort is-on" type="button" data-plan="count">お店の数で</button>
        <button class="sort" type="button" data-plan="time">時間内でたくさん</button>
        <button class="sort" type="button" data-plan="dest">目的地までの寄り道</button>
      </div>
      <div class="katsu-form">
        <label data-for="count">回るお店の数<select id="k-n"><option>3</option><option selected>5</option><option>8</option><option>10</option><option>12</option><option>15</option></select></label>
        <label data-for="time" hidden>ガチャ活の時間<select id="k-time"><option value="30">30分</option><option value="60" selected>1時間</option><option value="90">1時間半</option><option value="120">2時間</option><option value="180">3時間</option><option value="240">4時間</option><option value="300">5時間</option><option value="360">6時間</option></select></label>
        <label data-for="time" hidden>1店にいる時間<select id="k-stay"><option value="5">5分</option><option value="10" selected>10分</option><option value="15">15分</option><option value="20">20分</option></select></label>
        <label data-for="dest" hidden>寄り道してもいい時間<select id="k-detour"><option value="10">10分まで</option><option value="20" selected>20分まで</option><option value="30">30分まで</option><option value="60">1時間まで</option><option value="90">1時間半まで</option><option value="120">2時間まで</option><option value="180">3時間まで</option></select></label>
        <label>交通手段<select id="k-mode"><option value="walking">徒歩</option><option value="bicycling">自転車</option><option value="transit">電車・バス</option><option value="driving">車</option></select></label>
        <label class="k-wide" data-for="dest" hidden>目的地（お店の名前か、下のボタンで地図をタップ）<input type="search" id="k-dest" list="k-shops" placeholder="例：ガシャポンのデパート 池袋総本店" autocomplete="off"><datalist id="k-shops"></datalist></label>
        <div class="k-wide" data-for="dest" hidden><button class="btn" type="button" id="k-pick">地図をタップして目的地を決める</button> <span class="fine" id="k-dest-note"></span></div>
        <label class="k-wide">探したいガチャ（なくてもOK）<input type="search" id="k-item" list="k-items" placeholder="例：ちいかわ めじるしアクセサリー3" autocomplete="off"><datalist id="k-items"></datalist></label>
        <label class="k-check" data-for="count time"><input type="checkbox" id="k-back"> 最後に出発した場所へ戻る</label>
      </div>
      <div class="k-start"><input type="search" id="k-start" placeholder="出発する場所を地名・駅名で（例：新宿駅、渋谷）" autocomplete="off"><button class="btn" type="button" id="k-start-go">この場所から作る</button></div>
      <div class="map-add-btns"><button class="btn btn-gold" type="button" id="k-go">現在地からルートを作る</button><button class="btn" type="button" id="k-here">地図の真ん中から作る</button></div>
      <p class="fine" id="k-msg" role="status"></p>
      <div id="k-result" hidden>
        <p class="k-sum" id="k-sum"></p>
        <ol class="k-list" id="k-list"></ol>
        <p class="fine" id="k-ex"></p>
        <div class="map-add-btns" id="k-gmaps"></div><div class="map-add-btns"><button class="btn btn-ghost" type="button" id="k-clear">ルートを消す</button></div>
        <p class="fine">距離はまっすぐ測った目安で、実際の道のりはもう少し長くなります。営業時間はお店でご確認ください。</p>
      </div>
      <div class="katsu-goods">
        <h3>ガチャ活の持ちもの<span class="pr">PR</span></h3>
        <div class="kg-list">${[["🪙", "100円玉がすぐ出せるコインケース", "コインケース 100円玉 収納"], ["👜", "カプセルがまとまる巾着・エコバッグ", "エコバッグ コンパクト 折りたたみ"], ["🔋", "地図とナビの電池切れ対策に", "モバイルバッテリー 軽量 薄型"], ["🖼️", "集めたガチャを飾るコレクションケース", "コレクションケース フィギュア ミニ"]].map(([ic, label, q]) => { const a = affSearch(q); return `<div class="kg"><span class="kg-ic" aria-hidden="true">${ic}</span><span class="kg-l">${label}</span><span class="kg-b"><a href="${esc(a.amazon)}" target="_blank" rel="sponsored noopener">Amazon</a><a href="${esc(a.rakuten)}" target="_blank" rel="sponsored noopener">楽天</a></span></div>`; }).join("")}</div>
      </div>
    </div>
    <p class="fine">地図：国土地理院の地図と、拡大したときは OpenStreetMap を使っています。お店の情報はバンダイ公式「ガシャポンどこ？」の取扱店と、みんなの報告をもとにしています。<a href="${c.R}rules.html">投稿のきまり</a></p>
  </section>
  <section class="section"><div class="section-head"><h2>都道府県から探す</h2></div>
    <div class="archive-list">${prefs.map((p) => `<a href="${c.R}shops/${prefSlug(p)}.html">${p}（${SHOPS.filter((x) => x.pref === p).length}）</a>`).join("")}</div>
  </section>
</div>`;
      layout({ rel, title: katsu ? "ガチャ活ルート｜近くのガチャのあるお店を効率よく回る" : "みんなのガチャマップ｜全国のガチャのあるお店", description: katsu ? "ガチャ活（ガチャ巡り）のルートを自動で作成。今いる場所から近いガチャのあるお店を、回りやすい順番でご案内。探したいガチャの取扱店だけで作ることもできます。" : `全国${SHOPS.length}店のガチャのあるお店を地図で探せます。在庫や台数はみんなの報告で更新。地図にないお店も追加できます。`, body, current: katsu ? "katsu" : "map", jaOnly: true, extraHead: LEAF });
    }
    // 都道府県ごとのお店一覧
    for (const p of PREF_ORDER) {
      const list = SHOPS.filter((x) => x.pref === p).sort((a, b) => (SHOP_OFFICIAL[b.id] || []).length - (SHOP_OFFICIAL[a.id] || []).length || (a.name > b.name ? 1 : -1));
      if (!list.length) continue;
      const rel = `shops/${prefSlug(p)}.html`;
      const c = ctx(rel);
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.R}map.html">ガチャマップ</a><span>/</span><span>${p}</span></nav>
  <header class="page-head"><h1>${p}のガチャのあるお店</h1><p class="lead">${p}でガチャを置いているお店${list.length}店。取扱中のガチャが多い順に並べています。</p></header>
  <section class="section" style="padding-top:32px"><div class="shop-list">${list.map((sh) => shopCard(sh, c)).join("")}</div></section>
</div>`;
      layout({ rel, title: `${p}のガチャのあるお店（${list.length}店）`, description: `${p}でガチャガチャを置いているお店${list.length}店の一覧。取扱中のガチャ、在庫や台数のみんなの報告も見られます。`, body, current: "map", jaOnly: true });
    }
    // ☆評価の高いお店
    {
      const rel = "toprated.html", c = ctx(rel);
      const byId = new Map(SHOPS.map((x) => [x.id, x]));
      const score = (r) => (r.avg * r.n + 3.5 * 3) / (r.n + 3);
      const top = Object.entries(SHOP_RATINGS).map(([id, r]) => ({ sh: byId.get(id), r })).filter((x) => x.sh).sort((a, b) => score(b.r) - score(a.r) || b.r.n - a.r.n);
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.R}map.html">ガチャマップ</a><span>/</span><span>評価の高いお店</span></nav>
  <header class="page-head"><h1>☆評価の高いガチャのお店</h1><p class="lead">みんながつけた☆評価が高いお店のランキングです。都道府県ごとに見られます。評価の数が少ないお店が上に来すぎないように、評価の数も考えて並べています。</p></header>
  <section class="section" style="padding-top:32px">
    <div class="ts-pref"><label for="ts-pref">都道府県</label><select id="ts-pref"><option value="">全国</option>${PREF_ORDER.map((p) => `<option value="${p}">${p}</option>`).join("")}</select></div>
    <ol class="top-shops" id="top-shops" data-api="${c.R}api/toprated" data-root="${c.R}" data-init="${esc(JSON.stringify(top.map((x) => ({ id: x.sh.id, name: x.sh.name, pref: x.sh.pref || "", avg: x.r.avg, n: x.r.n }))))}"></ol>
    <p class="fine" style="margin-top:20px">☆は各お店のページでつけられます。<a href="${c.R}map.html">ガチャマップからお店を探す</a></p>
  </section>
</div>`;
      layout({ rel, title: "☆評価の高いガチャのお店ランキング（都道府県別）", description: "みんなの☆評価が高いガチャガチャのお店ランキングを都道府県別に。品ぞろえや台数のコメントも見られます。", body, current: "toprated", jaOnly: true });
    }
    // 抽選情報
    {
      const rel = "lottery.html", c = ctx(rel);
      const nowIso = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16);
      const live = LOTTERY.filter((x) => x.end >= nowIso).sort((a, b) => (a.end > b.end ? 1 : -1));
      const KIND = { item: "商品の抽選", open: "オープン・入場", event: "イベント" };
      const fmt = (d) => { const m = d.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/); if (!m) return d; const w = "日月火水木金土"[new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`).getUTCDay()]; return `${+m[2]}/${+m[3]}(${w}) ${m[4]}:${m[5]}`; };
      const prefs = [...new Set(live.map((x) => x.pref).filter(Boolean))].sort((a, b) => PREF_ORDER.indexOf(a) - PREF_ORDER.indexOf(b));
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>抽選情報</span></nav>
  <header class="page-head"><h1>ガチャの抽選情報</h1><p class="lead">人気ガチャの抽選販売や、新しいお店のオープン日の入場整理券など、いま受付中・これから始まる抽選をまとめています。締め切りが近い順です。</p></header>
  <section class="section" style="padding-top:24px">
    ${prefs.length > 1 ? `<div class="lot-filter" id="lot-filter"><button class="sort is-on" type="button" data-pref="">すべて</button>${prefs.map((p) => `<button class="sort" type="button" data-pref="${p}">${p}</button>`).join("")}</div>` : ""}
    <ul class="lot-list" id="lot-list">${live.length ? live.map((x) => `<li class="lot" data-pref="${esc(x.pref || "")}" data-start="${esc(x.start)}" data-end="${esc(x.end)}">
      <div class="lot-top"><span class="lot-state"></span><span class="lot-kind">${KIND[x.kind] || "抽選"}</span>${x.pref ? `<span class="lot-pref">📍${esc(x.pref)}</span>` : ""}</div>
      <h3>${esc(x.title)}</h3>
      <p class="lot-store">${esc(x.store)}</p>
      <p class="lot-when">受付：${fmt(x.start)} 〜 <b>${fmt(x.end)}</b></p>
      <p class="lot-how">応募方法：${esc(x.method || "お店でご確認ください")}${x.note ? `　<small>${esc(x.note)}</small>` : ""}</p>
      ${x.url ? `<a class="btn btn-gold" href="${esc(x.url)}" target="_blank" rel="noopener">応募ページを開く</a>` : ""}
    </li>`).join("") : '<li class="fine">いま受付中の抽選はありません。</li>'}</ul>
    <p class="fine" style="margin-top:20px">抽選の内容は変わることがあります。応募の前に、必ずお店の公式X・公式サイトで最新の情報をご確認ください。</p>
  </section>
</div>`;
      layout({ rel, title: "ガチャの抽選情報（受付中・これから）", description: "人気ガチャの抽選販売、お店のオープン日の入場整理券など、受付中・これから始まるガチャの抽選情報まとめ。", body, current: "lottery", jaOnly: true });
    }
    // お店ごとのページ
    for (const sh of SHOPS) {
      const rel = `shop/${sh.id}.html`;
      const c = ctx(rel);
      const off = (SHOP_OFFICIAL[sh.id] || []).map((id) => itemById.get(id)).filter(Boolean).sort(byNewest);
      const rp = SHOP_REPORTS[sh.id];
      const gmap = `https://www.google.com/maps/search/?api=1&query=${sh.lat},${sh.lng}`;
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.R}map.html">ガチャマップ</a><span>/</span>${sh.pref ? `<a href="${c.R}shops/${prefSlug(sh.pref)}.html">${esc(sh.pref)}</a><span>/</span>` : ""}<span>${esc(sh.name)}</span></nav>
  <article class="shop" id="shop" data-id="${sh.id}" data-api="${c.R}api/shop/${sh.id}" data-report="${c.R}api/report" data-comment="${c.R}api/comment" data-root="${c.R}" data-lat="${sh.lat}" data-lng="${sh.lng}">
    <header class="page-head" style="padding-top:28px">
      <p class="eyebrow">${sh.src === "user" ? `みんなが追加した場所${KIND_LABEL[sh.kind] ? `・${KIND_LABEL[sh.kind]}` : ""}` : "ガシャポン公式の取扱店"}</p>
      <h1>${esc(sh.name)}</h1>
      <p class="lead">${esc(sh.address || sh.pref || "")}</p>
      <div class="item-actions"><a class="btn" href="${esc(gmap)}" target="_blank" rel="noopener">Googleマップで開く</a><a class="btn" href="${c.R}map.html#${sh.id}">ガチャマップで見る</a></div>
    </header>
    <div class="shop-grid">
      <div class="shop-mapbox"><div id="shop-map" class="map map-sm"></div>
        ${sh.src === "user" ? `<div class="map-add-btns" id="mv-btns"><button class="sort" type="button" id="mv-start">📍 ピンの位置がずれていたら直す</button></div>` : ""}
        <div class="mv-box" id="mv-box" hidden><p class="fine"><b>地図を動かして、真ん中の＋を正しいお店の場所に合わせてください。</b>拡大すると建物やお店の名前が出ます（1回に動かせるのは1kmまで）。</p>
          <div class="map-add-btns"><button class="btn btn-gold" type="button" id="mv-save">この位置に直す</button><button class="btn btn-ghost" type="button" id="mv-cancel">やめる</button></div></div>
        <p class="fine" id="mv-msg" role="status"></p></div>
      <dl class="arr-stats shop-stats">
        <div><dt>取扱中のガチャ（公式）</dt><dd id="st-off">${off.length}種</dd></div>
        <div><dt>みんなの報告（30日）</dt><dd id="st-rep">${rp ? rp.n : 0}件</dd></div>
        <div><dt>ガチャの台数（報告）</dt><dd id="st-mac">—</dd></div>
      </dl>
    </div>
    <p class="shop-warn" id="shop-warn" hidden></p>

    <section class="section panel" id="report-box">
      <h2 style="font-size:20px">在庫を報告する</h2>
      <p class="fine" style="margin-top:4px">お店で見たガチャを教えてください。報告はこのページにすぐ反映されます（名前などは表示されません）。</p>
      <div class="rep-form">
        <input type="search" id="rep-item" list="rep-items" placeholder="ガチャの名前（例：ちいかわ めじるし）" autocomplete="off" maxlength="60">
        <datalist id="rep-items">${off.map((it) => `<option value="${esc(it.name)}">`).join("")}</datalist>
        <div class="rep-btns"><button class="btn btn-gold" type="button" data-kind="in">あった</button><button class="btn" type="button" data-kind="out">なかった・売り切れ</button></div>
      </div>
      <div class="rep-more">
        <span>このお店のガチャの台数：</span>${["~10", "~50", "~100", "100+"].map((v) => `<button class="sort" type="button" data-kind="machines" data-value="${v}">${v === "100+" ? "100台以上" : v.replace("~", "") + "台くらい"}</button>`).join("")}
      </div>
      <div class="rep-more"><button class="sort" type="button" data-kind="closed">閉店していた</button><button class="sort" type="button" data-kind="wrong">ここにガチャはない</button></div>
      <p class="fine" id="rep-msg" role="status"></p>
    </section>

    <section class="section panel" id="rate-box">
      <h2 style="font-size:20px">このお店の評価</h2>
      <p class="rate-now"><span class="stars-v" id="rate-avg" style="--v:0"></span><b id="rate-num">—</b><span class="fine" id="rate-n">まだ評価はありません</span></p>
      <p class="fine" style="margin:8px 0 4px">あなたの評価（タップでつけられます・つけ直しOK）</p>
      <div class="rate-pick" id="rate-pick" role="radiogroup" aria-label="☆の数">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" aria-label="${n}つ星">★</button>`).join("")}</div>
      <p class="fine" id="rate-msg" role="status"></p>
    </section>

    <section class="section panel" id="com-box">
      <h2 style="font-size:20px">コメント</h2>
      <p class="fine" style="margin-top:4px">お店のようす（台数・場所・品ぞろえなど）を自由に書けます。140文字まで。悪口・個人情報・宣伝などは書けません。</p>
      <textarea id="com-body" maxlength="140" rows="3" placeholder="例：入口すぐ左にガチャコーナー。サンリオ系が多いです"></textarea>
      <div class="map-add-btns"><button class="btn btn-gold" type="button" id="com-send">コメントする</button><span class="fine" id="com-count">0/140</span></div>
      <p class="fine" id="com-msg" role="status"></p>
      <ul class="com-list" id="com-list"></ul>
    </section>

    <section class="section" id="rep-sec">
      <div class="section-head"><h2>みんなの在庫報告</h2></div>
      <ul class="rep-list" id="rep-list"><li class="fine">読み込み中…</li></ul>
    </section>

    ${off.length ? `<section class="section"><div class="section-head"><h2>取扱中のガチャ（公式）</h2></div>
      <p class="fine" style="margin-top:-16px;margin-bottom:20px">バンダイ公式「ガシャポンどこ？」で、このお店の取扱があるガチャです（通信機能のあるマシンのみ）。</p>
      <div class="grid">${off.slice(0, 40).map((it) => card(it, c)).join("")}</div></section>` : ""}
  </article>
  <p class="fine" style="margin-top:40px">お店の情報は、バンダイ公式の取扱店とみんなの報告をもとにしています。実際と違うことがあります。営業時間などはお店でご確認ください。<a href="${c.R}rules.html">投稿のきまり</a></p>
</div>
<script type="application/json" id="shop-items">${JSON.stringify(off.map((it) => [it.id, it.name])).replace(/</g, "\\u003c")}</script>`;
      const city = ((sh.address || "").replace(/^\s*(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, "").match(/^.+?[市区町村]/) || [""])[0];
      const thinShop = !off.length && !(rp && rp.n) && !SHOP_RATINGS[sh.id];
      layout({ rel, title: `${sh.name}｜${city || sh.pref || ""}のガチャガチャ設置店${off.length ? `・取扱${off.length}種` : ""}`, noindex: thinShop, lastmod: rp && rp.last ? rp.last : "", description: `${sh.pref && !(sh.address || "").startsWith(sh.pref) ? sh.pref : ""}${sh.address ? sh.address.replace(/\s+/g, " ") : sh.pref || ""}にある${sh.name}のガチャガチャ情報。${off.length ? `取扱中のガチャ${off.length}種（${off.slice(0, 2).map((x) => x.name).join("、")}など）や、` : ""}みんなの在庫報告・台数・評価を確認できます。`, body, current: "map", jaOnly: true, extraHead: LEAF,
        jsonld: [{ "@context": "https://schema.org", "@type": "Store", name: sh.name, address: sh.address || undefined, geo: { "@type": "GeoCoordinates", latitude: sh.lat, longitude: sh.lng }, url: canonical("ja", rel) }] });
    }
    // 投稿のきまり
    {
      const c = ctx("rules.html");
      const body = `<div class="wrap"><header class="page-head"><h1>投稿のきまり</h1><p class="lead">みんなのガチャマップに、お店や在庫を報告するときのきまりです。</p></header>
  <div class="prose">
    <h2>報告できること</h2><p>ガチャのあるお店の場所・名前、ガチャがあった／なかった、ガチャの台数、閉店していたこと、の4つです。お店へのコメント（140文字まで）も書けます。悪口・差別・性的な言葉・個人情報（電話番号・メールなど）・宣伝やURLを含むコメントは、自動で受け付けません。3人から通報されたコメントは見えなくなります。</p>
    <h2>してはいけないこと</h2><ul><li>うその報告、いたずらでお店を追加すること</li><li>お店や人の迷惑になる報告（個人の家・お店でない場所を登録するなど）</li><li>同じ報告を何度もくり返すこと</li></ul>
    <h2>報告の扱い</h2><p>報告は名前を出さずに表示します。いたずらを防ぐため、報告した端末を見分けるための読めない符号を記録します（IPアドレスそのものは保存しません）。1日に報告できる数に上限があります。みんなが追加したお店は、「閉店していた」「ここにガチャはない」の報告が3人から来ると、自動で地図から外れます。</p>
    <p>報告は利用者からの情報です。実際の在庫や営業状況と違うことがあります。おかしな情報を見つけたら、運営者情報のページからお知らせください。</p>
  </div></div>`;
      layout({ rel: "rules.html", title: "投稿のきまり", description: "みんなのガチャマップに報告するときのきまり。", body, jaOnly: true });
    }
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
  /* ---------- プライバシーポリシー（日本語だけ） ---------- */
  if (lang === "ja") {
    const secs = [
      ["広告について", "当サイトは、Amazonアソシエイト・プログラム、楽天アフィリエイト、バリューコマース（Yahoo!ショッピング）、メルカリアンバサダーなどのアフィリエイトプログラムに参加しています。商品へのリンクから購入された場合、当サイトに紹介料が支払われることがあります。これらのリンクには「PR」と表示しています。"],
      ["Cookie（クッキー）について", "広告の提供元（Amazon、楽天、バリューコマース、メルカリなど）は、リンクのクリックや購入を確認するためにCookieを使うことがあります。Cookieはブラウザの設定で無効にできます。"],
      ["アクセス解析について", "サイトの改善のため、Cloudflareのアクセス解析を使うことがあります。個人を特定できる情報は集めていません。"],
      ["みんなの報告・コメントについて", "ガチャマップへの在庫報告・評価・コメントは、名前を出さずに表示します。いたずら防止のため、端末を見分けるための読めない符号を記録しますが、IPアドレスそのものは保存しません。"],
      ["位置情報について", "「現在地から探す」などで使う現在地は、近いお店を並べる計算だけに使い、どこにも送信しません。"],
      ["お気に入り（推し）について", "お気に入りに登録したガチャは、お使いのブラウザの中だけに保存されます。"],
      ["免責事項", "掲載している発売日・価格・取扱店・在庫などの情報は、公式情報とみんなの報告をもとにしていますが、正確さを保証するものではありません。最新の情報は各メーカーの公式サイトやお店でご確認ください。"],
      ["改定", "この方針は、必要に応じて変更することがあります。"],
    ];
    const body = `<div class="wrap">
  <header class="page-head"><h1>プライバシーポリシー</h1></header>
  <div class="prose">${secs.map(([h, p]) => `<h2>${h}</h2><p>${esc(p)}</p>`).join("\n")}<p class="fine">制定日：2026年11月7日</p></div>
</div>`;
    layout({ rel: "privacy.html", title: "プライバシーポリシー", description: "ガチャプラネットのプライバシーポリシー（広告・Cookie・アクセス解析・位置情報・みんなの報告の扱い）と免責事項。", body, jaOnly: true });
  }
}

/* ---------- 404・サイトマップ・robots・キャッシュ設定 ---------- */
write("404.html", `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>ページが見つかりません / Page not found｜${esc(site.name)}</title><link rel="stylesheet" href="/assets/style.css?v=${CSS_V}"></head>
<body><main><div class="wrap"><header class="page-head"><h1>ページが見つかりません</h1><p class="lead">販売終了などで掲載を終えた可能性があります。<br><span lang="en">This page could not be found. It may have been removed.</span></p>
<p style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-gold" href="/">トップへ戻る</a><a class="btn" href="/en/" lang="en">English home</a></p></header></div></main></body></html>`);

const lm = (d) => (d ? `<lastmod>${String(d).slice(0, 10)}</lastmod>` : "");
const urlEntry = ([lang, rel, jaOnly, , lastmod]) => jaOnly ? `  <url><loc>${esc(canonical(lang, rel))}</loc>${lm(lastmod)}</url>` : `  <url><loc>${esc(canonical(lang, rel))}</loc>${lm(lastmod)}
    <xhtml:link rel="alternate" hreflang="ja" href="${esc(canonical("ja", rel))}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${esc(canonical("en", rel))}"/>
  </url>`;
// サイトマップは種類ごとに分けて、sitemap.xml はその目次にする（Search Console で種類ごとの登録状況が見える）
{
  const groups = { items: [], hubs: [], shops: [], en: [] };
  for (const pg of pages) {
    const [lang, rel, , noindex] = pg;
    if (noindex || rel === "search.html" || rel === "404.html") continue;
    const g = lang === "en" ? "en" : /^item\//.test(rel) ? "items" : /^(shop|shops)\//.test(rel) ? "shops" : "hubs";
    groups[g].push(pg);
  }
  const maxLm = (list) => list.reduce((m, p) => (p[4] && p[4] > m ? p[4] : m), "");
  for (const [g, list] of Object.entries(groups)) {
    write(`sitemap-${g}.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${list.map(urlEntry).join("\n")}
</urlset>
`);
  }
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.keys(groups).map((g) => `  <sitemap><loc>${SITE_URL}/sitemap-${g}.xml</loc>${lm(maxLm(groups[g]) || today)}</sitemap>`).join("\n")}
</sitemapindex>
`);
}
// 古いURL → 新しいURL
write("_redirects", [
  ...SERIES.map((sr) => `/series/${sr.slug} /chara/${sr.slug} 301\n/series/${sr.slug}.html /chara/${sr.slug} 301\n/en/series/${sr.slug} /en/chara/${sr.slug} 301\n/en/series/${sr.slug}.html /en/chara/${sr.slug} 301`),
  ...Object.keys(MAKER_SLUG).flatMap((m) => [`/maker/${hashSlug(m)} /maker/${MAKER_SLUG[m]} 301`, `/en/maker/${hashSlug(m)} /en/maker/${MAKER_SLUG[m]} 301`]),
  "/chara/sanrio-characters-all /chara/sanrio 301", "/en/chara/sanrio-characters-all /en/chara/sanrio 301",
].join("\n") + "\n");
write("data/mercari-item-ids.json", JSON.stringify({ ids: [...MERCARI_ITEM_IDS] }));
write("x-img.html", fs.readFileSync(path.join(__dirname, "tpl", "x-img.html"), "utf8").replace("__FONTS__", FONTS));
if (fs.existsSync(path.join(ROOT, "brand", "logo-lab.html"))) write("logo-lab.html", fs.readFileSync(path.join(ROOT, "brand", "logo-lab.html"), "utf8"));
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /x-img\nDisallow: /logo-lab\nSitemap: ${SITE_URL}/sitemap.xml\n`);
// Cloudflare の窓口（functions/）を動かすのは、ページと /api/ だけ（画像などでは動かさず、無料の回数を節約する）
write("_routes.json", JSON.stringify({ version: 1, include: ["/", "/api/*", "/item/*", "/shop/*", "/map*", "/gachakatsu*", "/shops/*", "/rules*", "/genre/*", "/type/*", "/maker/*", "/calendar*", "/search*", "/week*", "/new*", "/faq*", "/about*", "/en", "/en/", "/en/item/*", "/en/genre/*", "/en/type/*", "/en/maker/*", "/en/calendar*", "/en/search*", "/en/week*", "/en/new*", "/en/faq*", "/en/about*", "/index.html", "/en/index.html", "/chara*", "/series/*", "/lottery*", "/toprated*", "/next-week*", "/privacy*", "/en/chara*", "/en/series/*", "/en/next-week*"], exclude: ["/assets/*", "/images/*", "/data/*"] }));
// ガチャ活：お店ごとの取扱ガチャ（ガチャの番号の一覧）。探したいガチャで絞るときだけ読む
{
  const ids = [...new Set(Object.values(SHOP_OFFICIAL).flat())].filter((id) => itemById.has(id));
  const ix = new Map(ids.map((id, i) => [id, i]));
  const shopsMap = {};
  for (const [sid, list] of Object.entries(SHOP_OFFICIAL)) { const a = list.map((id) => ix.get(id)).filter((v) => v != null); if (a.length) shopsMap[sid] = a; }
  write("data/shop-items.json", JSON.stringify({ items: ids, shops: shopsMap }));
}
write("data/shops.json", JSON.stringify(SHOPS.map((x) => [x.id, x.name, x.pref, x.lat, x.lng, x.src === "user" ? 1 : 0])));
// X投稿用のデータ（毎朝の自動予約で使う）：今週発売・紹介する新作の候補
{
  const pack = (it) => ({ id: it.id, name: it.name, maker: it.maker, price: it.price, lineup: it.lineup, lineup_names: (it.lineup_names || []).slice(0, 12), release: it.release, release_note: it.release_note || "", genre: genreLabel(genreOf(it.genre), "ja"), img: it.image ? `${SITE_URL}/${thumbOf(it.image)}` : "", img_large: it.image ? `${SITE_URL}/${it.image}` : "", url: `${SITE_URL}/item/${it.id}`, hearts: heartsOf(it) });
  const week = WEEK.items.filter((it) => it.image);
  const d = nowJST.getUTCDate();
  // 紹介する新作の候補：画像があり、今月・来月発売。日付で順番に回す（同じ商品が続かないように）
  const pool = items.filter((it) => it.image && it.release >= thisMonth).sort((a, b) => (a.id < b.id ? -1 : 1));
  const dayNo = Math.floor(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), d) / 864e5);
  // ユーザーの希望：サンリオ・たまごっち・ディズニー・めじるし・チャーム系を主に紹介する
  // ユーザーの希望：たまごっち・サンリオ・ディズニー・ポケモン・めじるし・有名アニメ をメインに紹介する（この順に優先）
  const FAV_CATS = [
    /たまごっち|Tamagotchi/i,
    /サンリオ|ハローキティ|キティ|マイメロ|クロミ|シナモロール|ポムポムプリン|ポチャッコ|ハンギョドン|けろけろけろっぴ|キキ&ララ|キキララ|タキシードサム|ばつ丸|ぐでたま|Sanrio/i,
    /ディズニー|ミッキー|ミニー|ドナルド|プー|スティッチ|ピクサー|トイ・ストーリー|ラプンツェル|アナと雪|プリンセス|ツイステ|Disney/i,
    /ポケモン|ポケットモンスター|ピカチュウ|Pok[eé]mon/i,
    /めじるし/,
    /ちいかわ|ONE PIECE|ワンピース|鬼滅の刃|呪術廻戦|ドラえもん|ジブリ|トトロ|魔女の宅急便|千と千尋|名探偵コナン|クレヨンしんちゃん|SPY×FAMILY|スパイファミリー|推しの子|ドラゴンボール|NARUTO|ナルト|進撃の巨人|ハイキュー|セーラームーン|プリキュア|アンパンマン|ちびまる子|すみっコぐらし|リラックマ|僕のヒーローアカデミア|ヒロアカ|東京リベンジャーズ|チェンソーマン|葬送のフリーレン|ブルーロック|銀魂|カードキャプターさくら|おジャ魔女|星のカービィ|スーパーマリオ|マリオ|ガンダム|エヴァンゲリオン|ウルトラマン|仮面ライダー|ゴジラ|ハローキティ|ムーミン|ミッフィー|スヌーピー|ピーナッツ|サンエックス/i,
  ];
  const txt = (it) => [it.name, it.name_en, it.title, (it.lineup_names || []).join(" ")].join(" ");
  const favRank = (it) => { const i = FAV_CATS.findIndex((r) => r.test(txt(it))); return i === -1 ? 9 : i; };
  const isFav = (it) => favRank(it) < 9;
  // 種類ごとに順番に回す（めじるしばかりにならないように）
  const recent = items.filter((it) => it.image && it.release >= new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth() - 1, 1)).toISOString().slice(0, 7) && isFav(it)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const buckets = FAV_CATS.map((re, i) => recent.filter((it) => favRank(it) === i)).filter((b) => b.length);
  const picks = [];
  if (buckets.length) for (let k = 0; picks.length < 4 && k < 20; k++) {
    const slot = dayNo * 2 + k, b = buckets[slot % buckets.length], it = b[Math.floor(slot / buckets.length) % b.length];
    if (!picks.includes(it)) picks.push(it);
  }
  if (picks.length < 4) for (let k = 0; picks.length < 4 && k < pool.length; k++) { const it = pool[(dayNo * 2 + k) % pool.length]; if (!picks.includes(it)) picks.push(it); }
  const favIds = items.filter(isFav).map((it) => it.id);
  write("data/x.json", JSON.stringify({ generated: new Date().toISOString(), today: today, week: { label: WEEK.label, from: WEEK.range.split("〜")[0], to: WEEK.range.split("〜")[1], count: week.length, items: week.slice(0, 12).map(pack) }, picks: picks.map(pack), lottery_today: (() => { const nowIso = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16); return LOTTERY.filter((x) => x.added === today && x.end > nowIso).sort((a, b) => (a.end > b.end ? 1 : -1)).map((x) => ({ title: x.title, store: x.store, pref: x.pref || "", kind: x.kind, start: x.start, end: x.end, method: x.method || "", url: x.url || "" })); })(), morning: (() => {
    // 朝の「ジャンルまとめ」：毎日1ジャンルを4つまとめて紹介。たまごっち・サンリオ・ディズニー・ポケモン・めじるし・人気アニメを中心に、ときどきほかのジャンルも
    const MAIN = [["たまごっち", "#たまごっち", (it) => favRank(it) === 0], ["サンリオ", "#サンリオ", (it) => favRank(it) === 1], ["ディズニー", "#ディズニー", (it) => favRank(it) === 2], ["ポケモン", "#ポケモン", (it) => favRank(it) === 3], ["めじるしアクセサリー", "#めじるしアクセサリー", (it) => favRank(it) === 4], ["人気アニメ", "#アニメ", (it) => favRank(it) === 5]];
    const OTHER = ["animal", "food", "miniature", "accessory", "funny", "retro", "oshi", "game"].map((g) => { const gg = genreOf(g); return [genreLabel(gg, "ja"), "", (it) => (it._genres || []).includes(g) && !isFav(it)]; });
    const day = Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), nowJST.getUTCDate()), dn = Math.round(day / 864e5);
    const from = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth() - 2, 1)).toISOString().slice(0, 7);
    const used = new Set(picks.map((it) => it.id));
    const poolOf = (f) => items.filter((it) => it.image && it.release >= from && f(it) && !used.has(it.id)).sort((a, b) => (b.release > a.release ? 1 : b.release < a.release ? -1 : a.id < b.id ? -1 : 1));
    // 7日で1周：メイン6ジャンル＋ほかのジャンル1つ（ほかのジャンルは週ごとに入れかえ）
    const cycle = MAIN.concat([OTHER[Math.floor(dn / 7) % OTHER.length]]);
    let pick = null, k = 0;
    for (let t = 0; t < cycle.length && !pick; t++) { const c = cycle[(dn + t) % cycle.length]; const pl = poolOf(c[2]); if (pl.length >= 3) { pick = c; k = pl; } }
    if (!pick) return { active: false };
    const round = Math.floor(dn / cycle.length), n = 4, start = (round * n) % Math.max(1, k.length);
    const four = [...k.slice(start), ...k.slice(0, start)].slice(0, n);
    return { active: true, monday: new Date(day).getUTCDay() === 1, category: pick[0], tag: pick[1], count: k.length, items: four.map(pack) };
  })(), new_info: (() => { const y = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), nowJST.getUTCDate() - 1)).toISOString().slice(0, 10); const rk = favRank; const list = items.filter((it) => it.added === y && it.image && it.release >= thisMonth).map((it, i) => [it, i]).sort((a, b) => rk(a[0]) - rk(b[0]) || a[1] - b[1]).map((x) => x[0]); return { added: y, count: list.length, fav_count: list.filter(isFav).length, items: list.slice(0, 8).map((it) => ({ ...pack(it), fav: isFav(it) })) }; })(), next_week: (() => { const nw = NEXT_WEEK.items.filter((it) => it.image); const rk = favRank; const list = nw.map((it, i) => [it, i]).sort((a, b) => rk(a[0]) - rk(b[0]) || a[1] - b[1]).map((x) => x[0]); return { label: NEXT_WEEK.label, from: NEXT_WEEK.range.split("〜")[0], to: NEXT_WEEK.range.split("〜")[1], count: NEXT_WEEK.items.length, items: list.slice(0, 16).map((it) => ({ ...pack(it), fav: isFav(it) })) }; })(), en: (() => {
    // 英語版X（海外向け）用：英語名のある商品だけ。日本語版とは別の順番で回す
    const packEn = (it) => ({ id: it.id, name: it.name_en, price: it.price, lineup: it.lineup || 0, release: (() => { const w = weekStartOf(it); return w ? `week of ${MONTH_EN[w.getUTCMonth()]} ${w.getUTCDate()}` : (([y, m]) => `${MONTH_EN[+m - 1]} ${y}`)(it.release.split("-")); })(), maker: it.maker === "バンダイ" ? "Bandai" : it.maker === "タカラトミーアーツ" ? "Takara Tomy A.R.T.S" : it.maker === "キタンクラブ" ? "Kitan Club" : it.maker === "クオリア" ? "Qualia" : it.maker, img_large: absImg(it).replace("/thumb/", "/"), url: `${SITE_URL}/en/item/${it.id}` });
    const CATS = [["Tamagotchi", "#Tamagotchi", 0, "chara/tamagotchi"], ["Sanrio", "#Sanrio", 1, "chara/sanrio"], ["Disney", "#Disney", 2, "chara/disney"], ["Pokémon", "#Pokemon", 3, "chara/pokemon"], ["Mejirushi charms", "#kawaii", 4, "chara/mejirushi"], ["Anime", "#anime", 5, "chara"]];
    const day = Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), nowJST.getUTCDate()), dn = Math.round(day / 864e5) + 3;
    const from = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth() - 2, 1)).toISOString().slice(0, 7);
    const ok = (it) => it.image && it.name_en && it.release >= from;
    let daily = { active: false };
    for (let t = 0; t < CATS.length; t++) {
      const c = CATS[(dn + t) % CATS.length];
      const pl = items.filter((it) => ok(it) && favRank(it) === c[2]).sort((a, b) => (b.release > a.release ? 1 : b.release < a.release ? -1 : a.id < b.id ? -1 : 1));
      if (pl.length < 3) continue;
      const start = (Math.floor(dn / CATS.length) * 4) % pl.length;
      daily = { active: true, category: c[0], tag: c[1], url: `${SITE_URL}/en/${c[3]}`, count: pl.length, items: [...pl.slice(start), ...pl.slice(0, start)].slice(0, 4).map(packEn) };
      break;
    }
    const wk = WEEK.items.filter((it) => it.image && it.name_en).map((it, i) => [it, i]).sort((a, b) => favRank(a[0]) - favRank(b[0]) || a[1] - b[1]).map((x) => x[0]);
    return { daily, week: { range: WEEK.range, count: WEEK.items.length, url: `${SITE_URL}/en/week`, items: wk.slice(0, 4).map(packEn) } };
  })(), fav_ids: favIds, site: SITE_URL }));
}
write("_headers", `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/images/*\n  Cache-Control: public, max-age=604800\n  Access-Control-Allow-Origin: *\n/data/*\n  Cache-Control: public, max-age=300\n  Access-Control-Allow-Origin: *\n`);

const noEn = items.filter((it) => !it.name_en).length;
if (noEn) warnings.push(`英語名（name_en）がまだない商品が${noEn}件あります（英語ページでは日本語名を表示）`);

/* ---------- 結果 ---------- */
console.log(`✔ ${items.length}商品・${validStores.length}店舗から 日本語${pages.filter((p) => p[0] === "ja").length}・英語${pages.filter((p) => p[0] === "en").length}ページを ${path.relative(ROOT, OUT)}/ に書き出しました`);
if (warnings.length) { console.log(`⚠ 注意 ${warnings.length}件:`); warnings.forEach((w) => console.log("  - " + w)); }
