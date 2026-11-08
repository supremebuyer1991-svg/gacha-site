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
const LANGS = ["ja", "en", "zh-cn", "zh-tw", "ko"];
// 言語ごとの情報（hreflang・htmlのlang・OGP・切り替えメニューの表示名）
const LANG_META = {
  ja: { hreflang: "ja", html: "ja", og: "ja_JP", label: "日本語" },
  en: { hreflang: "en", html: "en", og: "en_US", label: "English" },
  "zh-cn": { hreflang: "zh-Hans", html: "zh-CN", og: "zh_CN", label: "简体中文" },
  "zh-tw": { hreflang: "zh-Hant", extra: ["zh-HK"], html: "zh-TW", og: "zh_TW", label: "繁體中文" }, // 台湾・香港の両方に1ページで
  ko: { hreflang: "ko", html: "ko", og: "ko_KR", label: "한국어" },
};
const XL = ["zh-cn", "zh-tw", "ko"]; // 英語をもとに訳した言語（文言がないところは英語で出す）

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
// 英語の週の範囲：「11/2〜11/8」→「Nov 2–8」、「10/30〜11/5」→「Oct 30–Nov 5」（形が違うときはそのまま）
const enRange = (r) => {
  const m = String(r || "").match(/^(\d{1,2})\/(\d{1,2})\s*[〜~–-]\s*(\d{1,2})\/(\d{1,2})$/);
  if (!m) return r;
  const [, m1, d1, m2, d2] = m.map(Number);
  return m1 === m2 ? `${MONTH_EN[m1 - 1]} ${d1}–${d2}` : `${MONTH_EN[m1 - 1]} ${d1}–${MONTH_EN[m2 - 1]} ${d2}`;
};

// 一覧ページの説明文の後半（今月の新作の数・最新の2つの名前）。list は新しい順に並んだ商品
const leadTail = (list = []) => { const m = list.filter((it) => it.release === thisMonth).length, top = list.slice(0, 2).map((it) => `「${it.name}」`).join(""); return `${m ? `今月の新作${m}件。` : ""}${top ? `最新は${top}など。` : ""}発売日・値段・全何種か・在庫店をまとめています。`; };
const leadTailEn = (list = []) => { const m = list.filter((it) => it.release === thisMonth).length, top = list.slice(0, 2).map((it) => `"${it.name_en || it.name}"`).join(", "); return `${m ? ` ${m} out this month.` : ""}${top ? ` Latest: ${top}.` : ""} Release dates, prices, number of designs and the shops in Japan that have them.`; };

/* ---------- 画面の言葉（日本語・英語） ---------- */
const T = {
  ja: {
    htmlLang: "ja", ogLocale: "ja_JP", switchLabel: "EN", switchAria: "English version",
    tagline: site.tagline, description: site.description,
    sampleBar: "ただいまサンプルデータを表示しています。商品・店舗・在庫はすべて架空です。",
    navShort: { calendar: "カレンダー", map: "マップ", toprated: "高評価店", faq: "Q&A" },
    nav: { map: "ガチャマップ", katsu: "ガチャ活", week: "今週発売", lottery: "抽選情報", toprated: "評価の高いお店", new: "新着", ranking: "人気", calendar: "発売カレンダー", genre: "種類", faq: "よくある質問" },
    navAria: "メインメニュー", footAria: "サイト情報", about: "運営者情報・お問い合わせ",
    disclosure: "Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。また、楽天アフィリエイトなどの広告プログラムにも参加しています。掲載商品の画像・名称の権利は各メーカーに帰属します。",
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
    newTitle: "新着ガチャ", toCalendar: "発売カレンダーを見る", rankTitle: "人気ランキング", genreTitle: "ジャンルから探す", typeTitle: "種類から探す", typePage: (g, ym = YM_NOW) => `${g}のガチャガチャ新作・発売日一覧${ym ? `【${ym}】` : ""}`, typeLead: (g, n, list) => `${g}のガチャ${n}シリーズを新しい順に掲載しています。${leadTail(list)}`,
    maker: "メーカー", release: "発売月", genre: "ジャンル", tags: "タグ",
    findStores: "近くの在庫店を探す", official: "公式サイトで見る",
    storesTitle: "近くの在庫店", geoBtn: "現在地から探す", or: "または", prefAria: "都道府県で絞り込む", loading: "読み込み中…",
    stockLoading: "在庫情報を読み込んでいます…", stockNone: "この商品の在庫情報はまだありません。",
    stockFine: "取扱店の情報はバンダイ公式「ガシャポンどこ？」をもとにしています（通信機能のあるマシンを置いている店舗のみ）。実際の在庫と異なる場合があります。営業時間はご来店前に各店舗でご確認ください。現在地は距離の計算だけに使い、どこにも送信しません。",
    officialStores: "公式の店舗検索でも確かめる",
    buyTitle: "店舗で売り切れ？ネットで全種コンプ！", buyLead: "回しても揃わない、近くに置いていない。そんなときは通販のコンプリートセットを。",
    buyAria: "ネット通販", amazon: "Amazonで探す", rakuten: "楽天市場で探す",
    fleaTitle: "単品で欲しいならフリマ・オークション", fleaLead: "「あのキャラだけ欲しい」「1つだけ安く」ならこちら。", mercari: "メルカリで探す", yahoo: "ヤフオクで探す", rakuma: "ラクマで探す",
    // 発売の状態で変える通販の見出し（発売前・発売から2か月以上）と、海外向けの代理購入の案内
    buyTitleUp: "発売前でも通販で予約できることがあります", buyLeadUp: "発売日より前に、通販でコンプリートセットの予約を受け付けていることがあります。", fleaTitleOld: "コンプセットは売り切れがち。単品はフリマで", fleaLeadOld: "発売から時間がたったガチャは、通販のコンプセットが売り切れていることも。欲しいものが決まっているなら、フリマで単品を探すのが早いです。",
    compCompare: "通販のコンプセットと比べる",
    // 商品ページ：同じ週に発売のガチャの見出し、価格の下の通販チップの見出し、下のバー（発売前・発売から時間がたったもの）の文言
    sameWeek: { h: "同じ週に発売のガチャ", chips: "通販で探す・全種セット", notify: "🔔発売日に通知", rakUp: "楽天で予約を探す", rak: "楽天", comp: (n, d, y) => `全${n}種そろえる目安：<b>約${d}回${y ? `・約${y}円` : ""}</b>` },
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
    // <title> だけ：先頭の【…】は外して、意味のあるもの（再販・限定・箱売）は短い補足にする。長い商品名は短い後ろ書きにする（H1 は商品名のまま）
    itemTitle: (n) => {
      const m = n.match(/^【([^】]*)】\s*/), pre = m ? m[1] : "", base = (m ? n.slice(m[0].length) : n).trim();
      const sfx = /オフィシャルショップ限定/.test(pre) ? (/再販/.test(pre) ? "オフィシャルショップ限定再販" : "オフィシャルショップ限定") : /再販/.test(pre) ? "再販" : /箱売/.test(pre) ? "箱売" : "";
      const short = base.length > 24;
      const paren = [sfx, short || /ガチャ|ガシャ/.test(base) ? "" : "ガチャ"].filter(Boolean).join("・");
      return `${base}${paren ? `（${paren}）` : ""}${short ? "｜ガチャ 発売日・在庫店" : "｜発売日・値段・どこで売ってる？"}`;
    },
    itemDesc: (it, n, mk, mo) => `${n}（${mk}）は${mo}発売${it.price ? `、1回${it.price}円` : ""}${it.lineup ? `・全${it.lineup}種` : ""}のガチャガチャ。${it.description ? it.description + " " : ""}近くの在庫店や通販での入手方法もまとめています。`,
    genrePage: (g, ym = YM_NOW) => `${g}のガチャガチャ新作・発売日一覧${ym ? `【${ym}】` : ""}`, genreLead: (g, n, list) => `${g}ジャンルの新作・発売予定ガチャ${n}シリーズを新しい順に掲載しています。${leadTail(list)}`,
    makerPage: (m, ym = YM_NOW) => `${m}の${m === "バンダイ" ? "ガシャポン" : "ガチャガチャ"}新作・発売日一覧${ym ? `【${ym}】` : ""}`, makerLead: (m, n, list) => `${m}のガチャ${n}シリーズを新しい順に掲載しています。${leadTail(list)}`,
    empty: "まだ掲載している商品はありません。",
    calTitle: "ガチャガチャ発売カレンダー", calH1: "発売カレンダー", calLead: "公式に発表されている先の月まで、発売週ごとに並べています。「第◯週」はその週から順次発売という意味で、お店や地域によって前後します。",
    calDesc: "新作ガチャガチャの発売予定を月ごとに一覧できるカレンダー。価格・種類数・メーカーもまとめて確認できます。",
    calPast: "過去の発売", calMonthTitle: (y, m) => `${y}年${m}月発売のガチャガチャ`,
    thisMonth: "今月", calMonth: (y, m, n) => `${y}年${m}月<br>${n}シリーズ`,
    faqTitle: "よくある質問", faqPageTitle: "ガチャガチャのよくある質問｜回し方・両替・再販・コンプセットの買い方", faqLead: "ガチャガチャの回し方・両替・再販の調べ方、在庫情報の見方や通販での購入についてまとめました。",
    faqDesc: "ガチャガチャは何円玉で回せる？両替はどこで？電子マネーは使える？再販はいつ？コンプリートセットはどこで買う？など、ガチャガチャのよくある質問への回答です。",
    faqs: [
      ["在庫情報はどのくらい正確ですか？", "各店舗の情報を定期的に集めて表示しています。更新の間に売り切れたり補充されたりすることがあるため、表示と実際が異なる場合があります。商品ページに「○時時点の情報」と表示しているので目安にしてください。"],
      ["現在地を使うと、位置情報はどこかに送られますか？", "送られません。現在地はお使いの端末の中で店舗までの距離を計算するためだけに使い、当サイトのサーバーを含めどこにも保存・送信しません。"],
      ["近くに在庫がないときはどうすればいいですか？", "商品ページの下にあるAmazon・楽天市場のボタンから、コンプリートセットや単品を探せます。発売から日が浅い商品は、数日後に店舗へ再入荷することもあります。"],
      ["発売日がメーカーの発表と違うことはありますか？", "当サイトはメーカーの発表をもとに、発売週ごとに掲載しています。実際の店頭に並ぶ時期は地域や店舗によって前後します。"],
      ["「11月第2週発売」は何日から売られますか？", "当サイトでは、その月の最初の月曜日から始まる週を「第1週」として数えています（例：2026年11月の第1週は11/2〜11/8、第2週は11/9〜11/15）。メーカーの「第◯週」は、その週から順次お店に並ぶという意味で、決まった発売日はありません。早いお店で週の初め、遅いお店では翌週になることもあります。"],
      ["先の月の新作はいつごろわかりますか？", "バンダイ・タカラトミーアーツは、おおむね1〜2か月前に発売予定を公式サイトで発表します。当サイトは1日3回公式の発表を確かめ、3か月先まで発売カレンダーに自動で追加しています。"],
      ["ガチャ診断はどうやって決まっていますか？", "選んだジャンル・テイスト・予算と、各商品に付けたタグを照らし合わせて、相性の高い順に表示しています。タグはAIで付けたものを含みます。"],
      ["ガチャガチャは何円玉で回せる？両替はどこで？", "多くのマシンは100円玉専用で、300円なら100円玉3枚を入れて回します。500円玉が使えるマシンや、お札の両替機を置いているガチャコーナーもありますが、お店によって違います。両替機がないときは、同じ施設のお店で買い物をしてお釣りを100円玉でもらうなど、あらかじめ100円玉を用意しておくと安心です。"],
      ["電子マネー・PayPayは使える？", "ふつうのマシンは硬貨だけのものがほとんどです。ガシャポンバンダイオフィシャルショップなど一部のお店には、交通系ICなどの電子マネーやコード決済に対応したマシンや両替機がありますが、使える支払い方法はお店ごとに違います。使いたい場合は、お店の案内やマシンの表示を確かめてください。"],
      ["スマホで回せる『ガシャポンオンライン』とは？", "バンダイが運営する、スマホやパソコンからガシャポンを回せる公式サービスです。オンラインで回した商品は後日まとめて自宅に届きます。取り扱うシリーズ・1回の値段・送料などはサービスの公式サイトで確認してください。"],
      ["再販はいつ来る？どう調べる？", "再販（再生産・復刻）は、人気のシリーズがメーカーの発売予定にあらためて載ることで決まり、時期は決まっていません。当サイトでは、メーカーの発表に出た再販・復刻のガチャを[再販・復刻のガチャ一覧](saihan.html)にまとめています。気になるシリーズは、商品ページで前回の発売時期もあわせて確認できます。"],
      ["コンプリートセットはどこで買うのが安い？（Amazon・楽天・メルカリの違い）", "Amazon・楽天市場はショップが新品のコンプリートセットを販売していることが多く、発売前に予約できる場合もあります。メルカリなどのフリマは個人どうしの売り買いで、単品だけ買えたり安く見つかったりする一方、値段や状態は出品ごとにさまざまです。値段は時期や在庫で変わるので、送料込みの合計で比べるのがおすすめです。"],
      ["全種そろえるには平均何回回す？", "どの種類も同じ確率で出るとすると、全n種そろえるのに平均でおよそ n×(1＋1/2＋1/3＋…＋1/n) 回かかります（「コレクター問題」と呼ばれる考え方）。たとえば全5種なら約11回、全6種なら約15回です。実際は種類ごとに出る確率が違うこともあるので、確実にそろえたいならコンプリートセットを買う方法もあります。"],
      ["オフィシャルショップ限定とは？", "バンダイ直営のガシャポン専門店「ガシャポンバンダイオフィシャルショップ」でしか回せないシリーズのことです。人気シリーズの限定再販もあり、ふつうのガシャポン設置店には置かれません。当サイトでは[オフィシャルショップ限定ガチャの一覧](limited.html)にまとめています。"],
      ["掲載内容の誤りを見つけたら？", "運営者情報ページのお問い合わせ先からお知らせください。確認のうえ修正します。"],
    ],
    aboutTitle: "運営者情報・お問い合わせ", aboutH1: "運営者情報", aboutDesc: `${site.name}の運営者情報、お問い合わせ先、広告・免責事項について。`,
    contactForm: "お問い合わせフォーム", contactX: (x) => `X（旧Twitter）の <b>@${x}</b> までDMでご連絡ください。`, contactNone: "お問い合わせ窓口は準備中です。",
    aboutSections: (s) => [
      ["このサイトについて", `${s.name}は、ガチャガチャ好きのためのカプセルトイ情報サイトです。新作の発売日・価格・ラインナップと、近くの在庫店をひとつの場所で確かめられることを目指しています。`],
      ["データの集め方", "新作の発売日・価格・ラインナップは、メーカー公式サイト（バンダイ・タカラトミーアーツなど）で発表された情報を毎日自動で取得しています。取扱店はバンダイのガシャポン公式の店舗検索（ガシャポンどこ？）をもとにしており、ガチャマップの在庫報告は利用者の皆さんからの投稿です。"],
      ["更新頻度", "新作・発売予定・取扱店の情報は毎日更新しています。人気ランキングも毎日集計し直しています。"],
      ["編集方針", "メーカーの紹介文などの文章は転載せず、発売日・価格・種類数などの事実をもとに当サイトで書いています。ジャンル・テイストのタグ付けには、AIを補助的に使っています。誤りを見つけた場合は確認のうえ修正します。"],
      ["運営", `${s.operator}が運営しています。2026年10月開設。最新情報はX（旧Twitter）[@gachapla](https://x.com/gachapla)で発信しています。`],
      ["お問い合わせ", null],
      ["広告について", "Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。また、楽天アフィリエイト、バリューコマース（Yahoo!ショッピング）、メルカリアンバサダーなどのアフィリエイトプログラムに参加しています。商品ページの「PR」表示があるボタンは広告リンクです。広告の有無や報酬は、一覧やランキングの並び順には影響しません。"],
      ["免責事項", "掲載している発売日・価格・在庫などの情報は、正確さに努めていますが内容を保証するものではありません。最新の情報は各メーカー・各店舗でご確認ください。当サイトの情報を利用して生じた損害について、運営者は責任を負いかねます。"],
      ["著作権について", "掲載商品の画像・名称・キャラクターの権利は、各メーカーおよび権利者に帰属します。掲載に問題がある場合はお問い合わせください。速やかに対応します。"],
      ["位置情報の扱い", "「現在地から探す」で取得した位置情報は、お使いの端末の中で店舗までの距離を計算するためだけに使い、保存・送信はしません。"],
    ],
  },
  en: {
    htmlLang: "en", ogLocale: "en_US", switchLabel: "日本語", switchAria: "日本語版",
    tagline: site.tagline_en, description: site.description_en,
    sampleBar: "Showing sample data. All items, stores and stock levels are fictional.",
    navShort: { map: "Map", katsu: "Route", toprated: "Top shops", lottery: "Lottery", ranking: "Popular", station: "Shops" },
    nav: { map: "Gacha map", station: "Gacha shops", katsu: "Gacha route", week: "This week", lottery: "Lotteries", toprated: "Top shops", new: "New", ranking: "Popular", calendar: "Calendar", genre: "Types", faq: "FAQ" },
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
    buyTitleUp: "Not out yet? Pre-orders are sometimes available online", buyLeadUp: "Japanese online stores sometimes take pre-orders for the complete set before the release date.", fleaTitleOld: "Full sets sell out over time. Try resale apps for single pieces", fleaLeadOld: "For older gacha, the complete set is often sold out online. If you know which design you want, Japanese resale apps are the quickest place to look.",
    fleaProxy: "Japanese resale apps (Mercari, Yahoo! Auctions, Rakuma) need a Japanese address, so from abroad use a proxy-buying service such as Buyee or ZenMarket, or the shop buttons above.",
    compCompare: "Compare with full sets online",
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
    // 検索では「gacha」はスマホゲームの意味に取られやすいので、タイトルは英語圏の呼び名「gachapon」を使う（本文は gacha のまま）
    itemTitle: (n) => `${n} – Gachapon: price, release date & shops in Japan`, // 後ろに「 | GACHA PLANET」が自動で付く
    // ページの中の細かい文言（中国語・韓国語はここを訳す）
    x: {
      idxTitle: "Gachapon (Japanese capsule toys): new releases, prices & shops near you | GACHA PLANET",
      kbTitle: "NEW｜Gacha route planner",
      kbText: "Find capsule-toy shops near you and get the most efficient route — by number of shops, time limit, or stops on the way.",
      kbGo: "Plan a route →",
      weekH: "Releasing this week", weekMore: (range, n) => `${range} · all ${n}`, thisWeek: "This week", seeAll: "See all",
      weekOf: (month, from) => `${month} (week of ${from})`,
      relNow: "This week", relFrom: (m, d) => `From ${m}/${d}`, relOut: "Out now",
      popSeries: "Popular series", allChara: "All characters →", moreSeries: "More from this series", charaChip: (L) => `${L} gacha`,
      listMore: (max, n, href) => `Showing the latest ${max} of ${n}. Older ones are in the <a href="${href}">release calendar</a>.`,
      charaTitle: (L, ym) => `${L} gacha (capsule toys) in Japan – new releases & where to buy`,
      charaLead: (L, n) => `${n} ${L} capsule toy series, newest first, with release dates, prices and where to buy.`,
      charaIdxTitle: "Gacha by character & series",
      charaIdxLead: (n) => `Looking for a favorite character? Browse capsule toys sold in Japan by character or series – ${n} lists.`,
      // range は「11/2〜11/8」の形で来る（英語は enRange で「Nov 2–8」に）。names は人気の上位（中国語・韓国語の訳では使わなくてよい）
      weekTitle: (range, n) => `New gacha releasing this week (${enRange(range)}) – ${n} series`,
      weekLead: (n, range, names = []) => `${n} capsule toy series releasing in Japan this week${range ? ` (${enRange(range)})` : ""}, most popular first.${names.length ? ` Including ${names.join(", ")}.` : ""}`,
      nextTitle: (range, n) => `Gacha releasing next week (${enRange(range)}) – ${n} series`,
      nextLead: (n, range, names = []) => `${n} capsule toy series releasing in Japan next week${range ? ` (${enRange(range)})` : ""}.${names.length ? ` Including ${names.join(", ")}.` : ""}`,
      newPageTitle: "Latest gacha (capsule toys) added",
      newPageLead: "The latest Japanese capsule toys added to the site, newest first, with release month, price and number of designs.",
    },
    // 駅のまわりのガチャのお店（/station/）。中国語・韓国語は src/i18n/<lang>.js の stn
    stn: {
      footer: "By station", crumb: "Shops by station",
      idxTitle: "Gacha shops near major stations in Japan",
      idxLead: (n) => `Capsule toy (gacha) shops near ${n} major stations and airports in Japan, from Bandai's official shop list. Pick a station to see the shops within walking distance.`,
      regions: { kanto: "Tokyo area", kansai: "Osaka, Kyoto & Kobe", chubu: "Nagoya", kyushu: "Fukuoka & Okinawa", north: "Hokkaido & Tohoku", chugoku: "Hiroshima", airport: "Airports" },
      h1: (name) => `Gacha shops near ${name}`,
      title: (name) => `Gachapon (gashapon) shops near ${name}`,
      desc: (name, n, km, near) => `${n} official Bandai gacha (capsule toy) shops within ${km} km of ${name}. The closest is ${near}. Walking times, addresses and Google Maps links.`,
      lead: (name, n, km, near, w) => `There are ${n} official Bandai gacha (capsule toy) shops within ${km} km of ${name}. The closest is “${near}”, about ${w} min on foot.`,
      // いちばん近いお店の取扱が少ないとき：取扱がいちばん多いお店を先に
      // 外国語：取扱がいちばん多いお店を先に（チェーン名で。チェーンでないお店は名前を出さない）
      descBest: (name, n, km, label, k) => `${n} official Bandai gacha (capsule toy) shops within ${km} km of ${name}. ${label ? `The best-stocked is ${label}` : "The best-stocked shop has"} with ${k} official series. Walking times, addresses and Google Maps links.`,
      leadBest: (name, n, km, label, k, w) => `There are ${n} official Bandai gacha (capsule toy) shops within ${km} km of ${name}, listed by selection size. ${label ? `The best-stocked is ${label}` : "The best-stocked shop has"} with ${k} official series, about ${w} min on foot.`,
      flagship: "Biggest selection", heroBtn: "Find gacha shops by station",
      leadTop: (name, n, km, top, k, w, near, wn) => `There are ${n} official Bandai gacha (capsule toy) shops within ${km} km of ${name}. The best-stocked is “${top}” with ${k} official series, about ${w} min on foot; the closest is “${near}” (${wn} min).`,
      shopsH: "Gacha shops nearby", walk: (m, d) => `${m} min walk (${d})`, titles: (n) => `${n} official series`,
      gmaps: "Open in Google Maps", mapGo: "See on the map",
      weekH: "Releasing this week at shops nearby", weekAllH: "Releasing this week",
      routeH: "Visiting several shops?", routeText: "Our gacha route planner puts nearby shops in the most efficient order. The page is in Japanese, but you can just type a station name or use your location.", routeGo: "Plan a gacha route →",
      tipsH: "Tips for gacha in Japan",
      tips: [
        "Most machines take ¥100 coins only, so keep some coins ready.",
        "Gacha shops usually have a change machine that turns ¥1,000 bills into ¥100 coins.",
        "Gacha is not tax-free: you buy from an unattended machine one play at a time, so there is no tax-free procedure.",
        "Some newer machines accept IC cards like Suica, but credit cards generally can't be used.",
      ],
      otherH: "Other stations in this area", nShops: (n) => `${n} shops`,
      note: "Shop list from Bandai's official shop finder (Gashapon doko?). Distances are straight-line; walking time is estimated at 80 m per minute. Please check opening hours before you go.",
      homeH: "Find gacha shops by station", allStations: "All stations →",
      // 有名なガチャ専門店（data/landmarks.json）・地図・よくある質問
      titleN: (name, n, y) => `${n} Gachapon Shop${n === 1 ? "" : "s"} near ${name} (${y}: map & walking times)`,
      descN: (name, n, lm) => `${n} gachapon (capsule toy) shops near ${name}${lm ? `, including ${lm}` : ""}. Walking times, opening hours, machine counts, a map and Google Maps links.`,
      lmH: "Must-visit gacha shops", lmLead: (lm, k, w) => `The biggest gacha shop here is ${lm}${k ? ` with about ${k.toLocaleString("en-US")} machines` : ""}${w ? `, about ${w} min on foot` : ""}.`,
      lmNote: (d) => `Machine counts and hours are from the shops' official sites or major travel media (checked ${d}). They can change, so check before you go.`,
      machines: (k) => `approx. ${k.toLocaleString("en-US")} machines`, hours: (h) => `Open ${h}`,
      cashY: "Cashless payment OK", cashN: "Coins only – bring ¥100 coins", inTerminal: "Inside the terminal",
      closing: (d) => { const [y, m, dd] = d.split("-").map(Number); return `Closing: last day ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${dd}, ${y}`; },
      shopsMoreH: "More gacha shops nearby", mapAria: (name) => `Map of gacha shops near ${name}`,
      faqH: "FAQ", shopGeneric: "a shop", listSep: "; ",
      qBig: (name) => `Which is the biggest gacha shop near ${name}?`,
      aBig: (lm, k, floor, w) => `${lm}, with about ${k.toLocaleString("en-US")} capsule toy machines${floor ? ` (${floor})` : ""}${w ? `, about ${w} min on foot` : ""}.`,
      aBigNoN: (lm, floor) => `${lm}${floor ? ` (${floor})` : ""} is the best-known gacha shop here.`,
      aBigK: (lm, k, w) => `By Bandai's official stock data, ${lm} has the most series (${k}), about ${w} min on foot.`,
      qHours: (name) => `What time do gacha shops near ${name} open?`, aHours: (s) => `${s}. Hours can change on holidays, so check before you go.`, hoursPair: (lm, h) => `${lm}: ${h}`,
      qNear: (name) => `How far is the nearest gacha shop from ${name}?`, aNear: (lm, w, d) => `The closest is ${lm}, about ${w} min on foot (${d}).`,
    },
    // 週ごとのページ・シリーズ・再販などの一覧ページ（src/hubs.js）。中国語・韓国語は i18n の hub で上書き
    hub: {
      sep: ", ", count: (k) => ` (${k})`,
      weekLabel: (m, no) => `${MONTH_EN[m - 1]} week ${no}`, weekShort: (no) => `Week ${no}`,
      weekTitle: (lab, range, n) => `Gacha releasing ${lab} (${enRange(range)}): ${n} new series – dates & prices`,
      weekH1: (lab, range) => `${lab} (${enRange(range)}) gacha releases`, weekSub: (n) => `${n} series`,
      weekLead: (lab, range, n) => `${n} capsule toy series releasing in Japan in ${lab} (${enRange(range)}), most popular first. Shops may get them a few days earlier or later.`,
      including: (names) => `Including ${names.join(", ")}.`, weekNavAria: "Previous and next week", toMonth: (label) => `All of ${label}`,
      badgeNow: "This week", badgeNext: "Next week", badgePast: "Out now",
      perma: (lab, range) => `Page for ${lab} (${enRange(range)}) →`, weekIdx: "Pages by week", weekPage: "Week page →",
      // 英語の月のページは上の説明文に数があるので、多いキャラクターだけ（中国語・韓国語は説明文が英語なので数も書く）
      monthIntro: (label, n, future, tops) => (tops ? `Top characters & series this month: ${tops}.` : ""),
      hubH1: (L) => `${L} gacha`, hubSub: (n, month, future) => `${n} series · latest: ${month}${future ? " (upcoming)" : ""}`,
      more: (n) => `Show more (${n} more)`, pageTitle: (title, k) => `${title} (page ${k})`, pagesAria: "Pages",
      prevItem: "Previous", nextItem: "Next", seqH: (L) => `Previous & next in ${L}`, seqH0: "Previous & next in this series",
      // キャラクター・作品ページの補足（発売状況・最新作と次回作・値段・よくある質問）。rel は cxRel / t.month で作った発売時期
      cxRel: (lab, range) => `the week of ${range}`, cxWorks: (n) => `${n} release${n === 1 ? "" : "s"}`,
      cxSpec: (p, n) => `¥${p} per play${n ? `, ${n} designs` : ""}`,
      cxPrice: (a, b, mode) => (a === b ? `¥${a} per play for every series` : `¥${a}–¥${b} per play (most series are ¥${mode})`),
      cxPriceShort: (a, b) => (a === b ? `¥${a} per play` : `¥${a}–¥${b} per play`),
      cxStatusH: (L) => `${L} gacha: release status`,
      cxStatus: (out, up, re, price) => `${out} series out now, ${up} upcoming${re ? ` (including ${re} reissues)` : ""}. Prices: ${price}.`,
      // a はリンクのHTML、rel・spec はエスケープ済み
      cxLatestLine: (a, rel, spec) => `Latest: ${a} (${rel} · ${spec})`, cxNextLine: (a, rel, spec) => `Next: ${a} (${rel}, upcoming · ${spec})`, cxColH: "All releases by product line", cxFaqH: (L) => `${L} gacha FAQ`,
      cxQNext: (L) => `When is the next ${L} gacha coming out?`,
      cxANext: (name, rel, spec, more) => `“${name}” is scheduled for ${rel} (${spec}).${more ? ` ${more} more series have been announced.` : ""}`,
      cxANone: (name, rel) => `No new release has been announced yet. The latest is “${name}” (${rel}). We add new ones to this page as soon as they are announced.`,
      cxQLatest: (L) => `What is the latest ${L} gacha?`,
      cxALatest: (out, name, rel, spec, L, n, re) => `${out ? "The newest one out now" : "The latest"} is “${name}” (${rel}, ${spec}). ${n} ${L} gacha series have been released so far${re ? `, including ${re} reissues` : ""}.`,
      cxQPrice: (L) => `How much do ${L} gacha cost?`,
      cxAPrice: (price) => `${price.charAt(0).toUpperCase()}${price.slice(1)}. Each series page shows its price and number of designs.`,
      cxQWhere: (L) => `Where can I buy ${L} gacha in Japan?`,
      cxAWhere: (L, n, sts) => `According to Bandai's official shop data, ${n} shops in Japan carry ${L} gacha.${sts ? ` Stations with the most series nearby: ${sts}.` : ""} Each series page shows which shops have it in stock.`,
      cxAWhereNone: (L) => `${L} gacha are sold at capsule toy shops and gacha corners in shopping malls across Japan. Stock differs by shop, so check the shop list on each series page or browse shops by station.`,
      cxStn: (name, k) => `${name} (${k} series)`, cxStnSep: ", ",
      cxDesc: (L, n, latest, month, price, next, nextRel, range) => `${n} ${L} gacha series in Japan: release dates, prices & where to buy. Latest: “${latest}” (${month}, ¥${price})${next ? `; next: “${next}” in ${nextRel}` : ""}. ${range}.`,
      // ここから下は日本語・英語だけのページ（シリーズ・再販）
      colIdxTitle: "Gacha series by product line – every release, latest & upcoming", colIdxH1: "Gacha series",
      colIdxLead: (n) => `${n} long-running capsule toy lines (Mejirushi Accessory, Machiboke and more) that come back with new characters again and again. Every release in order, with the latest and upcoming ones.`,
      colTitle: (L, n) => `${L}: all ${n} releases – latest & release dates`, colH1: (L) => `${L} series`, colSub: (n, month) => `${n} releases · latest: ${month}`,
      colLead: (L, n, from, latest, up) => `Every ${L} capsule toy listed on this site since ${from} (${n} releases), newest first.${latest ? ` Latest: ${latest}.` : ""}${up ? ` ${up} upcoming.` : ""}`,
      upcomingH: "Upcoming releases", upcoming: "Upcoming", latest: "Latest", latestShort: "Latest: ", reissue: "Reissue", allH: (L) => `All ${L} releases (newest first)`, works: (n) => `${n} releases`,
      colLink: (L, n) => `All ${L} releases (${n}) →`, seriesFoot: "Series", reissueFoot: "Reissues",
      saihanTitle: (month) => `Gacha reissues in Japan (${month}) – re-released capsule toys`, saihanH1: "Gacha reissues",
      saihanLead: (n) => `${n} capsule toys coming back as reissues or re-releases, by month. Where we know it, we link to the original release.`,
    },
    itemDesc: (it, n, mk, mo) => `${n} by ${mk}: released ${mo}${it.price ? `, ¥${it.price} per play` : ""}${it.lineup ? `, ${it.lineup} designs` : ""}. ${it.description_en ? it.description_en + " " : ""}See which shops in Japan have it, or buy the full set online.`,
    genrePage: (g) => `${g} capsule toys in Japan – new releases`, genreLead: (g, n) => `${n} new and upcoming ${g.toLowerCase()} gacha in Japan, newest first. Tap one to see the price, release week and shops that have it.`,
    makerPage: (m) => `${m} capsule toys – new releases in Japan`, makerLead: (m, n, list) => `${n} gacha series by ${m}, newest first.${leadTailEn(list)}`,
    empty: "No items listed yet.",
    calTitle: "Japan gacha release calendar", calH1: "Gacha release calendar", calLead: "Every announced capsule toy in Japan, sorted by release week. Visiting soon? Check what comes out during your trip. Shops can get them a few days earlier or later.",
    calDesc: "Monthly calendar of new Japanese capsule toy (gacha) releases with prices, number of designs and makers.",
    calPast: "Past releases", calMonthTitle: (y, m) => `Gacha released in ${MONTH_EN[m - 1]} ${y}`,
    thisMonth: "This month", calMonth: (y, m, n) => `${MONTH_EN[m - 1]} ${y}<br>${n} series`,
    // 発売カレンダー（週ごとの見出し・月のページ）。中国語・韓国語は src/i18n/<lang>.js の cal
    cal: {
      week: (w) => `${MONTH_EN[w.m - 1]} week ${w.no}`, weekNo: (no) => `Week ${no}`, wShort: (no) => `W${no}`, monthShort: (mo) => MONTH_EN[mo - 1],
      now: "This week", out: "Out now", releases: " releases", series: (n) => `${n} series`, count: (n) => `${n}`,
      tba: "TBA", tbaDate: "Date TBA", tbaNote: "Release week not announced", tbaSub: "week",
      showAll: (n) => `Show all ${n}`, showLess: "Show less",
      jumpAria: "Jump to week", jumpBack: "Back to weeks", jumpBtn: "Weeks",
      monthsAria: "Monthly pages", byMonth: "Browse by month", calendar: "Calendar",
      span: (a, b) => `${a} – ${b}`,
      title: (span) => `Gachapon release calendar ${span}: new capsule toys by week`,
      desc: (span, wn, range, mn) => `New Japanese capsule toys (gachapon) by release week, ${span}. ${wn} series this week (${range}) and ${mn} this month, with prices, number of designs and makers.`,
      monthH1: (y, mo, n, future) => `${future ? "New gacha releasing in" : "Gacha released in"} ${MONTH_EN[mo - 1]} ${y} (${n} series)`,
      monthTitle: (y, mo, n, future) => `${future ? "New gachapon releasing in" : "Gachapon released in"} ${MONTH_EN[mo - 1]} ${y} (${n} series) – release dates & prices`,
      weeksTxt: (no, k) => `week ${no}: ${k}`, weeksSep: ", ",
      monthDesc: (y, mo, n, future, weeksTxt, top) => `${n} capsule toy series ${future ? "releasing" : "released"} in ${MONTH_EN[mo - 1]} ${y}, grouped by release week${weeksTxt ? ` (${weeksTxt})` : ""}. Including ${top.join(", ")}.`,
    },
    faqTitle: "Gachapon in Japan: FAQ (how to play, coins, where to find machines)", faqLead: "New to gacha? Here is how to play, where to find machines, and how to pay.",
    faqDesc: "How to play gacha in Japan, where to find capsule toy machines, coins and payment, and how to read release weeks and stock information.",
    faqs: [
      ["What is gacha (gashapon)?", "Gacha are capsule toy vending machines you can find all over Japan. You put in coins, turn the handle, and get one random toy from the series shown on the machine. You can't choose which one you get — that's part of the fun!"],
      ["How do I play?", "1) Check the price on the machine (usually ¥200–¥500). 2) Put in ¥100 coins. 3) Turn the handle clockwise until the capsule drops. 4) Open it and enjoy. Most shops have a box next to the machines for empty capsules."],
      ["Where can I find gacha machines?", "Almost everywhere: train stations, shopping malls, electronics stores, bookstores, airports and dedicated gacha shops with hundreds of machines. Big gacha shops are easy to find in areas like Akihabara and Ikebukuro in Tokyo, or Namba in Osaka. Use our map or the \"Show shops near me\" button on each toy's page."],
      ["What coins do I need? Can I use a credit card?", "Most machines take ¥100 coins only. Gacha shops usually have a change machine (it turns ¥1,000 bills into ¥100 coins). Some newer machines also accept IC cards like Suica or PASMO, but credit cards generally can't be used."],
      ["What does \"week 2 of November\" mean?", "Makers announce a release week, not an exact date. We count the week starting on the first Monday of the month as week 1 (in November 2026, week 1 is Nov 2–8 and week 2 is Nov 9–15). Shops add new toys during that week, so they may appear a few days earlier or later depending on the shop."],
      ["How accurate is the stock information?", "We collect it from shops regularly, but popular toys can sell out quickly. Please use it as a guide. Each toy's page shows when the information was last updated."],
      ["What if it's sold out everywhere?", "Shops often restock a few days after release. You can also look for the full set on Amazon Japan or Rakuten, or a single piece on Japanese resale apps, using the buttons on each toy's page."],
      // 答えの中の [文字](station/〇〇.html) はリンクになる（その駅のページがあるときだけ）
      ["Is gachapon tax-free?", "No. Gachapon machines are unattended vending machines: you pay one play at a time in ¥100 coins, and the price on the machine already includes tax. There is no tax-free procedure for them, even inside shops that offer tax-free shopping on other goods."],
      ["How much should I budget for gachapon?", "Most machines cost ¥300–¥500 per play (roughly US$2–3.5), so 10 plays come to about ¥4,000. Bring ¥1,000 bills: most gacha shops have a change machine that turns them into ¥100 coins."],
      ["Where are the best areas for gachapon shops?", "In Tokyo: [Akihabara](station/akihabara.html) (the biggest concentration, with multi-floor gacha shops), [Ikebukuro](station/ikebukuro.html) around Sunshine City, and [Shibuya](station/shibuya.html). In Osaka: [Namba](station/namba.html) and [Shinsaibashi](station/shinsaibashi.html). In Kyoto: the Shijo-Kawaramachi shopping area and around [Kyoto Station](station/kyoto.html). Each station page lists the shops nearby with walking times."],
      ["How can I buy gachapon from outside Japan?", "Most Japanese online shops don't ship overseas, but you have options: search eBay or Amazon.com for the series name plus “gashapon” (many sellers list complete sets), or use a proxy shopping service such as Buyee to buy from Mercari Japan and other Japanese sites. Each toy's page on this site has buttons for these. Proxy fees and international shipping are added on top of the price."],
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

// 使いやすさの改善で足した文言（X のフォロー・マイリスト・商品ページの下のバーなど）。中国語・韓国語は i18n の t.u で訳す
T.ja.u = {
  followTxt: "毎週の新作・入荷速報をXで配信中", followCta: (a) => `@${a} をフォロー`,
  homeH1: (ym) => `ガチャガチャ新作・発売日一覧【${ym.y}年${ym.m}月】`,
  addedLine: (d, w) => `今日追加 ${d}件・今週追加 ${w}件`,
  save: "保存", saved: "保存済み", saveAria: "マイリストに保存", unsaveAria: "マイリストから外す",
  mylist: "マイリスト", mylistTitle: "マイリスト（保存したガチャ）", mylistLead: "★で保存したガチャを、発売の状態ごとにまとめています。保存はこのブラウザの中だけで、ログインはいりません。",
  mlNow: "今週発売", mlSoon: "来週以降", mlOut: "発売中", mlEmpty: "まだ保存したガチャはありません。商品の★を押すと、ここに集まります。", mlBrowse: "今週発売のガチャを見る",
  stockShort: "在庫店", mercari: "メルカリ", whereBtn: "ガシャポンどこ？で探す（公式）", findLater: "このサイトの在庫店リスト",
  relOut: "発売中", relSoon: (m) => `${m}月発売予定`,
  monthsH: "月別の発売カレンダー", thisM: "今月", nextM: "来月", prevM: "先月",
  makersH: "メーカーから探す", prefsLink: "都道府県からガチャガチャ設置店を探す",
  optional: "答えなくてもOK", skipQ: "スキップ", priceTba: "価格未定",
  charaHit: "{l}のガチャ一覧（{n}）→",
  push: { on: "発売日にお知らせを受け取る", off: "お知らせをやめる", lead: "★で保存したガチャが発売される週の月曜の朝に、通知でお知らせします（会員登録はいりません）。", onNow: "お知らせ受け取り中：★のガチャが発売される週にお知らせします。", done: "お知らせをオンにしました。", offDone: "お知らせをやめました。", denied: "通知がブロックされています。ブラウザの設定で、このサイトの通知を許可してください。", error: "うまくいきませんでした。時間をおいてもう一度お試しください。", ios: "iPhone・iPadでは、ホーム画面に追加すると通知を受け取れます。Safariの共有ボタン（□↑）→「ホーム画面に追加」→ 追加したアイコンから開いて、このボタンを押してください。", busy: "設定中…" },
};
T.en.u = {
  followTxt: "New releases & restocks every week", followCta: (a) => `Follow @${a}`,
  homeH1: (ym) => `New gachapon in Japan: release dates (${MONTH_EN[ym.m - 1]} ${ym.y})`,
  addedLine: (d, w) => `Added today: ${d} · This week: ${w}`,
  save: "Save", saved: "Saved", saveAria: "Save to My list", unsaveAria: "Remove from My list",
  mylist: "My list", mylistTitle: "My list (saved gacha)", mylistLead: "Gacha you saved with ★, grouped by release status. They are kept only in this browser — no account needed.",
  mlNow: "Releasing this week", mlSoon: "Coming soon", mlOut: "Out now", mlEmpty: "Nothing saved yet. Tap ★ on any gacha to keep it here.", mlBrowse: "See this week's releases",
  stockShort: "Shops", mercari: "Mercari", whereBtn: "Find shops on Bandai's official finder", findLater: "Shop list on this site",
  relOut: "Out now", relSoon: (m) => `Coming ${MONTH_EN[m - 1]}`,
  monthsH: "Release calendar by month", thisM: "This month", nextM: "Next month", prevM: "Last month",
  makersH: "Browse by maker", prefsLink: "",
  optional: "Optional", skipQ: "Skip", priceTba: "Price TBA",
  charaHit: "{l} gacha ({n}) →",
  push: { on: "Notify me on release", off: "Stop notifications", lead: "Get a notification on Monday morning (Japan time) of the week your ★ saved gacha are released. No account needed.", onNow: "Notifications on: we'll tell you the week your ★ gacha are released.", done: "Notifications are on.", offDone: "Notifications are off.", denied: "Notifications are blocked. Please allow them for this site in your browser settings.", error: "Something went wrong. Please try again later.", ios: "On iPhone/iPad, notifications work after adding this site to your Home Screen: tap Share (□↑) → “Add to Home Screen”, open it from the new icon, then tap this button.", busy: "Setting up…" },
};
// 日本語以外の商品ページ「日本のどこで買える？」（{st} は駅ページへのリンクに置きかえる）
T.en.where = {
  h: (name) => `Where to buy ${name} in Japan`,
  lead: (n) => `Bandai's official shop list shows ${n} shops in Japan carrying this gacha. Here are some near major stations:`,
  none: "Sold at capsule toy shops and gacha corners in shopping malls across Japan. Stock differs by shop, so check the live list below.",
  walkFrom: (m) => `${m} min walk from {st}`,
  qaH: "FAQ",
  qPrice: (name) => `How much is ${name}?`, aPrice: (p) => `¥${p} per play.`,
  qCount: "How many designs are there?", aCount: (n) => `${n} designs in total.`,
  qRelease: "When is the release date?", aRelease: (mo, up) => (up ? `Scheduled for ${mo}. Dates can vary by region and shop.` : `Released in ${mo}. Dates can vary by region and shop.`),
  qWhere: "Where can I buy it in Japan?",
  aWhere: (n, sts) => `Bandai's official list shows ${n} shops in Japan carrying it${sts ? `, including near ${sts}` : ""}. Stock changes quickly, so check before you go.`,
  aWhereNone: "At capsule toy shops and gacha corners in shopping malls across Japan. Stock differs by shop.",
  sep: ", ",
};
// 日本語以外の商品ページ：同じ週に発売のガチャの見出しと、下のバー（発売前）の文言。chips は空（通販チップの見出しは出さない）
T.en.sameWeek = { h: "Releasing the same week", chips: "", notify: "🔔 Notify me", rakUp: "Pre-order (Rakuten)", rak: "Rakuten" };
// 日本語以外の週ごとのページ（src/hubs.js）：注目5選・全部・メーカー別・再販と、旅行者向けのひとこと。intro は [リンクの前, リンクの文字, リンクの後]
T.en.wk = {
  top5Now: "This week's top 5", top5: "Top 5 picks of the week",
  capSubj: (s) => `${s} gacha`, price: (p) => `¥${p} per play`, sep: " · ",
  allH: (n) => `All releases of the week (${n})`, makersH: "By maker", count: (n) => `${n}`,
  makerH: (m, n) => `${m} (${n})`, makerMore: (m) => `All ${m} gacha →`, priceIn: (p) => ` – ${p}`,
  reH: "Reissues of the week", reMore: "All reissues →",
  intro: (range, n) => [`Japanese gachapon (capsule toys) releasing in Japan the week of ${range}: ${n} new series. New machines roll out to shops from release day and popular series sell out within days — find shops near your station in our `, "station guide", "."],
};

/* ---------- 商品ページの「このガチャについて」（データだけから作る短い文章。v はページごとの言い回しの番号） ----------
 * d: name maker price n（全◯種）/ ch（キャラクターのリンクHTML）k（そのキャラのシリーズ数）/ ln（ラインナップ名）more
 *    prev next nextUp label（シリーズの前作・次作）/ shops prefs（公式の取扱店数・多い都道府県）
 * r: 発売（kind は wkUp wkNow wkPast moUp moNow moPast、y m no range month）。文字はすべて呼ぶ側でエスケープ済み */
T.ja.ab = {
  h: "このガチャについて",
  intro: [
    (d) => `「${d.name}」は${d.maker}のガチャガチャ${d.price || d.n ? `で、${[d.price ? `1回${d.price}円` : "", d.n ? `全${d.n}種` : ""].filter(Boolean).join("・")}` : ""}です。`,
    (d) => `${d.maker}の「${d.name}」は、${[d.price ? `1回${d.price}円` : "", d.n ? `全${d.n}種` : ""].filter(Boolean).join("で") || "ひとつ"}のカプセルトイです。`.replace("ひとつのカプセルトイ", "カプセルトイ"),
    (d) => `「${d.name}」（${d.maker}）は${[d.n ? `全${d.n}種` : "", d.price ? `1回${d.price}円` : ""].filter(Boolean).join("、")}のガチャです。`,
  ],
  rel: (r, v, re) => (re ? "今回は再販で、" : "") + ({
    wkUp: [`${r.y}年${r.m}月第${r.no}週（${r.range}）から順次発売される予定です。`, `発売は${r.m}月第${r.no}週（${r.range}）からの予定です。`],
    wkNow: [`今週（${r.m}月第${r.no}週・${r.range}）発売のシリーズです。`, `発売は今週（${r.range}）からです。`],
    wkPast: [`${r.y}年${r.m}月第${r.no}週（${r.range}）に発売されました。`, `発売は${r.y}年${r.m}月第${r.no}週（${r.range}）でした。`],
    moUp: [`${r.y}年${r.m}月に発売される予定です。`], moNow: [`${r.y}年${r.m}月発売のシリーズです。`], moPast: [`${r.y}年${r.m}月に発売されました。`],
  }[r.kind]).at(r.kind.startsWith("wk") ? v % 2 : 0),
  chara: (d, v) => d.ch && d.ln ? [`${d.ch}のガチャで、ラインナップには${d.ln}${d.more ? "など" : ""}が入っています。`, `ラインナップは${d.ln}${d.more ? "など" : ""}で、${d.ch}のガチャのひとつです。`][v % 2]
    : d.ch ? [`${d.ch}のガチャは、当サイトにほかにも${d.k - 1}シリーズ載っています。`, `${d.ch}のガチャの一覧では、このシリーズをふくめて${d.k}シリーズを見られます。`][v % 2]
    : d.ln ? `ラインナップは${d.ln}${d.more ? "など" : ""}です。` : "",
  series: (d, v) => {
    const L = d.label ? `「${d.label}」シリーズ` : "同じシリーズ";
    if (d.prev && d.next) return `${L}の前作は「${d.prev}」、次作は「${d.next}」です。`;
    if (d.prev) return [`${L}の前作には「${d.prev}」があります。`, `${L}では、ひとつ前の作品が「${d.prev}」です。`][v % 2];
    return d.next ? `${L}では、次作「${d.next}」${d.nextUp ? "の発売も予定されています" : "も発売されています"}。` : "";
  },
  shops: (d, v) => [`バンダイ公式の取扱店情報では全国${d.shops}店で取扱があり${d.prefs ? `、${d.prefs}に多くあります` : "ます"}。`,
    `取扱店はバンダイ公式の情報で${d.shops}店${d.pn > 1 ? `。都道府県別では${d.prefs}の順に多くなっています` : d.prefs ? `で、${d.prefs}に多くあります` : "です"}。`][v % 2],
  pref: (p, k) => `${p}（${k}店）`, prefSep: "・", prefs: true,
};
T.en.ab = {
  h: "About this gacha",
  intro: [
    (d) => `"${d.name}" is a capsule toy from ${d.maker}${d.price ? `: ¥${d.price} per play` : ""}${d.n ? `${d.price ? "," : ":"} ${d.n} designs in total` : ""}.`,
    (d) => `${d.maker}'s "${d.name}"${d.price ? ` costs ¥${d.price} per play` : " is a capsule toy"}${d.n ? ` and has ${d.n} designs to collect` : ""}.`,
  ],
  rel: (r, v, re) => re && r.kind === "moNow" ? `It is a ${r.month} reissue.` : ({
    wkUp: `It is scheduled to roll out in Japan from the week of ${r.range} (${r.month})`, wkNow: `It is rolling out in Japan this week (${r.range})`,
    wkPast: `It was released in Japan in the week of ${r.range} (${r.month})`, moUp: `It is scheduled for release in ${r.month}`, moNow: `It is a ${r.month} release`, moPast: `It was released in ${r.month}`,
  }[r.kind]) + (re ? " as a reissue." : "."),
  chara: (d, v) => !d.ch ? "" : [`It is part of our ${d.ch} gacha collection, with ${d.k} series listed on this site.`, `Fans of ${d.ch} can find ${d.k - 1} more series on this site.`][v % 2],
  series: (d) => {
    const L = d.label ? `the ${d.label} series` : "the same series";
    if (d.prev && d.next) return `In ${L}, the previous release is "${d.prev}" and the next one is "${d.next}".`;
    if (d.prev) return `The previous release in ${L} is "${d.prev}".`;
    return d.next ? `The next release in ${L}, "${d.next}", ${d.nextUp ? "is already scheduled" : "is also out"}.` : "";
  },
  shops: (d, v) => [`Bandai's official shop data lists it at ${d.shops} shops in Japan${d.prefs ? `, most of them in ${d.prefs}` : ""}.`,
    `According to Bandai's official stockist data, ${d.shops} shops carry it${d.prefs ? ` (most in ${d.prefs})` : ""}.`][v % 2],
  pref: (p) => PREF_EN[p] || p, prefSep: ", ", prefs: true, dash: "–",
};

/* ---------- 中国語・韓国語：src/i18n/<lang>.js（画面の文言など）と data/i18n/names-<lang>.json（商品名） ---------- */
const I18N = {}, I18N_GENRE = {}, I18N_TYPE = {}, I18N_MAKER = {}, I18N_CHARA = {};
for (const l of XL) {
  const f = path.join(__dirname, "i18n", `${l}.js`);
  const m = fs.existsSync(f) ? require(f) : {};
  I18N[l] = m;
  I18N_GENRE[l] = m.genres || {}; I18N_TYPE[l] = m.types || {}; I18N_MAKER[l] = m.makers || {}; I18N_CHARA[l] = m.chara || {};
  T[l] = { ...T.en, ...(typeof m.t === "function" ? m.t({ site, MONTH_EN, jstParts }) : m.t || {}), htmlLang: LANG_META[l].html, ogLocale: LANG_META[l].og };
  T[l].hub = { ...T.en.hub, ...(m.hub || {}) };
  T[l].ab = { ...T.en.ab, ...(m.ab || {}) };
  T[l].cal = { ...T.en.cal, ...(m.cal || {}) }; // 発売カレンダーの文言（足りないものは英語）
  T[l].stn = { ...T.en.stn, ...(T[l].stn || {}) };
  T[l].where = { ...T.en.where, ...(T[l].where || {}) };
  T[l].sameWeek = { ...T.en.sameWeek, ...(T[l].sameWeek || {}) };
  T[l].wk = { ...T.en.wk, ...(T[l].wk || {}) };
}
T.ja.hub = T.en.hub; // 日本語は src/hubs.js の中に直接書いている（英語のものは使わない）
// 診断の選択肢（英語名をキーに、中国語・韓国語は i18n の quiz → chara の順で探す）
const qLabel = (o, lang) => (lang === "ja" ? o.label : (I18N[lang] && I18N[lang].quiz && I18N[lang].quiz[o.en]) || (I18N_CHARA[lang] && I18N_CHARA[lang][o.en]) || o.en || o.label);
const charaLabel = (ch, lang) => (lang === "ja" ? ch.label : (I18N_CHARA[lang] && I18N_CHARA[lang][ch.en]) || ch.en);

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
const I18N_NAMES = Object.fromEntries(XL.map((l) => [l, readJSON(`i18n/names-${l}.json`, {}) || {}]));
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
  names: Object.fromEntries(XL.map((l) => [l, (I18N_NAMES[l] || {})[it.id] || ""]).filter(([, v]) => v)),
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
// 発売週のお知らせ（Web Push）のボタン。通知に対応したブラウザでだけ app.js が表示する（kind：ml＝マイリスト、item＝商品ページ）
const pushBox = (t, kind, favId = "") => {
  const P = (t.u && t.u.push) || T.en.u.push;
  return `<div class="push-box push-${kind}" data-push="${esc(JSON.stringify(P))}"${favId ? ` data-fav-id="${esc(favId)}"` : ""} hidden>${kind === "ml" ? `<p class="push-lead">${esc(P.lead)}</p>` : ""}<div class="push-row"><button type="button" class="push-on">${esc(P.on)}</button><button type="button" class="push-off" hidden>${esc(P.off)}</button></div><p class="push-msg" role="status" hidden></p><p class="push-ios" hidden>${esc(P.ios)}</p></div>`;
};
const up = (n) => "../".repeat(n);
const langDir = (lang) => (lang === "ja" ? "" : `${lang}/`);
const canonical = (lang, p) => SITE_URL + "/" + langDir(lang) + p.replace(/^index\.html$/, "").replace(/\.html$/, "");
// hreflang の x-default：英語版があれば英語（言語の合わない海外の人向け）、なければその言語のページ
const xDefault = (rel, alts) => (alts.includes("en") ? "en" : alts[0]);
const absImg = (it) => (!it.image ? "" : /^https?:/.test(it.image) ? it.image : SITE_URL + "/" + it.image);
const hashSlug = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0; return "m" + h.toString(36); };
const MAKER_SLUG = { "バンダイ": "bandai", "タカラトミーアーツ": "takara-tomy-arts", "キタンクラブ": "kitan-club", "クオリア": "qualia", "ブシロード": "bushiroad", "エポック社": "epoch", "ケンエレファント": "kenelephant", "SO-TA": "so-ta", "ブシロードクリエイティブ": "bushiroad-creative", "トイズキャビン": "toys-cabin", "スタンド・ストーンズ": "stand-stones", "エール": "yell" };
const makerSlug = (name) => MAKER_SLUG[name] || hashSlug(name);
// NEW：サイトに載って3日以内で、発売月が過ぎていないもの（まとめて取り込んだ古い商品にNEWを付けない）
const isNew = (it) => daysBetween(it.added, today) <= 3 && it.release >= thisMonth;
const byNewest = (a, b) => (b.added > a.added ? 1 : b.added < a.added ? -1 : b.popularity - a.popularity);
const maxAdded = (list) => list.reduce((m, it) => (it.added > m ? it.added : m), ""); // 一覧の中でいちばん新しい追加日（サイトマップの lastmod）
const heartsOf = (it) => Number(votes[it.id]) || 0;
const byPopular = (a, b) => heartsOf(b) - heartsOf(a) || b.popularity - a.popularity;

// 言語ごとの表示名
// 中国語・韓国語の商品名は data/i18n/names-<lang>.json（なければ英語名→日本語名）
const nameOf = (it, lang) => (lang === "ja" ? it.name : (lang !== "en" && it.names && it.names[lang]) || it.name_en || it.name);
const hasName = (it, lang) => lang === "ja" || (lang === "en" ? !!it.name_en : !!(it.names && it.names[lang]));
const makerOf = (it, lang) => (lang === "ja" ? it.maker : (I18N_MAKER[lang] && I18N_MAKER[lang][it.maker]) || it.maker_en || it.maker);
const descOf = (it, lang) => (lang === "ja" ? it.description : lang === "en" ? it.description_en : "");
const tagsOf = (it, lang) => (lang !== "ja" && it.tags_en.length ? it.tags_en : it.tags);
const genreLabel = (g, lang) => (lang === "ja" ? g.label : (I18N_GENRE[lang] && I18N_GENRE[lang][g.slug]) || g.en);
// 種類（/type/）の名前。ジャンルと同じスラッグ（accessory など）でも別の名前にする（i18n の types → なければ genres → 英語）
const typeLabel = (g, lang) => (lang === "ja" ? g.label : (I18N_TYPE[lang] && I18N_TYPE[lang][g.slug]) || (I18N_GENRE[lang] && I18N_GENRE[lang][g.slug]) || g.en);
// 「・」の後ろでだけ改行する（言葉の途中で折り返さない）
const phr = (s) => esc(s).split(/(?<=・)/).map((w) => `<span class="ph">${w}</span>`).join("");
const inGenre = (slug) => items.filter((it) => it._genres.includes(slug));
// 種類「ミニチュア」は ジャンル「リアルミニチュア」（/genre/miniature）と中身が同じなので、種類のページは作らない（/type/miniature は _redirects で /genre/miniature へ）
const TYPE_DUP_OF_GENRE = new Set(["miniature"]);
const TYPES = (site.types || []).filter((g) => !TYPE_DUP_OF_GENRE.has(g.slug));
const inType = (slug) => { const ty = TYPES.find((x) => x.slug === slug); return ty ? items.filter((it) => it._qs.some((k) => ty.subs.includes(k))) : []; };
const moodLabel = (m, lang) => (lang !== "ja" ? m.en || m.label : m.label);

const affSearch = (q) => {
  const amazon = `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}${site.amazon_tag ? `&tag=${encodeURIComponent(site.amazon_tag)}` : ""}`;
  const rs = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`;
  const rakuten = site.rakuten_affiliate_id ? `https://hb.afl.rakuten.co.jp/hgc/${site.rakuten_affiliate_id}/?pc=${encodeURIComponent(rs)}&m=${encodeURIComponent(rs)}` : rs;
  return { amazon, rakuten };
};
// 通販の検索の言葉：【…】を外した商品名＋「ガチャ」＋（発売前なら「予約」、種類数がわかれば「全◯種」、なければ「コンプ」）。JANで探すと楽天はほとんど出ないので使わない
const affName = (it) => it.name.replace(/【[^】]*】/g, "").normalize("NFKC").replace(/\s+/g, " ").trim();
const affQuery = (it) => { const name = affName(it); const n = Number(it.lineup) || 0; return `${name} ガチャ ${HUB.isUpcoming(it) ? "予約" : n ? `全${n}種` : "コンプ"}`; };
// Amazon の検索の言葉：種類数がわかれば「全◯種セット」（Amazon はセット商品の名前にこう書かれていることが多い）。わからなければ affQuery と同じ
const amzQuery = (it) => { const n = Number(it.lineup) || 0; return n ? `${affName(it)} ガチャ 全${n}種セット` : affQuery(it); };
const amzUrl = (q) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}${site.amazon_tag ? `&tag=${encodeURIComponent(site.amazon_tag)}` : ""}`;
const affiliate = (it) => {
  const q = affQuery(it);
  const amazon = amzUrl(amzQuery(it));
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
// 通販・フリマで探すリンク（通販は affQuery の言葉で。JAN は表示用）
const shopLinks = (it) => {
  const jan = janOf(it), name = it.name.replace(/【[^】]*】/g, "").trim();
  const q = affQuery(it);
  const a = { ...affSearch(q), amazon: amzUrl(amzQuery(it)) };
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
const titleRx = titles.map((tt) => ({ ...tt, rx: new RegExp(tt.match, "i"), exact: new RegExp(`^(?:${tt.match})$`, "i") }));
// ラインナップ名だけで当たったとき、ほかの意味もある言葉（「黒のハチワレ」＝猫の柄）では作品に入れない。
// 商品名に作品名があるか、ラインナップ名がその言葉ぴったりのときだけ
const CHARA_AMBIG = /ハチワレ/g;
const charaHit = (tt, it) => tt.rx.test([it.name, it.name_en].join(" "))
  || (it.lineup_names || []).some((n) => tt.rx.test(n) && (tt.rx.test(n.replace(CHARA_AMBIG, "")) || tt.exact.test(String(n).trim())));
// キャラクター・作品ごとのページ（作品名カタログから、3シリーズ以上あるものだけ）
const CHARAS = (() => {
  const by = new Map(); // 同じ作品がカタログに2回あるときはまとめる
  for (const tt of titleRx) {
    const slug = String(tt.en || "").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-") || hashSlug(tt.label);
    const list = items.filter((it) => charaHit(tt, it));
    const cur = by.get(slug);
    if (cur) { for (const it of list) if (!cur.list.includes(it)) cur.list.push(it); cur.match += "|" + tt.match; }
    else by.set(slug, { label: tt.label, en: tt.en || tt.label, slug, list, match: tt.match });
  }
  // 人気シリーズ（サンリオ・ディズニー・たまごっち・めじるし）も同じ形のページに（/series/ は /chara/ へ転送）
  for (const k of ["sanrio-characters-all", "tamagotchi"]) by.delete(k);
  for (const sr of SERIES) by.set(sr.slug, { label: sr.label, en: sr.en, slug: sr.slug, list: seriesItems(sr), match: sr.re.source });
  return [...by.values()].filter((x) => x.list.length >= 3).sort((a, b) => b.list.length - a.list.length);
})();
const charasOf = (it) => CHARAS.filter((ch) => ch.list.includes(it));
const YM_NOW = `${nowJST.getUTCFullYear()}年${nowJST.getUTCMonth() + 1}月`;
const YM_NOW_EN = { y: nowJST.getUTCFullYear(), m: nowJST.getUTCMonth() + 1 };
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
// 週ごとの固定ページ・シリーズ・再販・値段の一覧（src/hubs.js）
const hubs = require("./hubs");
const HUB = hubs.prepare({ items, weekStartOf, weekInfo, mondayOf, nowJST, thisMonth, hashSlug });
const stats = require("./stats"); // 統計ページ /stats（日本語・英語）
const STATS = stats.compute({ items, weekStartOf, isReissue: hubs.isReissue, CHARAS, thisMonth });
// 一覧ページのタイトルの【◯年◯月】：その一覧の中でいちばん新しい更新（追加日・発売月）の月。先月より古ければ付けない
const PREV_MONTH = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
const freshYM = (list) => {
  const m = list.reduce((a, it) => { const r = it.release <= thisMonth ? it.release : ""; const d = String(it.added || "").slice(0, 7); return [a, r, d > thisMonth ? thisMonth : d].sort().pop(); }, "");
  if (!m) return null;
  const [y, mo] = m.split("-").map(Number);
  return { y, m: mo, ja: m < PREV_MONTH ? "" : `${y}年${mo}月` };
};

/* ---------- みんなのガチャマップ：お店 ---------- */
const shopsLive = readJSON("shops-live.json", {}) || {};
const SHOPS = (() => {
  const list = Array.isArray(shopsLive.shops) && shopsLive.shops.length ? shopsLive.shops
    : stores.filter((x) => /^g-s\d+$/i.test(x.id) && x.lat && x.lng).map((x) => ({ id: x.id.slice(2).toLowerCase(), name: x.name, pref: x.prefecture, address: x.address, lat: x.lat, lng: x.lng, src: "bandai", hidden: 0 }));
  const PN = Object.keys(PREF_EN);
  for (const x of list) if (!x.pref && x.address) x.pref = PN.find((p) => String(x.address).startsWith(p)) || "";
  return list.filter((x) => !x.hidden && x.lat && x.lng && /^[a-z0-9-]+$/.test(x.id));
})();
// 公式の取扱：サイトのデータベース（shopdump）と、取り込んだ公式の取扱店（stock.json）を合わせる。
// shopdump が読めなかった日も、お店のページが「中身なし」にならないように
const SHOP_OFFICIAL = (() => {
  const m = {};
  const add = (sid, id) => { if (!sid || !id) return; (m[sid] ||= new Set()).add(id); };
  for (const [sid, ids] of Object.entries(shopsLive.official || {})) for (const id of ids || []) add(sid, id);
  for (const r of stockFile.stock || []) if (/^g-s\d+$/i.test(r.store_id)) add(r.store_id.slice(2).toLowerCase(), r.item_id);
  const o = {}; for (const [k, v] of Object.entries(m)) o[k] = [...v]; return o;
})();
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
// 抽選（受付中・これから）と商品の対応。抽選ページと商品ページの両方で使うので、ここで1回だけ計算する
const LOT_LIVE = LOTTERY.filter((x) => x.end >= nowJST.toISOString().slice(0, 16)).sort((a, b) => (a.end > b.end ? 1 : -1));
const LOT_KIND = { item: "商品の抽選", open: "オープン・入場", event: "イベント" };
// 抽選の商品名 → 商品ページ（記号・空白をのぞいて同じ名前、なければ2文字ずつの重なりがとても大きいもの）
const lotNorm = (s) => String(s || "").normalize("NFKC").replace(/【[^】]*】/g, "").replace(/[\s・\-~～〜!！?？()（）「」『』.,、。:：/＆&]/g, "").toLowerCase();
const lotBigr = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); } return m; };
const lotDice = (a, b) => { if (a.length < 2 || b.length < 2) return 0; const A = lotBigr(a), B = lotBigr(b); let k = 0; for (const [g, n] of A) k += Math.min(n, B.get(g) || 0); return (2 * k) / (a.length + b.length - 2); };
const LOT_NORM_ITEMS = items.map((it) => [lotNorm(it.name), it]);
const lotMatchItem = (title) => {
  const q = lotNorm(title);
  if (q.length < 4) return null;
  const ex = LOT_NORM_ITEMS.filter(([n]) => n === q).map(([, it]) => it);
  if (ex.length) return ex.find((it) => !hubs.isReissue(it)) || ex[0];
  let best = null, bs = 0;
  for (const [n, it] of LOT_NORM_ITEMS) { const d = lotDice(q, n); if (d > bs) { bs = d; best = it; } }
  return bs >= 0.8 ? best : null;
};
// 同じ商品名の抽選を1つにまとめる（締め切りが近い順）。「A / B」のように2商品の抽選は両方の商品に結びつける
const LOT_GROUPS = [];
for (const x of LOT_LIVE) { let g = LOT_GROUPS.find((y) => y.title === x.title); if (!g) LOT_GROUPS.push((g = { title: x.title, list: [] })); g.list.push(x); }
for (const g of LOT_GROUPS) { g.parts = g.title.split(/\s+\/\s+/).map((p) => ({ p, it: lotMatchItem(p) })); g.it = (g.parts.find((x) => x.it) || {}).it; }
const LOT_BY_ITEM = new Map(); // 商品id → 受付中の抽選
for (const g of LOT_GROUPS) for (const it of new Set(g.parts.map((x) => x.it).filter(Boolean))) LOT_BY_ITEM.set(it.id, [...(LOT_BY_ITEM.get(it.id) || []), ...g.list]);
for (const l of LOT_BY_ITEM.values()) l.sort((a, b) => (a.end > b.end ? 1 : -1));
const lotTz = (d) => (/T\d\d:\d\d$/.test(d) ? `${d}:00+09:00` : d);
// 構造化データ：抽選（Event）。url は応募ページ、なければ載せているページ
const lotEventLd = (x, pageUrl, img) => ({
  "@context": "https://schema.org", "@type": "Event", name: `${x.title}｜${LOT_KIND[x.kind] || "抽選"}（${x.store}）`,
  startDate: lotTz(x.start), endDate: lotTz(x.end), eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  location: { "@type": "Place", name: x.store, address: { "@type": "PostalAddress", ...(x.pref ? { addressRegion: x.pref } : {}), addressCountry: "JP" } },
  organizer: { "@type": "Organization", name: x.store }, url: x.url || pageUrl,
  description: `応募方法：${x.method || "お店でご確認ください"}${x.note ? `。${x.note}` : ""}`,
  ...(img ? { image: [img] } : {}),
});
const starsHtml = (r) => r && r.n ? `<span class="stars-v" style="--v:${r.avg}" aria-label="☆${r.avg}"></span><b class="stars-n">${Number(r.avg).toFixed(1)}</b><small>（${r.n}）</small>` : "";
const PREF_ORDER = Object.keys(PREF_EN);
const KIND_LABEL = { gacha: "ガチャ専門店", game: "ゲームセンター", mall: "ショッピングモール・スーパー", station: "駅・空港・サービスエリア", shop: "そのほかのお店" };
const prefSlug = (p) => (PREF_EN[p] || "other").toLowerCase().replace(/[^a-z]+/g, "-");
const itemById = new Map(items.map((it) => [it.id, it]));

/* ---------- 駅・チェーンのページ用（「ガチャガチャ 秋葉原」「ガチャガチャの森 店舗」のような検索の受け皿） ---------- */
// 2点のあいだの距離（m）
const distM = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 6371e3 * 2 * Math.asin(Math.sqrt(x)); };
const fmtDist = (m) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)}m` : `${(m / 1000).toFixed(1)}km`);
const walkMin = (m) => Math.max(1, Math.round(m / 80)); // 徒歩は分速80m
const gmapUrl = (sh) => `https://www.google.com/maps/search/?api=1&query=${sh.lat},${sh.lng}`;
// 住所を「都道府県・市区町村・それより後ろ」に分ける（政令市は「大阪市」まで、東京23区は「千代田区」）
const addrParts = (addr, pref) => {
  const a = String(addr || "").replace(/[\s　]+/g, "");
  const m = a.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/);
  const hasPref = !!(m && PREF_EN[m[1]]);
  const rest = hasPref ? a.slice(m[1].length).replace(new RegExp("^" + m[1]), "") : a; // 「大阪府大阪府…」のような重なりも外す
  let city = "";
  const c1 = rest.match(/^(四日市市|廿日市市|野々市市|.{1,5}?市)/);
  if (c1 && !/区|郡.+[町村]/.test(c1[1])) city = c1[1];
  else { const c2 = rest.match(/^(.{1,5}?郡)?.{1,4}?[区町村]/); if (c2) city = c2[0]; }
  return { pref: hasPref ? m[1] : pref || "", city, street: rest.slice(city.length) };
};
// チェーン（店名から判定。上から順に当てはめる。5店以上あるものだけページを作る）
// i：外国語ページで出す名前（en・zh-cn・zh-tw・ko。無い言語は en）
const CHAIN_DEFS = [
  { slug: "gashapon-official-shop", label: "ガシャポンバンダイオフィシャルショップ", short: "ガシャポンオフィシャルショップ", re: /ガシャポン(バンダイ)?オフィシャルショップ|GASHAPON OFFICIAL SHOP/i, i: { en: "Gashapon Bandai Official Shop", "zh-cn": "万代扭蛋官方店", "zh-tw": "萬代扭蛋官方店", ko: "반다이 가샤폰 공식 숍" } },
  { slug: "gashapon-department-store", label: "ガシャポンのデパート", re: /ガシャポンのデパート/, i: { en: "Gashapon Department Store", "zh-cn": "扭蛋百货", "zh-tw": "扭蛋百貨", ko: "가샤폰 백화점" } },
  { slug: "gachagacha-no-mori", label: "ガチャガチャの森", re: /ガチャガチャの森/, i: { en: "Gachagacha no Mori", "zh-cn": "扭蛋森林（ガチャガチャの森）", "zh-tw": "扭蛋森林（ガチャガチャの森）", ko: "가챠가챠의 숲" } },
  { slug: "c-pla", label: "#C-pla", re: /[#♯]\s*C-pla/i, i: { en: "#C-pla" } },
  { slug: "gashacoco", label: "ガシャココ", re: /ガシャココ/, i: { en: "Gashacoco", ko: "가샤코코" } },
  { slug: "festaland", label: "ふぇすたらんど", re: /ふぇすたらんど/, i: { en: "Festaland", ko: "페스타랜드" } },
  { slug: "dream-capsule", label: "ドリームカプセル", re: /ドリームカプセル/, i: { en: "Dream Capsule", ko: "드림캡슐" } },
  { slug: "capsule-park", label: "カプセルパーク", re: /カプセルパーク/, i: { en: "Capsule Park", ko: "캡슐파크" } },
  { slug: "pon", label: "Pon!", re: /^Pon!/i, i: { en: "Pon!" } },
  { slug: "gacha-dokoro", label: "がちゃ処", re: /がちゃ処|ガチャ処/, i: { en: "Gacha-dokoro", ko: "가챠도코로" } },
  { slug: "gacha-oukoku", label: "ガチャ王国", re: /ガチャ王国/, i: { en: "Gacha Kingdom", "zh-cn": "扭蛋王国", "zh-tw": "扭蛋王國", ko: "가챠 왕국" } },
  { slug: "capsule-lab", label: "カプセルラボ", re: /カプセルラボ/, i: { en: "Capsule Lab", ko: "캡슐랩" } },
  { slug: "nitori", label: "ニトリ", re: /^ニトリ/, store: true, i: { en: "Nitori", "zh-cn": "宜得利（NITORI）", "zh-tw": "宜得利（NITORI）", ko: "니토리" } }, // ガチャ専門店ではないお店（タイトルに「ガチャガチャ設置店」を付ける）
];
const CHAINS = (() => {
  const by = new Map(CHAIN_DEFS.map((ch) => [ch, []]));
  for (const sh of SHOPS) { const n = String(sh.name || "").normalize("NFKC"); const ch = CHAIN_DEFS.find((d) => d.re.test(n)); if (ch) by.get(ch).push(sh); }
  return CHAIN_DEFS.map((ch) => ({ ...ch, shops: by.get(ch) })).filter((ch) => ch.shops.length >= 5);
})();
const CHAIN_BY_SHOP = new Map(CHAINS.flatMap((ch) => ch.shops.map((sh) => [sh.id, ch])));
const chainName = (ch) => ch.short || ch.label;
const chainLabel = (ch, lang) => (lang === "ja" ? chainName(ch) : (ch.i && (ch.i[lang] || ch.i.en)) || ch.label);
// 主要な駅・空港（data/stations.json）。公式の取扱店を1.5km以内（3店未満なら3km以内）で近い順に。0店の駅は作らない
const STATION_REGIONS = ["kanto", "kansai", "chubu", "kyushu", "north", "chugoku", "airport"];
const STATION_REGION_JA = { kanto: "関東（東京・神奈川・埼玉・千葉）", kansai: "関西（大阪・京都・神戸）", chubu: "中部（名古屋）", kyushu: "九州・沖縄", north: "北海道・東北", chugoku: "中国（広島）", airport: "空港" };
const LANDMARKS_FILE = readJSON("landmarks.json", {}) || {};
const LANDMARKS_CHECKED = LANDMARKS_FILE.checked || "";
const LANDMARKS = (LANDMARKS_FILE.landmarks || []).filter((lm) => lm.verify !== true && typeof lm.lat === "number" && typeof lm.lng === "number" && lm.station);
const STATIONS = (readJSON("stations.json", []) || []).map((st) => {
  const all = SHOPS.filter((sh) => sh.src !== "user" && Math.abs(sh.lat - st.lat) < 0.04 && Math.abs(sh.lng - st.lng) < 0.05)
    .map((sh) => ({ sh, d: distM(st.lat, st.lng, sh.lat, sh.lng) })).filter((x) => x.d <= 3000).sort((a, b) => a.d - b.d);
  const near = all.filter((x) => x.d <= 1500);
  const base = near.length >= 3 ? { ...st, km: 1.5, shops: near } : { ...st, km: 3, shops: all };
  // 有名なガチャ専門店（data/landmarks.json）。確かめられていないもの（verify）と位置のないものは出さない
  const lms = LANDMARKS.filter((lm) => lm.station === st.slug).map((lm) => {
    const sh = lm.store_id ? SHOP_BY_ID.get(String(lm.store_id).replace(/^g-/i, "").toLowerCase()) || null : null;
    return { lm, sh, d: distM(st.lat, st.lng, lm.lat, lm.lng) };
  }).sort((a, b) => (b.lm.machines || 0) - (a.lm.machines || 0) || a.d - b.d);
  const lmIds = new Set(lms.filter((x) => x.sh).map((x) => x.sh.id));
  const rest = base.shops.filter((x) => !lmIds.has(x.sh.id));
  return { ...base, lms, rest, count: lms.length + rest.length };
}).filter((st) => st.shops.length || st.lms.length); // 公式の取扱店か、有名なガチャ専門店が1つでもあれば作る
// お店 → いちばん近い駅のページ（そのお店が載っている駅だけ）
const STATION_OF_SHOP = (() => {
  const m = new Map();
  for (const st of STATIONS) for (const x of st.shops) { const cur = m.get(x.sh.id); if (!cur || x.d < cur.d) m.set(x.sh.id, { st, d: x.d }); }
  return m;
})();
// 近くのお店（自分以外で近い順）
const nearShops = (sh, n) => {
  let pool = SHOPS.filter((x) => x !== sh && Math.abs(x.lat - sh.lat) < 0.05 && Math.abs(x.lng - sh.lng) < 0.06);
  if (pool.length < n) pool = SHOPS.filter((x) => x !== sh);
  return pool.map((x) => ({ sh: x, d: distM(sh.lat, sh.lng, x.lat, x.lng) })).sort((a, b) => a.d - b.d).slice(0, n);
};
// 構造化データ：お店（Store）
const storeLd = (sh) => {
  const a = addrParts(sh.address, sh.pref), ch = CHAIN_BY_SHOP.get(sh.id);
  return {
    "@type": "Store", name: sh.name, url: canonical("ja", `shop/${sh.id}.html`),
    ...(sh.address || a.pref ? { address: { "@type": "PostalAddress", addressCountry: "JP", ...(a.pref ? { addressRegion: a.pref } : {}), ...(a.city ? { addressLocality: a.city } : {}), ...(a.street ? { streetAddress: a.street } : {}) } } : {}),
    geo: { "@type": "GeoCoordinates", latitude: sh.lat, longitude: sh.lng }, hasMap: gmapUrl(sh),
    ...(ch ? { brand: { "@type": "Brand", name: ch.label } } : {}),
  };
};

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
// CSS・JS を軽くして書き出す（ライブラリなし。文字列の中は触らない）
const minifyCSS = (src) => {
  const keep = [];
  return src
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => `\u0000${keep.push(m) - 1}\u0000`)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .replace(/\u0000(\d+)\u0000/g, (m, i) => keep[Number(i)])
    .trim();
};
// JS は安全なところだけ：1行まるごとのコメントと、行頭の空白を消す（app.js はテンプレート文字列を使っていない）
const minifyJS = (src) => /`/.test(src) ? src : src.split("\n").map((l) => l.trim()).filter((l) => l && !/^\/\/(?!#)/.test(l) && !/^\/\*(?:(?!\*\/).)*\*\/$/.test(l)).join("\n") + "\n";
fs.writeFileSync(path.join(OUT, "assets/style.css"), minifyCSS(fs.readFileSync(path.join(__dirname, "style.css"), "utf8")));
fs.writeFileSync(path.join(OUT, "assets/app.js"), minifyJS(fs.readFileSync(path.join(__dirname, "app.js"), "utf8")));
// ファビコン・ホーム画面のアイコン・ウェブアプリの設定（brand/icons/ の PNG は brand/favicon.svg を画像にしたもの）
if (fs.existsSync(path.join(ROOT, "brand", "icons"))) fs.cpSync(path.join(ROOT, "brand", "icons"), path.join(OUT, "images", "icons"), { recursive: true });
if (fs.existsSync(path.join(ROOT, "brand", "favicon.svg"))) fs.copyFileSync(path.join(ROOT, "brand", "favicon.svg"), path.join(OUT, "favicon.svg"));
fs.writeFileSync(path.join(OUT, "manifest.webmanifest"), JSON.stringify({
  name: "ガチャプラネット", short_name: "ガチャプラネット", description: site.description, lang: "ja",
  start_url: "/?src=pwa", scope: "/", display: "standalone", background_color: "#f6f8ff", theme_color: "#f6f8ff",
  icons: [192, 512].map((n) => ({ src: `/images/icons/icon-${n}.png`, sizes: `${n}x${n}`, type: "image/png", purpose: "any" }))
    .concat([{ src: "/images/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }]),
}, null, 1));
if (fs.existsSync(path.join(ROOT, "images"))) fs.cpSync(path.join(ROOT, "images"), path.join(OUT, "images"), { recursive: true });
fs.mkdirSync(path.join(OUT, "images", "og"), { recursive: true });
if (fs.existsSync(path.join(ROOT, "brand", "header.png"))) fs.copyFileSync(path.join(ROOT, "brand", "header.png"), path.join(OUT, "images", "og", "site.png"));
// SNSの共有画像（1200×630。Xのカードは横長すぎる画像だと出ないため）
if (fs.existsSync(path.join(ROOT, "brand", "og-site.jpg"))) fs.copyFileSync(path.join(ROOT, "brand", "og-site.jpg"), path.join(OUT, "images", "og", "site.jpg"));
// 外国語版のSNS画像（キャッチコピーをその言語にしたもの。brand/og-site-{lang}.jpg があれば使う）
const OG_SITE_LANGS = new Set();
for (const l of ["en", "ko", "zh-cn", "zh-tw"]) {
  const src = path.join(ROOT, "brand", `og-site-${l}.jpg`);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(OUT, "images", "og", `site-${l}.jpg`));
  OG_SITE_LANGS.add(l);
}

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

// トップの入荷速報用の軽い商品一覧（先月以降に発売・発売予定だけ。カードに出す項目だけ）。診断用の quiz-<lang>.json と同じ中身の一部
{
  const from = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const recent = items.filter((it) => (it.release || "") >= from);
  for (const lang of LANGS) {
    write(`data/recent-${lang}.json`, JSON.stringify(recent.map((it) => ({
      id: it.id, name: nameOf(it, lang), price: it.price, lineup: it.lineup, image: thumbOf(it.image),
      genre_label: genreLabel(genreOf(it.genre), lang), release_label: T[lang].month(it.release),
    }))));
  }
}

// デザイン・動きのファイルが変わったら、ブラウザに古いものが残らないよう番号を付ける
const crypto = require("crypto");
const ver = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(__dirname, f))).digest("hex").slice(0, 8);
const QUIZ_V = crypto.createHash("md5").update(JSON.stringify(rawItems) + JSON.stringify(votes) + JSON.stringify(titles) + JSON.stringify(site)).digest("hex").slice(0, 8);
const CSS_V = ver("style.css");
const JS_V = ver("app.js");

// 本文は端末の日本語フォント。Googleのフォントは見出し用の太さだけ読む（Zen Maru Gothic 700・Nunito 700・Fredoka 600）
const FONTS = "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@700&family=Nunito:wght@700&family=Fredoka:wght@600&display=swap";
// 言語ごとのフォント（繁体字は丸ゴシックの「粉圓 Huninn」、韓国語は丸くてかわいい「Jua」を見出しに。中国本土向けはGoogleのフォントを使わない）
const FONTS_OF = (lang) => lang === "zh-tw" ? "https://fonts.googleapis.com/css2?family=Nunito:wght@700&family=Fredoka:wght@600&family=Huninn&display=swap"
  : lang === "ko" ? "https://fonts.googleapis.com/css2?family=Nunito:wght@700&family=Fredoka:wght@600&family=Jua&display=swap" : FONTS;

/* ================= 言語ごとにページを作る ================= */
for (const lang of LANGS) {
  const t = T[lang];

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

  // eager：商品ページの大きい画像（元の画像・最優先）。load："high"＝一覧の1枚目（先に読む）、"eager"＝一覧の最初の数枚（遅延読み込みしない）
  const thumb = (it, R, { eager = false, badge = true, load = "" } = {}) => {
    const src = eager ? imgURL(it, R) : imgURL({ image: thumbOf(it.image) }, R);
    const img = src
      ? `<img src="${esc(src)}" alt="${esc(nameOf(it, lang))}" width="400" height="400" ${eager ? 'fetchpriority="high"' : load === "high" ? 'loading="eager" fetchpriority="high"' : load === "eager" ? 'loading="eager"' : 'loading="lazy"'} decoding="async">`
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
      if (d === THIS_MON) return lang === "ja" ? `<em class="rel-st rel-now">今週発売</em>` : `<em class="rel-st rel-now">${t.x.relNow}</em>`;
      if (d > THIS_MON) return lang === "ja" ? `<em class="rel-st rel-soon">${w.getUTCMonth() + 1}/${w.getUTCDate()}〜発売</em>` : `<em class="rel-st rel-soon">${t.x.relFrom(w.getUTCMonth() + 1, w.getUTCDate())}</em>`;
      return lang === "ja" ? `<span class="rel-st">発売中</span>` : `<span class="rel-st">${t.x.relOut}</span>`;
    }
    if (it.release > NOW_YM) return lang === "ja" ? `<em class="rel-st rel-soon">${+it.release.slice(5)}月発売予定</em>` : `<em class="rel-st rel-soon">${t.month(it.release)}</em>`;
    return `<span>${t.month(it.release)}</span>`;
  };
  // 商品ページの価格の横に出す発売の状態（発売週がわからない過去の商品も「発売中」）
  const relPill = (it) => {
    const s = relLabel(it);
    return /class="rel-st/.test(s) ? s.replace("rel-st", "rel-st rel-pill") : `<span class="rel-st rel-pill">${it.release < NOW_YM ? t.u.relOut : esc(t.month(it.release))}</span>`;
  };
  // 検索の候補・マイリストで使う、発売の状態の文言（{m}{d} はブラウザで置きかえる）
  const REL_JS = lang === "ja" ? { now: "今週発売", from: "{m}/{d}〜発売", out: "発売中" } : { now: t.x.relNow, from: t.x.relFrom("{m}", "{d}"), out: t.x.relOut };
  // X のフォロー案内（シェアボタンではない）。日本語は @gachapla、ほかの言語は海外向けの @gacha_jpn
  const xAcc = String((lang === "ja" ? site.x_account : site.x_account_en || site.x_account) || "").replace(/^@/, "");
  const X_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
  // 中国語・韓国語は X ではなく Threads・Instagram の @gacha_pla を案内する（文言は i18n の u.snsTxt・u.snsCta）
  const SNS = XL.includes(lang) && t.u.snsTxt ? { threads: "https://www.threads.net/@gacha_pla", insta: "https://www.instagram.com/gacha_pla/", acc: "gacha_pla" } : null;
  const AT_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const followCard = () => SNS ? `<a class="x-follow" href="${SNS.threads}" target="_blank" rel="noopener"><span class="xf-ic">${AT_SVG}</span><span class="xf-t">${esc(t.u.snsTxt)}</span><span class="xf-go">${esc(t.u.snsCta(SNS.acc))} →</span></a>`
    : xAcc ? `<a class="x-follow" href="https://x.com/${esc(xAcc)}" target="_blank" rel="noopener"><span class="xf-ic">${X_SVG}</span><span class="xf-t">${esc(t.u.followTxt)}</span><span class="xf-go">${esc(t.u.followCta(xAcc))} →</span></a>` : "";
  const FOLLOW_AFTER = new Set(["week.html", "next-week.html", "new.html", "lottery.html"]);
  // i：一覧の中の順番を渡すと、最初の4枚は遅延読み込みしない（1枚目は先に読む）。渡さなければ全部遅延読み込み
  // 値段が0（未定）の商品は「¥0」ではなく「価格未定」
  const priceTxt = (p) => (Number(p) > 0 ? `¥${p}` : esc(t.u.priceTba || T.en.u.priceTba));
  const card = (it, c, i = -1) => `<a class="card" href="${c.H}item/${it.id}.html">
  ${thumb(it, c.R, { load: i === 0 ? "high" : i > 0 && i < 4 ? "eager" : "" })}
  <div class="card-meta">${esc(genreLabel(genreOf(it.genre), lang))}</div>
  <div class="card-name">${esc(nameOf(it, lang))}</div>
  <div class="card-foot"><span><b>${priceTxt(it.price)}</b>${it.lineup ? ` / ${t.lineup(it.lineup)}` : ""}</span>${relLabel(it)}</div>
</a>`;

  const layout = ({ rel, title, description, body, jsonld = [], ogImage = "", ogType = "website", current = "", jaOnly = false, extraHead = "", noindex = false, noAlt = false, lastmod = "", alts = null, only = null }) => {
    // この内容がある言語（hreflang と言語メニューに使う）
    const ALT = jaOnly ? ["ja"] : alts || LANGS;
    const c = ctx(rel);
    const fragment = PREVIEW && lang === "ja" && rel === "index.html";
    const fullTitle = rel === "index.html" ? (lang !== "ja" ? t.x.idxTitle : `ガチャガチャ新作・発売日一覧【${YM_NOW}最新】在庫店・入荷速報｜ガチャプラネット`) : `${title}${lang === "ja" ? "｜ガチャプラネット" : `${t.titleSep || " | "}${site.name}`}`;
    // 反対の言語の同じページへのリンク
    const toLang = (l) => { const base = c.R + (l === "ja" ? "" : `${l}/`); return (jaOnly && l !== "ja") || (only && !only.includes(l)) ? `${base}index.html` : `${base}${rel}`; }; // only：そのページがある言語だけ（ほかの言語はトップへ）
    const langMenu = `<details class="lang-menu"><summary aria-label="Language">🌐 <span>${LANG_META[lang].label}</span></summary><div class="lang-list">${LANGS.map((l) => `<a href="${toLang(l)}" hreflang="${LANG_META[l].hreflang}" lang="${LANG_META[l].html}"${l === lang ? ' aria-current="true"' : ""}>${LANG_META[l].label}</a>`).join("")}</div></details>`;
    const ld = jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n");
    // 「@」は日本語だけのページ（サイト直下）。外国語では抽選・高評価店は出さず、マップ・ガチャ活には「(JP)」を付ける
    const NAV = [["new.html", "new"], ["week.html", "week"], ["index.html#ranking", "ranking"], ["calendar.html", "calendar"], ["@lottery.html", "lottery"], ["@map.html", "map"], ["@gachakatsu.html", "katsu"], ["@toprated.html", "toprated"], ["index.html#types", "genre"], ["faq.html", "faq"]]
      .filter(([, k]) => lang === "ja" || !["lottery", "toprated", "katsu"].includes(k))
      // 外国語：日本語だけのマップの代わりに、駅からさがすお店の一覧へ
      .map((e) => (lang !== "ja" && e[1] === "map" ? ["station.html", "station"] : e));
    const JP_TAG = { en: " (JP)", "zh-cn": "（日文）", "zh-tw": "（日文）", ko: " (일본어)" };
    const navLabel = (h, s) => s + (h[0] === "@" && lang !== "ja" ? JP_TAG[lang] || " (JP)" : "");
    const head = `<title>${esc(fullTitle)}</title>
${fragment ? '<meta name="claude:viewport-fit-sides" content="cover">' : ""}
<meta name="site-lang" content="${lang}">${I18N[lang] && I18N[lang].appM ? `\n<script>window.__M=${JSON.stringify(I18N[lang].appM).replace(/</g, "\\u003c")};</script>` : ""}
${lang === "en" && site.vc_linkswitch_pid ? `<script>var vc_pid = "${esc(site.vc_linkswitch_pid)}";</script><script src="//aml.valuecommerce.com/vcdal.js" async></script>` : ""}
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical(lang, rel))}">
${noindex ? `<meta name="robots" content="noindex, follow">\n` : /name="robots"/.test(extraHead) ? "" : `<meta name="robots" content="max-image-preview:large">\n`}${noindex || noAlt || ALT.length < 2 ? "" : ALT.flatMap((l) => [LANG_META[l].hreflang, ...(LANG_META[l].extra || [])].map((code) => `<link rel="alternate" hreflang="${code}" href="${esc(canonical(l, rel))}">`)).join("\n") + `\n<link rel="alternate" hreflang="x-default" href="${esc(canonical(xDefault(rel, ALT), rel))}">`}
${site.naver_verification ? `<meta name="naver-site-verification" content="${esc(site.naver_verification)}">\n` : ""}${site.baidu_verification ? `<meta name="baidu-site-verification" content="${esc(site.baidu_verification)}">\n` : ""}${site.bing_verification ? `<meta name="msvalidate.01" content="${esc(site.bing_verification)}">\n` : ""}${lang === "zh-cn" ? `<meta http-equiv="content-language" content="zh-CN">
<meta http-equiv="Cache-Control" content="no-transform">
<meta http-equiv="Cache-Control" content="no-siteapp">
<meta name="applicable-device" content="pc,mobile">
<meta name="keywords" content="日本扭蛋,扭蛋新品,扭蛋店,扭蛋发售日,GACHA PLANET">\n` : ""}${lang === "zh-tw" ? `<meta property="og:locale:alternate" content="zh_HK">\n` : ""}<link rel="alternate" type="application/rss+xml" title="${esc(site.name)}" href="${esc(SITE_URL + "/" + langDir(lang) + "rss.xml")}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="${t.ogLocale}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${esc(canonical(lang, rel))}">
<meta property="og:image" content="${esc(ogImage || `${SITE_URL}/images/og/${OG_SITE_LANGS.has(lang) ? `site-${lang}` : "site"}.jpg`)}">
<meta name="twitter:card" content="summary_large_image">
${xAcc ? `<meta name="twitter:site" content="@${esc(xAcc)}">` : ""}
<meta name="theme-color" content="#f6f8ff">
<link rel="icon" href="${c.R}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${c.R}images/icons/icon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${c.R}images/icons/apple-touch-icon.png">
<link rel="manifest" href="${c.R}manifest.webmanifest">
${lang === "zh-cn" ? "" : `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_OF(lang)}" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="${FONTS_OF(lang)}"></noscript>`}
<link rel="stylesheet" href="${c.R}assets/style.css?v=${CSS_V}">
${extraHead}
${ld}`;
    const content = `${site.sample_mode ? `<div class="sample-bar">${t.sampleBar}</div>` : ""}
<header class="site-header"><div class="wrap">
  <a class="logo logo-b3" href="${c.H}index.html" aria-label="${esc(site.name)} ${t.logoAria}"><svg class="logo-pl" viewBox="0 0 48 48" aria-hidden="true"><defs><clipPath id="lgcp"><circle cx="24" cy="24" r="14"/></clipPath></defs><ellipse cx="24" cy="25" rx="22" ry="7" fill="none" stroke="#3aa0ff" stroke-width="3" transform="rotate(-18 24 25)"/><g clip-path="url(#lgcp)"><rect x="8" y="8" width="32" height="15" fill="#ff5c8a"/><rect x="8" y="23" width="32" height="2.4" fill="#fff"/><rect x="8" y="25.4" width="32" height="16" fill="#ffc23c"/></g><path d="M4.5 31 A22 7 -18 0 0 44 19" fill="none" stroke="#3aa0ff" stroke-width="3"/></svg><span class="logo-txt">${lang === "ja" ? `<span class="logo-small">GACHA PLANET</span><span class="logo-main">ガチャプラネット</span>` : `<span class="logo-small">${esc(t.tagline)}</span><span class="logo-main logo-main-en">GACHA PLANET</span>`}</span></a>
  <nav class="nav" aria-label="${t.navAria}">${NAV.map(([h, k]) => `<a href="${h[0] === "@" ? c.R + h.slice(1) : c.H + h}"${k === current ? ' aria-current="page"' : ""}>${t.navShort && t.navShort[k] ? `<span class="nl">${navLabel(h, t.nav[k])}</span><span class="ns">${navLabel(h, t.navShort[k])}</span>` : navLabel(h, t.nav[k])}</a>`).join("")}</nav>
  <form class="search" role="search" action="${c.H}search.html" data-index="${c.R}data/search-${lang}.json" data-home="${c.H}" data-root="${c.R}" data-chara="${c.R}data/chara-${lang}.json?v=${QUIZ_V}" data-chara-tpl="${esc(t.u.charaHit)}" data-rel="${esc(JSON.stringify(REL_JS))}">
    <input type="search" name="q" id="search-q" placeholder="${t.searchPh}" aria-label="${t.searchAria}" autocomplete="off" enterkeyhint="search">
    <div class="search-pop" id="search-pop" hidden></div>
  </form>
  <a class="hd-fav" href="${c.H}mylist.html" aria-label="${esc(t.u.mylist)}" title="${esc(t.u.mylist)}" data-add="${esc(t.u.saveAria)}" data-del="${esc(t.u.unsaveAria)}" data-save="${esc(t.u.save)}" data-saved="${esc(t.u.saved)}"><span aria-hidden="true">★</span><b class="hd-fav-n" hidden></b></a>
  ${langMenu}
</div></header>
<main>${body}${FOLLOW_AFTER.has(rel) ? `\n<div class="wrap follow-end">${followCard()}</div>` : ""}</main>
<footer class="site-footer"><div class="wrap">
  ${SNS ? `<a class="foot-x" href="${SNS.threads}" target="_blank" rel="noopener">${AT_SVG}<span>${esc(t.u.snsTxt)} → <b>Threads @${SNS.acc}</b></span></a><a class="foot-x" href="${SNS.insta}" target="_blank" rel="noopener">${AT_SVG}<span><b>Instagram @${SNS.acc}</b></span></a>` : xAcc ? `<a class="foot-x" href="https://x.com/${esc(xAcc)}" target="_blank" rel="noopener">${X_SVG}<span>${esc(t.u.followTxt)} → <b>${esc(t.u.followCta(xAcc))}</b></span></a>` : ""}
  <div>© ${nowJST.getUTCFullYear()} ${esc(site.name)}</div>
  <nav aria-label="${t.footAria}"><a href="${c.H}faq.html">${t.nav.faq}</a><a href="${c.H}about.html">${t.about}</a>${lang === "ja" ? `<a href="${c.H}privacy.html">プライバシーポリシー</a>` : ""}<a href="${c.H}calendar.html">${t.nav.calendar}</a><a href="${c.H}station.html">${lang === "ja" ? "駅からさがす" : t.stn.footer}</a>${lang === "ja" ? `<a href="${c.H}collection.html">シリーズ一覧</a><a href="${c.H}saihan.html">再販・復刻</a><a href="${c.H}stats.html">新作の統計</a><a href="${c.H}ranking.html">人気ランキング</a><a href="${c.H}limited.html">オフィシャルショップ限定</a>` : lang === "en" ? `<a href="${c.H}collection.html">${t.hub.seriesFoot}</a><a href="${c.H}saihan.html">${t.hub.reissueFoot}</a><a href="${c.H}stats.html">Stats</a>` : ""}</nav>
  <nav class="foot-langs" aria-label="Language">${LANGS.map((l) => `<a href="${toLang(l)}" hreflang="${LANG_META[l].hreflang}" lang="${LANG_META[l].html}">${LANG_META[l].label}</a>`).join("")}</nav>
  <p class="disclosure">${t.disclosure}</p>
</div></footer>
<script src="${c.R}assets/app.js?v=${JS_V}" defer></script>${site.ga4_id ? `
<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(site.ga4_id)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${esc(site.ga4_id)}");</script>` : ""}`;
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
    pages.push([lang, rel, noAlt ? [lang] : ALT, noindex, lastmod, ogType === "product" ? ogImage : ""]);
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

    // 駅からさがす・人気シリーズ（外国語は「今週発売」のすぐ下に、日本語は下の方）
    const homeStnSeries = `  ${(() => { const pick = ["akihabara", "ikebukuro", "shinjuku", "shibuya", "harajuku", "umeda", "namba", "hakata", "sapporo"].map((s) => STATIONS.find((x) => x.slug === s)).filter(Boolean); return pick.length ? `<section class="section section-tight" id="stations">
    <div class="section-head"><h2>${lang === "ja" ? "駅からガチャのお店をさがす" : t.stn.homeH}</h2></div>
    <div class="chara-list">${pick.map((x) => `<a class="chara-chip" href="${c.H}station/${x.slug}.html">${esc((x[lang] || x.en).replace(/[（(].*?[）)]/g, "").trim().replace(/(駅| Station|站|역)$/, ""))}<small>${x.count}</small></a>`).join("")}<a class="chara-chip chara-more" href="${c.H}station.html">${lang === "ja" ? "駅をすべて見る →" : t.stn.allStations}</a></div>
  </section>` : ""; })()}

  <section class="section section-tight" id="series">
    <div class="section-head"><h2>${lang === "ja" ? "人気シリーズ" : t.x.popSeries}</h2></div>
    <div class="series-tiles">${SERIES.map((sr) => { const n = seriesItems(sr).length; return n ? `<a class="st st-${sr.slug}" href="${c.H}chara/${sr.slug}.html"><span class="st-e" aria-hidden="true">${sr.emoji}</span><span class="st-l">${lang === "ja" ? sr.label : (I18N_CHARA[lang] && I18N_CHARA[lang][sr.en]) || sr.en}</span><span class="st-n">${t.series(n)}</span></a>` : ""; }).join("")}</div>
    <div class="chara-list chara-list-top">${CHARAS.slice(0, 15).map((ch) => `<a class="chara-chip" href="${c.H}chara/${ch.slug}.html">${esc(charaLabel(ch, lang))}<small>${ch.list.length}</small></a>`).join("")}<a class="chara-chip chara-more" href="${c.H}chara.html">${lang === "ja" ? "キャラクター・作品をすべて見る →" : t.x.allChara}</a></div>
  </section>

`;
    const body = `
<div class="wrap">
  <section class="hero">
    <div class="hero-intro">
      <div class="hero-text">
        <h1 class="hero-h1">${esc(t.u.homeH1(YM_NOW_EN)).replace(/\s*([【（(][^【（(]*)$/, ' <span class="h1-ym">$1</span>')}</h1>
        <p class="hero-lead">${t.heroLead}</p>
        ${lang !== "ja" ? `<div class="item-actions"><a class="btn btn-gold" href="${c.H}station.html">${esc(t.stn.heroBtn)} →</a><a class="btn" href="${c.H}week.html">${t.x.weekH} →</a></div>` : ""}
        <div class="hero-planet" aria-hidden="true"><i class="ring"></i><i class="orb"></i><i class="ring ring-front"></i><i class="moon"></i></div>
        <p class="hero-sub">${t.heroSub}</p>
        <dl class="hero-stats">
          ${[items.length, releasingNow, stockedStores].map((n, i) => `<div><dt>${t.stats[i]}</dt><dd>${n.toLocaleString("en-US")}</dd></div>`).join("")}
        </dl>
      </div>
    </div>
  ${WEEK.items.length ? `<section class="section section-tight" id="thisweek">
    <div class="section-head"><h2>${lang !== "ja" ? t.x.weekH : "今週発売のガチャ"}</h2><a class="more" href="${c.H}week.html">${lang !== "ja" ? t.x.weekMore(lang === "en" ? enRange(WEEK.range) : WEEK.range.replace("〜", "–"), WEEK.items.length) : `${WEEK.range}・全${WEEK.items.length}件`}</a></div>
    <div class="grid row-scroll">${WEEK.items.slice(0, 12).map((it, i) => card(it, c, i)).join("")}<a class="card see-all" href="${c.H}week.html"><span class="see-all-in"><b>${lang !== "ja" ? t.x.seeAll : "全部見る"}</b><span>→</span></span></a></div>
  </section>` : ""}
  </section>
  ${lang !== "ja" ? homeStnSeries : ""}

  <section class="section" id="new">
    <div class="section-head"><h2>${t.newTitle}</h2><span><a class="more" href="${c.H}week.html">${lang !== "ja" ? t.x.thisWeek : "今週発売"}</a>　<a class="more" href="${c.H}calendar.html">${t.toCalendar}</a></span></div>
    <div class="grid row-scroll">${newest.map((it) => card(it, c)).join("")}<a class="card see-all" href="${c.H}new.html"><span class="see-all-in"><b>${lang !== "ja" ? t.x.seeAll : "全部見る"}</b><span>→</span></span></a></div>
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
      <span style="min-width:0"><span class="card-name">${esc(nameOf(it, lang))}</span><span class="card-foot"><span><b>${priceTxt(it.price)}</b></span><span>${heartsOf(it) ? `<em class="hearts">♥ ${heartsOf(it)}</em>` : t.month(it.release)}</span></span></span>
    </a></li>`).join("")}</ol>
    ${ranking.length > 5 ? `<p class="more-wrap"><button type="button" class="btn" id="rank-more">${t.showMore}</button></p>` : ""}
  </section>

  <div class="section section-tight home-extra">
    ${followCard()}
    <a class="katsu-banner" href="${c.R}gachakatsu.html">
      <span class="kb-art" aria-hidden="true"><i class="kb-dot a">1</i><i class="kb-dot b">2</i><i class="kb-dot c">3</i><svg viewBox="0 0 120 60"><path d="M10 50 C 35 10, 60 55, 85 18 S 112 30, 112 30" fill="none" stroke="#3aa0ff" stroke-width="3" stroke-dasharray="6 6"/></svg></span>
      <span class="kb-text"><b>${lang !== "ja" ? t.x.kbTitle : "NEW｜ガチャ活しよう！"}</b><span>${lang !== "ja" ? t.x.kbText : "近くのガチャのお店を、いちばん効率よく回るルートを自動で作成。お店の数・時間・目的地までの寄り道から選べます。"}</span></span>
      <span class="kb-go">${lang !== "ja" ? t.x.kbGo : "ルートを作る →"}</span>
    </a>
    <form class="quiz" id="quiz" aria-labelledby="quiz-title">
      <div class="quiz-head">
        <h2 id="quiz-title">${t.quizTitle}</h2>
        <span class="quiz-step" id="quiz-step" aria-live="polite"></span>
      </div>
      <div class="quiz-bar" aria-hidden="true"><i id="quiz-bar"></i></div>
      <div class="quiz-qs">
      <fieldset data-first><legend><b>1</b>${t.qGroups}</legend>
        <p class="q-hint">${t.groupsHint}</p>
        <div class="groups">${(site.quiz_groups || []).map((g) => `<div class="grp" data-group="${g.slug}">
          <label class="grp-main"><input type="checkbox" name="group" value="${g.slug}"><span>${qLabel(g, lang)}</span></label>
          <button type="button" class="grp-more" aria-expanded="false" aria-controls="sub-${g.slug}" data-more="${t.more}" data-less="${t.less}">${t.more}</button>
          <div class="grp-subs" id="sub-${g.slug}" hidden>
            <div class="opts">${liveSubs(g).map((x) => opt("sub", "checkbox", `${g.slug}:${x.slug}`, qLabel(x, lang))).join("")}</div>
            ${liveSubs(g).map((x) => ({ x, leaves: liveLeaves(g, x) })).filter((v) => v.leaves.length > 1).map(({ x, leaves }) => `<div class="leaf-row" data-sub="${g.slug}:${x.slug}" hidden>
              <span class="leaf-label">${t.leafPrefix(qLabel(x, lang))}</span>
              ${leaves.length > LEAF_SHOW ? `<input class="leaf-filter" type="search" placeholder="${t.leafFilter}" aria-label="${t.leafFilter}">` : ""}
              <div class="opts opts-sm${leaves.length > LEAF_SHOW ? " is-clipped" : ""}">${leaves.map((l, i) => opt("leaf", "checkbox", `${g.slug}:${x.slug}:${l.slug}`, `${esc(qLabel(l, lang))}<small>${l.n}</small>`).replace('<label class="opt"', i >= LEAF_SHOW ? '<label class="opt is-extra"' : '<label class="opt"')).join("")}</div>
              ${leaves.length > LEAF_SHOW ? `<p class="leaf-none" hidden>${t.leafNone}</p><button type="button" class="leaf-all">${t.leafAll(leaves.length)}</button>` : ""}
            </div>`).join("")}
          </div>
        </div>`).join("")}</div>
        <label class="oshi-in"><span>${t.oshiLabel}</span><input type="search" name="oshi" placeholder="${t.oshiPh}" autocomplete="off"></label>
      </fieldset>
      <fieldset data-auto data-optional><legend><b>2</b>${t.qGender}<small class="q-opt">${esc(t.u.optional)}</small></legend>
        <div class="opts opts-lg">${t.genders.map(([v, l]) => opt("gender", "radio", v, l)).join("")}</div>
      </fieldset>
      <fieldset data-auto data-optional><legend><b>3</b>${t.qAge}<small class="q-opt">${esc(t.u.optional)}</small></legend>
        <div class="opts opts-lg opts-age">${t.ages.map(([v, l]) => opt("age", "radio", v, l)).join("")}</div>
      </fieldset>
      </div>
      <div class="quiz-nav">
        <button class="btn btn-ghost" type="button" id="quiz-back" hidden>${t.back}</button>
        <button class="btn" type="button" id="quiz-next" hidden data-next="${esc(t.next)}" data-skip="${esc(t.u.skipQ)}">${t.next}</button>
        <button class="btn btn-gold" type="submit" id="quiz-submit">${t.quizBtn}</button>
      </div>
    </form>
  </div>

  <section class="section" id="results" hidden aria-live="polite">
    <div class="section-head"><h2>${t.results}</h2>
      <div class="sortbar" role="group" aria-label="${t.sortAria}">${t.sorts.map(([v, l], i) => `<button type="button" class="sort${i === 0 ? " is-on" : ""}" data-sort="${v}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>
    </div>
    <p class="results-note" id="results-note"></p>
    <div class="grid" id="results-grid"></div>
    <p class="more-wrap"><button type="button" class="btn" id="results-more" hidden>${t.showMore}</button></p>
  </section>

  ${lang === "ja" ? homeStnSeries : ""}
  <section class="section" id="types">
    <div class="section-head"><h2>${t.typeTitle}</h2></div>
    <div class="genres types">${TYPES.filter((g) => inType(g.slug).length).map((g) => `<a href="${c.H}type/${g.slug}.html"><span class="ja">${phr(typeLabel(g, lang))}</span><span class="n">${t.series(inType(g.slug).length)}</span></a>`).join("")}</div>
  </section>

  <section class="section" id="genres">
    <div class="section-head"><h2>${t.genreTitle}</h2></div>
    <div class="genres">${GENRES.filter((g) => inGenre(g.slug).length).map((g) => `<a href="${c.H}genre/${g.slug}.html"><span class="ja">${phr(genreLabel(g, lang))}</span><span class="n">${t.series(inGenre(g.slug).length)}</span></a>`).join("")}</div>
  </section>
  ${(() => {
    // 下の方のリンク集：月別カレンダー（今月・来月・先月）・メーカー・都道府県のお店
    const calM = (it) => { const s = weekStartOf(it); return s ? s.toISOString().slice(0, 7) : it.release; };
    const months = new Set(items.map(calM));
    const ymOf = (k) => new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth() + k, 1)).toISOString().slice(0, 7);
    const mLinks = [[0, t.u.thisM], [1, t.u.nextM], [-1, t.u.prevM]].map(([k, lab]) => [ymOf(k), lab]).filter(([m]) => months.has(m))
      .map(([m, lab]) => `<a href="${c.H}calendar/${m}.html"><b>${esc(lab)}</b>${esc(t.month(m))}</a>`).join("");
    const mk = new Map(); for (const it of items) mk.set(it.maker, (mk.get(it.maker) || 0) + 1);
    const mkLinks = [...mk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([m, n]) => `<a href="${c.H}maker/${makerSlug(m)}.html">${esc(makerOf(items.find((x) => x.maker === m), lang))}<small>${n}</small></a>`).join("");
    return `<section class="section section-tight home-links" id="home-links">
    ${mLinks ? `<h2 class="hl-h">${esc(t.u.monthsH)}</h2><div class="hl-row">${mLinks}</div>` : ""}
    <h2 class="hl-h">${esc(t.u.makersH)}</h2><div class="hl-row">${mkLinks}</div>
    ${lang === "ja" && t.u.prefsLink ? `<p class="hl-pref"><a href="${c.R}map.html#prefs">${esc(t.u.prefsLink)} →</a></p>` : ""}
  </section>`;
  })()}
</div>
<script type="application/json" id="items-data">${JSON.stringify({ ...embed, _items: undefined }).replace(/</g, "\\u003c")}</script>`;
    write(`data/quiz-${lang}.json`, JSON.stringify(embed._items));

    layout({
      rel: "index.html", title: site.name, lastmod: maxAdded(items),
      // 説明文：日本語は今週・今月の数と最新の名前を足して、ひと目で中身がわかるように（ほかの言語は site.json の長い説明のまま）
      description: lang === "ja" ? `${t.description.replace(/^新作ガチャガチャ/, "新作ガチャガチャ・ガシャポン")}今週発売${WEEK.items.length}件・今月の新作${releasingNow}件。${newest.slice(0, 2).map((it) => `「${it.name}」`).join("")}など最新の情報を毎日更新。` : t.description, body,
      jsonld: [{ "@context": "https://schema.org", "@type": "WebSite", name: site.name, alternateName: ["ガチャプラネット", "GACHA PLANET"], url: canonical(lang, "index.html"), description: t.description, inLanguage: LANG_META[lang].hreflang,
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: canonical(lang, "search.html") + "?q={search_term_string}" }, "query-input": "required name=search_term_string" } },
        { "@context": "https://schema.org", "@type": "Organization", name: site.name, alternateName: "ガチャプラネット", url: SITE_URL + "/", logo: `${SITE_URL}/images/og/site.png`, sameAs: ["https://x.com/gachapla"], foundingDate: "2026-10" }],
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
    // 公式の取扱店データがまだない商品は、バンダイ公式「ガシャポンどこ？」を一番のボタンに
    const whereOfficial = !hasStock && !(OFFICIAL_BY_ITEM.get(it.id) || []).length && it.maker === "バンダイ" && /^https:\/\/gashapon\.jp\//.test(it.store_search_url || "");
    const L0 = shopLinks(it);
    // 発売の状態（発売前／発売から60日より前）で、通販の見出しと並び順を変える。lots：この商品の受付中の抽選（日本語ページだけ）
    const isUp = HUB.isUpcoming(it);
    const isOld = !isUp && daysBetween(weekStartOf(it) ? weekStartOf(it).toISOString().slice(0, 10) : `${it.release}-01`, today) > 60;
    const lots = lang === "ja" ? LOT_BY_ITEM.get(it.id) || [] : [];
    // 発売の状態：up＝発売前（まだお店に置かれない）、old＝発売から時間がたった（上の isOld）、out＝発売中。一番のボタンと下のバーを変える
    const state = isUp ? "up" : isOld ? "old" : "out";
    const SW = t.sameWeek || T.en.sameWeek;
    // 全種そろえる目安（回数と金額。値段が0＝未定のときは回数だけ）
    const compN = Number(it.lineup) || (it.lineup_names || []).length;
    const compD = compN >= 2 && compN <= 40 ? compDraws(compN) : 0;
    const compYen = compD && Number(it.price) > 0 ? (compD * it.price).toLocaleString("ja-JP") : "";
    const related = (() => {
      const seed = hashStr(it.id), chs = charasOf(it);
      const sameChara = items.filter((x) => x !== it && chs.some((ch) => ch.list.includes(x))).sort(byNewest);
      const sameMonth = items.filter((x) => x !== it && x.release === it.release && x.genre === it.genre).sort((a, b) => b.popularity - a.popularity);
      const sameGenre = items.filter((x) => x !== it && x.genre === it.genre).sort(byNewest);
      return [...new Set([...rotate(sameChara, 4, seed), ...rotate(sameMonth, 4, seed >>> 3), ...rotate(sameGenre, 8, seed >>> 6)])].slice(0, 8);
    })();
    // 説明文：発売週とラインナップ名も入れて、ページごとに中身の違う説明にする
    const ws = weekStartOf(it), wi = ws ? weekInfo(ws) : null;
    // 同じ週に発売のガチャ（自分は除く。人気順に最大6件。日本語以外はその言葉の名前があるものだけ）
    const sameWeekList = wi && HUB.weeks.get(wi.key) ? HUB.weeks.get(wi.key).list.filter((x) => x !== it && hasName(x, lang)).sort(byPopular).slice(0, 6) : [];
    const relatedShown = related.filter((x) => !sameWeekList.includes(x));
    let whereLd = null; // 日本語以外の「日本のどこで買える？」のFAQ（下の where-sec で作る）
    const mo =wi ? (lang !== "ja" ? t.x.weekOf(t.month(it.release), wi.range.split("〜")[0]) : `${wi.m}月第${wi.no}週（${wi.range.split("〜")[0]}〜）`) : t.month(it.release);
    const ln = (it.lineup_names || []).slice(0, 3);
    let desc = t.itemDesc(it, name, maker, mo);
    if (ln.length && lang === "ja") desc = desc.replace("のガチャガチャ。", `のガチャガチャ。ラインナップは${ln.join("、")}${it.lineup > ln.length ? "など" : ""}。`);
    if (lots.length) desc = `抽選受付中${lots.length}店。${desc}`;
    // 「このガチャについて」：データにあることだけで2〜4文。言い回しは商品idのハッシュで変える
    const aboutHtml = (() => {
      const A = t.ab, seed = hashStr(it.id), v = (k) => (seed >>> k) & 0xff;
      const n = Number(it.lineup) || (it.lineup_names || []).length;
      const dash = (s) => (A.dash ? s.replace(/〜/g, A.dash) : s);
      const r = ws
        ? { kind: ws.getTime() > THIS_MON ? "wkUp" : ws.getTime() === THIS_MON ? "wkNow" : "wkPast", y: wi.y, m: wi.m, no: wi.no, range: dash(wi.range), month: t.month(`${wi.y}-${String(wi.m).padStart(2, "0")}`) }
        : { kind: it.release > NOW_YM ? "moUp" : it.release === NOW_YM ? "moNow" : "moPast", y: +it.release.slice(0, 4), m: +it.release.slice(5, 7), month: t.month(it.release) };
      const chs = charasOf(it).filter((ch) => ch.slug !== "mejirushi").sort((a, b) => a.list.length - b.list.length);
      const ch = chs[0];
      const lnames = lang === "ja" ? (it.lineup_names || []).slice(0, 3) : [];
      const s = HUB.seqOf.get(it) || HUB.lineSeq.get(it);
      const label = !s ? "" : lang === "ja" ? s.label : s.line ? (lang === "en" ? s.en : "") : HUB.volOf(nameOf(it, lang)).base;
      const shs = (OFFICIAL_BY_ITEM.get(it.id) || []).map((id) => SHOP_BY_ID.get(id)).filter(Boolean);
      const byPref = {};
      for (const x of shs) if (x.pref) byPref[x.pref] = (byPref[x.pref] || 0) + 1;
      // 多い都道府県は2店以上あるところだけ（1店ずつなら「多い」とは書かない）
      const prefTop = Object.entries(byPref).filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const iname = (x) => `<a href="${c.H}item/${x.id}.html">${esc(nameOf(x, lang))}</a>`;
      const d = {
        name: esc(name), maker: esc(maker), price: it.price || 0, n,
        ch: ch ? `<a href="${c.H}chara/${ch.slug}.html">${esc(charaLabel(ch, lang))}</a>` : "", k: ch ? ch.list.length : 0,
        ln: lnames.map(esc).join("、"), more: n > lnames.length,
        label: esc(label), prev: s && s.prev ? iname(s.prev) : "", next: s && s.next ? iname(s.next) : "", nextUp: !!(s && s.next && HUB.isUpcoming(s.next)),
        shops: shs.length, pn: prefTop.length, prefs: A.prefs && prefTop.length ? prefTop.map(([p, k]) => esc(A.pref(p, k))).join(A.prefSep) : "",
      };
      const iv = d.price && d.n ? v(0) % A.intro.length : 0;
      const out = [A.intro[iv](d), A.rel(r, v(3), hubs.isReissue(it))];
      // 残りは2文まで：キャラクター・ラインナップを先に、シリーズと取扱店はハッシュでどちらを先にするか決める
      const extra = [A.chara(d, v(6)), ...(v(9) % 2 ? [d.shops ? A.shops(d, v(12)) : "", A.series(d, v(15))] : [A.series(d, v(15)), d.shops ? A.shops(d, v(12)) : ""])].filter(Boolean);
      out.push(...extra.slice(0, 2));
      return `<section class="section section-tight about-item"><h2>${esc(A.h)}</h2><p>${out.join(lang === "en" || lang === "ko" ? " " : "")}</p></section>`;
    })();

    // 通販・フリマのチップ（スマホで最初の画面に入るよう、価格のすぐ下に置く。JANコードは元の場所＝ボタンの下）
    const chipsHtml = lang !== "ja" ? (() => { const O = overseas(it); const L = shopLinks(it); const XLG = lang !== "en"; const b = [
        // 中国語・韓国語：Amazon OneLink の対象外なので日本のAmazon（簡体字は中国語表示で開く）。eBay は出さない
        XLG ? ["sl-amz", L.amazon + ({ "zh-cn": "&language=zh_CN", "zh-tw": "&language=zh_TW", ko: "&language=ko_KR" }[lang] || ""), "Amazon Japan"] : ["sl-amz", O.amazon || L.amazon, O.amazon ? "Amazon" : "Amazon Japan"],
        // 英語：日本に来ている旅行者は日本のAmazonでも買える（ホテル・コンビニ受け取り）
        ...(!XLG && O.amazon ? [["sl-amz", L.amazon + "&language=en_US", "Amazon Japan"]] : []),
        ...(!XLG && O.ebay ? [["sl-ebay", O.ebay, "eBay"]] : []),
        ...(O.buyee ? [["sl-buyee", O.buyee, "Buyee (Mercari Japan)"]] : []),
        ["sl-rak", L.rakuten, "Rakuten Japan"],
      ]; return `<div class="shop-links"><span class="sl-pr">PR</span>${b.map(([k, u, l]) => `<a class="sl ${k}" href="${esc(u)}" target="_blank" rel="sponsored nofollow noopener">${l}</a>`).join("")}</div>`; })() : (() => { const L = shopLinks(it); return `<div class="shop-links">${SW.chips ? `<span style="font-size:12.5px;font-weight:700;color:var(--text-2)">${esc(SW.chips)}</span>` : ""}<span class="sl-pr">PR</span><a class="sl sl-rak" href="${esc(L.rakuten)}" target="_blank" rel="sponsored nofollow noopener">楽天市場</a><a class="sl sl-amz" href="${esc(L.amazon)}" target="_blank" rel="sponsored nofollow noopener">Amazon</a><a class="sl sl-yah" href="${esc(L.yahoo)}" target="_blank" rel="sponsored nofollow noopener">Yahoo!ショッピング</a><a class="sl sl-mer" href="${esc(L.mercari)}" target="_blank" rel="${L.mercariAf ? "sponsored nofollow noopener" : "noopener"}">${esc(L.mercariLabel)}</a></div>`; })();
    const janHtml = L0.jan ? (lang !== "ja" ? `<p class="jan">JAN: <span>${L0.jan}</span></p>` : `<p class="jan">JANコード：<span>${L0.jan}</span></p>`) : "";
    const body = `
<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.H}genre/${g.slug}.html">${gl}</a><span>/</span><span>${esc(name)}</span></nav>
  <article class="item">
    <div>${thumb(it, c.R, { eager: true })}</div>
    <div>
      <h1>${esc(name)}</h1>
      ${lang !== "ja" && it.name_en ? `<p class="name-ja" lang="ja">${esc(it.name)}</p>` : ""}
      <div class="price"><small>${lang === "ja" && it.price > 0 ? t.perPlay : ""}</small><b>${priceTxt(it.price)}</b><span>${lang !== "ja" && it.price > 0 ? t.perPlay : ""}${it.lineup ? `${lang !== "ja" && it.price > 0 ? " · " : ""}${t.lineup(it.lineup)}` : ""}</span>${relPill(it)}</div>
      ${chipsHtml}
      <dl class="spec">
        <dt>${t.maker}</dt><dd><a href="${c.H}maker/${makerSlug(it.maker)}.html">${esc(maker)}</a></dd>
        <dt>${t.release}</dt><dd><a href="${c.H}calendar/${ws ? ws.toISOString().slice(0, 7) : it.release}.html">${t.month(it.release)}</a>${lang === "ja" && it.release_note ? (ws ? `<a class="rel-note" href="${c.H}${hubs.weekRel(wi)}">${esc(it.release_note)}</a>` : `<span class="rel-note">${esc(it.release_note)}</span>`) : ""}</dd>
        ${it.age_min ? `<dt>${t.ageLabel}</dt><dd>${t.ageMin(it.age_min)}</dd>` : ""}
        <dt>${t.genre}</dt><dd><a href="${c.H}genre/${g.slug}.html">${gl}</a></dd>
        ${tags.length ? `<dt>${t.tags}</dt><dd><div class="tags">${tags.map((x) => `<span class="chip chip-ai">${esc(x)}</span>`).join("")}</div></dd>` : ""}
      </dl>
      ${description ? `<p class="desc">${esc(description)}</p>` : ""}
      <div class="item-actions"${state === "up" ? ' id="notify" style="scroll-margin-top:24px"' : ""}>
        ${state === "up" ? `<button type="button" class="btn btn-gold" data-fav="${it.id}" aria-pressed="false"><i aria-hidden="true" style="font-style:normal">★</i><span>${esc(t.u.save)}</span></button>` /* 発売前：まだお店に置かれないので、一番のボタンは★保存（下の「発売日にお知らせ」を押しても★に入る） */
        : whereOfficial ? `<a class="btn btn-gold" href="${esc(it.store_search_url)}" target="_blank" rel="noopener">${esc(t.u.whereBtn)}</a>
        <a class="btn btn-sub" href="#stock">${esc(t.u.findLater)}</a>` : `<a class="btn btn-gold" href="#stock">${t.findStores}</a>`}
        ${state === "up" ? pushBox(t, "item", it.id) : ""}
        ${it.official_url ? `<a class="btn" href="${esc(it.official_url)}" target="_blank" rel="noopener">${t.official}</a>` : ""}
        ${state === "up" ? "" : `<button type="button" class="fav-item" data-fav="${it.id}" aria-pressed="false"><i aria-hidden="true">★</i><span>${esc(t.u.save)}</span></button>`}
        <button type="button" class="heart" data-vote="${c.R}api/vote/${it.id}" data-id="${it.id}" aria-label="${t.heartAria}" title="${t.heartNote}"><i aria-hidden="true">♥</i><span>${t.heart}</span><b>${heartsOf(it)}</b></button>
      </div>
      ${janHtml}
    </div>
  </article>
  ${aboutHtml}
  ${(() => {
    // 通販（Amazon・楽天）とフリマの2つの案内。発売前は「予約」の見出し、発売から60日より前はフリマを先に（コンプセットが売り切れがちなため）
    // 日本語以外：メルカリ・ヤフオク・ラクマは日本の住所がないと使えないので、Buyee のリンクがないときは出さず、代理購入の案内を1文だけ
    const O = overseas(it);
    const shopAside = `<aside class="buy" id="buy" aria-label="${t.buyAria}">
      <div>
        ${lang === "ja" && state !== "up" && compD ? `<p class="comp-cost" style="margin:0 0 10px">${SW.comp(compN, compD, compYen)}</p>` : ""}
        <h2 style="font-size:20px">${isUp && t.buyTitleUp ? t.buyTitleUp : t.buyTitle}<span class="pr">${lang === "ja" ? "PR・広告" : "PR"}</span></h2>
        <p>${isUp && t.buyLeadUp ? t.buyLeadUp : t.buyLead}</p>
      </div>
      <div class="btns">
        ${lang === "en" && O.amazon ? `<a class="btn btn-gold" href="${esc(O.amazon)}" target="_blank" rel="sponsored nofollow noopener">Search on Amazon</a><a class="btn" href="${esc(aff.amazon + "&language=en_US")}" target="_blank" rel="sponsored nofollow noopener">Amazon Japan (in Japan)</a>` : `<a class="btn btn-gold" href="${esc(aff.amazon + ({ "zh-cn": "&language=zh_CN", "zh-tw": "&language=zh_TW", ko: "&language=ko_KR" }[lang] || ""))}" target="_blank" rel="sponsored nofollow noopener">${t.amazon}</a>`}
        ${lang !== "ja" && O.ebay ? `<a class="btn" href="${esc(O.ebay)}" target="_blank" rel="sponsored nofollow noopener">Search on eBay</a>` : ""}
        <a class="btn" href="${esc(aff.rakuten)}" target="_blank" rel="sponsored nofollow noopener">${t.rakuten}</a>
      </div>
    </aside>`;
    // メルカリ：公式ツールで作ったリンクがある商品だけ、そのURLをそのまま使う（PR表示つき）。なければふつうの検索ページ
    const merc = lang === "ja" && L0.mercariAf ? `<a class="btn" href="${esc(L0.mercari)}" target="_blank" rel="sponsored nofollow noopener">${t.mercari}<span class="pr">PR</span></a>` : `<a class="btn" href="https://jp.mercari.com/search?keyword=${encodeURIComponent(it.name)}" target="_blank" rel="noopener">${t.mercari}</a>`;
    const fleaAside = lang !== "ja" && !O.buyee ? (t.fleaProxy ? `<p class="fine buy-note">${esc(t.fleaProxy)}</p>` : "") : `<aside class="buy flea" aria-label="${t.fleaTitle}">
      <div>
        <h2 style="font-size:20px">${isOld && t.fleaTitleOld ? t.fleaTitleOld : t.fleaTitle}</h2>
        <p>${isOld && t.fleaLeadOld ? t.fleaLeadOld : t.fleaLead}</p>
      </div>
      <div class="btns">
        ${lang !== "ja" && O.buyee ? `<a class="btn btn-gold" href="${esc(O.buyee)}" target="_blank" rel="sponsored nofollow noopener">Buy from Mercari Japan via Buyee</a>` : ""}
        ${merc}${[["yahoo", `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(it.name)}`], ["rakuma", `https://fril.jp/s?query=${encodeURIComponent(it.name)}`]]
          .map(([k, u]) => `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">${t[k]}</a>`).join("")}
      </div>
    </aside>`;
    return `<section class="section section-tight buy-sec">
    ${isOld && fleaAside.startsWith("<aside") ? fleaAside + "\n    " + shopAside : shopAside + "\n    " + fleaAside}
  </section>`;
  })()}
  ${hubs.seriesNav(HUB, it, { lang, c, t, nameOf, esc })}
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
      ...(Number(it.price) > 0 ? [[`${it.name}は1回いくら？`, `1回${it.price}円です。`]] : []), // 値段が0＝未定のときは出さない（priceTxt と同じ条件）
      ...(n ? [[`全部で何種類？`, `全${n}種${(it.lineup_names || []).length ? `（${it.lineup_names.slice(0, 4).join("、")}${it.lineup_names.length > 4 ? "など" : ""}）` : ""}です。`]] : []),
      [`発売日はいつ？`, `${whenTxt}の発売です。地域やお店によって並ぶ日が前後します。`],
      [`どこで売ってる？`, whereTxt],
      ...(draws ? [[`全種類そろえるには何回くらい？`, `どれも同じ確率で出るとすると、全${n}種そろうまでに平均で約${draws}回${Number(it.price) > 0 ? `（約${(draws * it.price).toLocaleString("ja-JP")}円）` : ""}かかる計算です。欲しいものが決まっているなら、フリマアプリなどで単品を探すのも手です。`]] : []),
    ];
    return `<section class="section where-sec">
    <div class="panel">
      <h2 style="font-size:22px">${esc(it.name)}はどこで売ってる？</h2>
      <p>${esc(whereTxt)}</p>
      ${shs.length ? `<ul class="where-shops">${(prefTop.length ? prefTop.slice(0, 3).flatMap(([p]) => shs.filter((x) => x.pref === p)) : shs).slice(0, 10).map((x) => `<li><a href="${c.R}shop/${x.id}.html">${esc(x.name)}</a><span>${esc(x.pref || "")}</span></li>`).join("")}</ul>` : ""}
      ${draws ? `<p class="comp-cost">全${n}種そろえる目安：<b>平均 約${draws}回${Number(it.price) > 0 ? `・約${(draws * it.price).toLocaleString("ja-JP")}円` : ""}</b><small>（どれも同じ確率で出る場合の計算）<a href="${esc(aff.rakuten)}" target="_blank" rel="sponsored nofollow noopener">${esc(t.compCompare)} →</a><span class="pr">PR</span></small></p>` : ""}
      <h3 class="arr-h">よくある質問</h3>
      <dl class="item-qa">${qa.map(([q, a]) => `<div><dt>${esc(q)}</dt><dd>${esc(a)}</dd></div>`).join("")}</dl>
    </div>
  </section>`;
  })() : (() => {
    // 日本語以外：駅ページに載っている公式取扱店を、駅の並び順（人気順）→ 近い順で最大8店（1駅2店まで）。クローラーにも見える静的HTML
    const W = t.where, n = Number(it.lineup) || (it.lineup_names || []).length;
    const shs = (OFFICIAL_BY_ITEM.get(it.id) || []).map((id) => SHOP_BY_ID.get(id)).filter(Boolean);
    const cand = shs.map((sh) => ({ sh, so: STATION_OF_SHOP.get(sh.id) })).filter((x) => x.so)
      .sort((a, b) => (a.so.d > 1500) - (b.so.d > 1500) || STATIONS.indexOf(a.so.st) - STATIONS.indexOf(b.so.st) || a.so.d - b.so.d); // 徒歩圏（1.5km以内）を先に
    const perSt = new Map(), rows = [];
    for (const x of cand) { const k = perSt.get(x.so.st) || 0; if (k >= 2) continue; perSt.set(x.so.st, k + 1); rows.push(x); if (rows.length >= 8) break; }
    const stOf = (st) => st[lang] || st.en;
    const stNames = [...new Set(rows.map((x) => stOf(x.so.st)))].slice(0, 3).join(W.sep);
    const qa = [
      ...(it.price ? [[W.qPrice(name), W.aPrice(it.price)]] : []),
      ...(n ? [[W.qCount, W.aCount(n)]] : []),
      [W.qRelease, W.aRelease(mo, isUp)],
      [W.qWhere, shs.length ? W.aWhere(shs.length, stNames) : W.aWhereNone],
    ];
    whereLd = { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: LANG_META[lang].hreflang, mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
    const row = ({ sh, so }) => {
      const chn = CHAIN_BY_SHOP.get(sh.id);
      const [pre, post] = W.walkFrom(walkMin(so.d)).split("{st}").map(esc);
      return `<li><a href="${c.R}shop/${sh.id}.html"${chn ? "" : ' lang="ja"'}>${esc(chn ? chainLabel(chn, lang) : sh.name)}</a><span style="white-space:normal;text-align:right">${pre}<a href="${c.H}station/${so.st.slug}.html">${esc(stOf(so.st))}</a>${post || ""} · <a href="${esc(gmapUrl(sh))}" target="_blank" rel="noopener">${esc(t.stn.gmaps)}</a></span></li>`;
    };
    return `<section class="section where-sec">
    <div class="panel">
      <h2 style="font-size:22px">${esc(W.h(name))}</h2>
      <p>${esc(shs.length ? W.lead(shs.length) : W.none)}</p>
      ${rows.length ? `<ul class="where-shops">${rows.map(row).join("")}</ul>` : ""}
      <h3 class="arr-h">${esc(W.qaH)}</h3>
      <dl class="item-qa">${qa.map(([q, a]) => `<div><dt>${esc(q)}</dt><dd>${esc(a)}</dd></div>`).join("")}</dl>
    </div>
  </section>`;
  })()}
  ${lots.length ? (() => {
    // この商品の抽選販売・整理券（受付中のものだけ。締切が近い順）
    const end = (d) => { const m = String(d).match(/^\d{4}-(\d\d)-(\d\d)T(\d\d):(\d\d)/); return m ? `${+m[1]}/${+m[2]} ${m[3]}:${m[4]}` : d; };
    return `<section class="section section-tight lot-sec">
    <div class="panel">
      <h2 style="font-size:22px">${esc(it.name)}の抽選販売・整理券（受付中${lots.length}店）</h2>
      <p class="fine" style="margin-top:4px">店頭で抽選販売・整理券の受付をしているお店です。応募の前に、お店の公式X・公式サイトで最新の情報をご確認ください。</p>
      <ul class="where-shops lot-item">${lots.map((x) => `<li><span class="lot-item-store">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.store)}</a>` : esc(x.store)}${x.pref ? `<small>${esc(x.pref)}</small>` : ""}</span><span>締切 ${esc(end(x.end))}・${esc(x.method || "お店でご確認ください")}</span></li>`).join("")}</ul>
      <p class="fine"><a href="${c.R}lottery.html">ほかのガチャの抽選情報も見る →</a></p>
    </div>
  </section>`;
  })() : ""}

  <section class="section" id="stock" data-api="${c.R}api/stock/${it.id}" data-src="${c.R}data/stock/${it.id}.json" data-rak="${esc(L0.rakuten)}"${L0.mercari ? ` data-mer="${esc(L0.mercari)}"` : ""} style="scroll-margin-top:24px">
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
  </section>

  ${charasOf(it).length ? `<section class="section section-tight"><div class="section-head"><h2>${lang === "ja" ? "このキャラクター・作品のガチャ" : t.x.moreSeries}</h2></div><div class="chara-list">${charasOf(it).map((ch) => `<a class="chara-chip" href="${c.H}chara/${ch.slug}.html">${esc(lang === "ja" ? `${ch.label}のガチャ一覧` : t.x.charaChip(charaLabel(ch, lang)))}<small>${ch.list.length}</small></a>`).join("")}</div></section>` : ""}
  ${sameWeekList.length ? `<section class="section">
    <div class="section-head"><h2>${esc(SW.h)}</h2><a class="more" href="${c.H}${hubs.weekRel(wi)}">${lang === "ja" ? `${wi.m}月第${wi.no}週（${wi.range}）をすべて見る` : esc(t.hub.weekPage)}</a></div>
    <div class="grid">${sameWeekList.map((x) => card(x, c)).join("")}</div>
  </section>` : ""}
  ${relatedShown.length ? `<section class="section">
    <div class="section-head"><h2>${lang === "ja" ? "関連するガチャ" : t.related}</h2><a class="more" href="${c.H}genre/${g.slug}.html">${t.seeAll(gl)}</a></div>
    <div class="grid">${relatedShown.map((x) => card(x, c)).join("")}</div>
  </section>` : ""}
</div>
<nav class="item-bar" aria-label="${esc(name)}">
  <button type="button" class="ib-fav" data-fav="${it.id}" aria-pressed="false"><i aria-hidden="true">★</i><span>${esc(t.u.save)}</span></button>
  ${state === "up"
    // 発売前：まだお店に置かれないので「在庫店」は出さず、発売日のお知らせ（上の★・通知のボタン）と楽天の予約
    ? `<a class="ib-stock" href="#notify">${esc(SW.notify)}</a>
  <a class="ib-mer" href="${esc(L0.rakuten)}" target="_blank" rel="sponsored nofollow noopener">${esc(SW.rakUp)}<small>PR</small></a>`
    : state === "old" && lang === "ja"
    // 発売から時間がたった：お店では売り切れがち。メルカリ（公式ツールのリンクがある商品だけ）と楽天
    ? `${L0.mercariAf ? `<a class="ib-mer" href="${esc(L0.mercari)}" target="_blank" rel="sponsored nofollow noopener">${esc(t.u.mercari)}<small>PR</small></a>` : `<a class="ib-stock" href="${whereOfficial ? esc(it.store_search_url) : "#stock"}"${whereOfficial ? ' target="_blank" rel="noopener"' : ""}>${esc(t.u.stockShort)}</a>`}
  <a class="ib-mer" href="${esc(L0.rakuten)}" target="_blank" rel="sponsored nofollow noopener">${esc(SW.rak)}<small>PR</small></a>`
    : `<a class="ib-stock" href="${whereOfficial ? esc(it.store_search_url) : "#stock"}"${whereOfficial ? ' target="_blank" rel="noopener"' : ""}>${esc(t.u.stockShort)}</a>
  ${lang === "ja" ? `<a class="ib-mer" href="${esc(L0.mercari)}" target="_blank" rel="${L0.mercariAf ? "sponsored nofollow noopener" : "noopener"}">${esc(t.u.mercari)}${L0.mercariAf ? "<small>PR</small>" : ""}</a>` : ""}`}
</nav>`;

    const product = {
      "@context": "https://schema.org", "@type": "Product", name, description: description || desc, sku: it.id,
      brand: { "@type": "Brand", name: maker }, category: gl, releaseDate: ws ? ws.toISOString().slice(0, 10) : `${it.release}-01`,
      ...(janOf(it) ? { gtin13: janOf(it) } : {}),
      ...(it.price ? { offers: { "@type": "Offer", price: it.price, priceCurrency: "JPY", url: canonical(lang, rel), availability: isUp ? "https://schema.org/PreSale" : "https://schema.org/InStoreOnly" } } : {}),
    };
    if (absImg(it)) product.image = [absImg(it)];
    const crumbs = {
      "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
        { "@type": "ListItem", position: 2, name: gl, item: canonical(lang, `genre/${g.slug}.html`) },
        { "@type": "ListItem", position: 3, name },
      ],
    };
    layout({ rel, title: t.itemTitle(name), description: desc, body, jsonld: [product, crumbs, ...(whereLd ? [whereLd] : []), ...lots.map((x) => lotEventLd(x, canonical(lang, rel), absImg(it)))], ogImage: absImg(it), ogType: "product",
      noindex: !hasName(it, lang), alts: LANGS.filter((l) => hasName(it, l)), lastmod: it.updated || it.added || "" });
  }

  /* ---------- 一覧ページ（ジャンル別・メーカー別） ---------- */
  const LIST_MAX = 150;
  // h1・sub：見出しを短く（タイトルは検索向けに長いまま）。extra：見出しの下に足すリンクなど
  // 150件をこえる一覧は 2ページ目以降（genre/anime/2 など）に分ける。2ページ目以降は noindex
  const listPage = (rel, { title, lead, list, current = "", ogImage = "", h1 = "", sub = "", extra = "", jaOnly = false, after = "", description = "", jsonldExtra = [] }) => {
    const pageN = Math.max(1, Math.ceil(list.length / LIST_MAX));
    const relOf = (k) => (k === 1 ? rel : rel.replace(/\.html$/, `/${k}.html`));
    for (let k = 1; k <= pageN; k++) {
      const prel = relOf(k), c = ctx(prel);
      const part = list.slice((k - 1) * LIST_MAX, k * LIST_MAX), left = list.length - k * LIST_MAX;
      const ttl = k === 1 ? title : lang === "ja" ? `${title}（${k}ページ目）` : t.hub.pageTitle(title, k);
      const pages = pageN > 1 ? `<nav class="list-pages" aria-label="${lang === "ja" ? "ページ" : t.hub.pagesAria}">${Array.from({ length: pageN }, (_, j) => j + 1).map((j) => j === k ? `<span class="cur">${j}</span>` : `<a href="${c.H}${relOf(j)}">${j}</a>`).join("")}</nav>` : "";
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span>${k === 1 ? `<span>${esc(h1 || title)}</span>` : `<a href="${c.H}${rel}">${esc(h1 || title)}</a><span>/</span><span>${k}</span>`}</nav>
  <header class="page-head"><h1>${esc(h1 || title)}</h1>${sub ? `<p class="hub-sub">${esc(sub)}</p>` : ""}${k === 1 ? `<p class="lead">${esc(lead)}</p>` : ""}${extra}</header>
  ${k === 1 ? after : ""}
  <section class="section" style="padding-top:40px">${list.length ? `<div class="grid">${part.map((it, i) => card(it, c, i)).join("")}</div>${left > 0 ? `<p class="more-wrap"><a class="btn btn-gold list-more" href="${c.H}${relOf(k + 1)}">${lang === "ja" ? `もっと見る（残り${left}件）` : t.hub.more(left)}</a></p>` : ""}${pages}` : `<p class="empty">${t.empty}</p>`}</section>
</div>`;
      const jsonld = [
        { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
          { "@type": "ListItem", position: 2, name: h1 || title } ] },
        ...(list.length && k === 1 ? [{ "@context": "https://schema.org", "@type": "ItemList", numberOfItems: list.length,
          itemListElement: list.slice(0, 30).map((it, i) => ({ "@type": "ListItem", position: i + 1, url: canonical(lang, `item/${it.id}.html`), name: nameOf(it, lang) })) }] : []),
      ];
      layout({ rel: prel, title: ttl, description: description || lead, body, current, ogImage, jsonld: k === 1 ? [...jsonld, ...jsonldExtra] : jsonld, jaOnly, noindex: k > 1, lastmod: list.reduce((m, it) => (it.added > m ? it.added : m), "") });
    }
  };
  // 一覧ページの短い見出し（例「ちいかわのガチャ」＋「6シリーズ・最新は2026年9月」）
  const hubHead = (L, list) => {
    const latest = list.reduce((m, it) => (it.release > m ? it.release : m), "");
    const future = latest > thisMonth;
    return { h1: lang === "ja" ? `${L}のガチャ` : t.hub.hubH1(L), sub: !latest ? "" : lang === "ja" ? `${list.length}シリーズ・最新は${t.month(latest)}${future ? "発売予定" : ""}` : t.hub.hubSub(list.length, t.month(latest), future) };
  };
  // キャラクター・作品ページの補足（全言語）：発売中・発売予定の数、値段、最新作・次回作、歴代シリーズへのリンク、よくある質問（FAQPage）
  // 日本語の文言はここに直接、ほかの言語は t.hub の cx〜（中国語・韓国語で足りないものは英語）。
  // 「どこで売ってる？」は、日本語は都道府県のお店一覧へ、ほかの言語は（都道府県のページが日本語だけなので）このキャラのシリーズを多く扱うお店がある駅のページ上位3つへ
  const charaExtra = (ch, L, list) => {
    const ja = lang === "ja", H = t.hub;
    const c = ctx(`chara/${ch.slug}.html`);
    const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
    const nm = (it) => nameOf(it, lang);
    const rng = (r) => (lang === "en" ? enRange(r) : r);
    const relTxt = (it) => {
      const s = weekStartOf(it);
      if (!s) return ja ? `${t.month(it.release)}${it.release_note ? `（${it.release_note}）` : ""}` : t.month(it.release);
      const w = weekInfo(s);
      return ja ? `${w.y}年${w.m}月第${w.no}週（${w.range}）` : H.cxRel(H.weekLabel(w.m, w.no), rng(w.range));
    };
    const relShort = (it) => { const s = weekStartOf(it); if (!s) return t.month(it.release); const w = weekInfo(s); return ja ? `${w.m}月第${w.no}週` : H.weekLabel(w.m, w.no); };
    const sorted = [...list].sort(HUB.order);
    const upcoming = sorted.filter((it) => HUB.isUpcoming(it)), released = sorted.filter((it) => !HUB.isUpcoming(it));
    const reissues = list.filter((it) => HUB.isReissue(it)).length;
    const next = upcoming.find((it) => !HUB.isReissue(it)) || upcoming[0];
    const latest = [...released].reverse().find((it) => !HUB.isReissue(it)) || released[released.length - 1] || sorted[sorted.length - 1];
    const prices = list.map((it) => Number(it.price)).filter(Boolean);
    const pmin = Math.min(...prices), pmax = Math.max(...prices);
    const pmode = [...prices.reduce((m, p) => m.set(p, (m.get(p) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1])[0][0];
    const priceTxt = !ja ? H.cxPrice(pmin, pmax, pmode) : pmin === pmax ? `すべて1回${pmin}円` : `1回${pmin}円〜${pmax}円（${pmode}円のシリーズがいちばん多い）`;
    // どこで売ってる？：各シリーズの公式取扱店をまとめる
    const sids = new Set(); for (const it of list) for (const s of OFFICIAL_BY_ITEM.get(it.id) || []) sids.add(s);
    const shs = [...sids].map((id) => SHOP_BY_ID.get(id)).filter(Boolean);
    const itemA = (it) => `<a href="${c.H}item/${it.id}.html">${esc(nm(it))}</a>`;
    const spec = (it) => (ja ? `1回${it.price}円${it.lineup ? `・全${it.lineup}種` : ""}` : H.cxSpec(it.price, it.lineup));
    let qa, html, desc;
    if (ja) {
      const byPref = {}; for (const x of shs) if (x.pref) byPref[x.pref] = (byPref[x.pref] || 0) + 1;
      const prefTop = Object.entries(byPref).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const maker = [...list.reduce((m, it) => m.set(it.maker, (m.get(it.maker) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1])[0][0];
      const mapA = `<a href="${c.R}map.html">ガチャマップ</a>`;
      const whereTxt = shs.length
        ? `バンダイ公式の取扱店情報では、${L}のガチャは全国${shs.length}店で取扱があります（${prefTop.map(([p, k]) => `${p}${k}店`).join("・")}${Object.keys(byPref).length > 5 ? "など" : ""}）。それぞれのシリーズのページで在庫店を確認できるほか、ガチャマップで近くのお店を探せます。`
        : `${MAKER_WHERE[maker] || "全国のカプセルトイ専門店やショッピングモールのガチャコーナー"}で販売されます。取扱店はお店ごとに違うので、各シリーズのページの在庫店リストやガチャマップで近くのお店を探してください。`;
      const whereHtml = shs.length
        ? `バンダイ公式の取扱店情報では、${esc(L)}のガチャは全国${shs.length}店で取扱があります（${prefTop.map(([p, k]) => `<a href="${c.R}shops/${prefSlug(p)}.html">${esc(p)}${k}店</a>`).join("・")}${Object.keys(byPref).length > 5 ? "など" : ""}）。それぞれのシリーズのページで在庫店を確認できるほか、${mapA}で近くのお店を探せます。`
        : `${esc(MAKER_WHERE[maker] || "全国のカプセルトイ専門店やショッピングモールのガチャコーナー")}で販売されます。取扱店はお店ごとに違うので、各シリーズのページの在庫店リストや${mapA}で近くのお店を探してください。`;
      qa = [
        [`${L}の次の新作ガチャは？`,
          next ? `「${next.name}」が${relTxt(next)}に発売予定です（${spec(next)}）。${upcoming.length > 1 ? `ほかに${upcoming.length - 1}シリーズの発売が決まっています。` : ""}` : `いま発表されている発売予定はありません。最新作は「${latest.name}」（${relTxt(latest)}発売）です。新作が発表されしだい、このページに追加します。`,
          next ? `「${itemA(next)}」が${esc(relTxt(next))}に発売予定です（${spec(next)}）。${upcoming.length > 1 ? `ほかに${upcoming.length - 1}シリーズの発売が決まっています。` : ""}` : `いま発表されている発売予定はありません。最新作は「${itemA(latest)}」（${esc(relTxt(latest))}発売）です。新作が発表されしだい、このページに追加します。`],
        [`${L}の最新作は？`,
          `${released.length ? "発売中でいちばん新しいのは" : "最新は"}「${latest.name}」（${relTxt(latest)}発売・${spec(latest)}）です。${L}のガチャはこれまでに${list.length}シリーズ${reissues ? `（うち再販・復刻${reissues}）` : ""}が出ています。`,
          `${released.length ? "発売中でいちばん新しいのは" : "最新は"}「${itemA(latest)}」（${esc(relTxt(latest))}発売・${spec(latest)}）です。${esc(L)}のガチャはこれまでに${list.length}シリーズ${reissues ? `（うち再販・復刻${reissues}）` : ""}が出ています。`],
        [`${L}のガチャの値段はいくら？`, `${priceTxt}です。シリーズごとの値段と全何種かは、それぞれのシリーズのページで確認できます。`, `${priceTxt}です。シリーズごとの値段と全何種かは、下の一覧で確認できます。`],
        [`${L}のガチャはどこで売ってる？`, whereTxt, whereHtml],
      ];
      const cols = HUB.lines.map((l) => ({ l, k: l.list.filter((it) => list.includes(it)).length })).filter((x) => x.k).sort((a, b) => b.k - a.k).slice(0, 6);
      html = `<section class="section section-tight"><div class="panel">
    <h2 style="font-size:22px">${esc(L)}のガチャガチャ 発売状況</h2>
    <p>発売中${released.length}シリーズ・発売予定${upcoming.length}シリーズ${reissues ? `（うち再販・復刻${reissues}）` : ""}。値段は${priceTxt}です。</p>
    <p>最新作：${itemA(latest)}（${esc(relTxt(latest))}・${spec(latest)}）${next ? `<br>次の新作：${itemA(next)}（${esc(relTxt(next))}発売予定・${spec(next)}）` : ""}</p>
    ${cols.length ? `<p class="hub-links"><b>歴代シリーズの一覧</b>${cols.map(({ l, k }) => `<a href="${c.H}collection/${l.slug}.html">${esc(l.label)}<small>${k}作</small></a>`).join("")}</p>` : ""}
    <h3 class="arr-h">${esc(L)}のガチャガチャ よくある質問</h3>
    <dl class="item-qa">${qa.map(([q, , a]) => `<div><dt>${esc(q)}</dt><dd>${a}</dd></div>`).join("")}</dl>
  </div></section>`;
      desc = `${L}のガチャガチャ${list.length}シリーズの発売日・値段・売ってる場所。最新作「${cut(latest.name, 22)}」（${t.month(latest.release)}・${latest.price}円）${next ? `、次は「${cut(next.name, 22)}」が${relShort(next)}発売予定` : ""}。${pmin === pmax ? `1回${pmin}円` : `1回${pmin}〜${pmax}円`}。`;
    } else {
      // 駅のページに載っているお店（st.shops）が公式に扱うこのキャラのシリーズの数を駅ごとに数えて、多い順に3駅
      const inList = new Set(list.map((it) => it.id));
      const stTop = STATIONS.map((st) => {
        const ids = new Set();
        for (const x of st.shops) for (const id of SHOP_OFFICIAL[x.sh.id] || []) if (inList.has(id)) ids.add(id);
        return { st, ids };
      }).filter((x) => x.ids.size).sort((a, b) => b.ids.size - a.ids.size || b.st.shops.length - a.st.shops.length).slice(0, 3);
      const stName = (st) => st[lang] || st.en;
      const whereTxt = shs.length ? H.cxAWhere(L, shs.length, stTop.map((x) => H.cxStn(stName(x.st), x.ids.size)).join(H.cxStnSep)) : H.cxAWhereNone(L);
      const whereHtml = shs.length
        ? H.cxAWhere(esc(L), shs.length, stTop.map((x) => `<a href="${c.H}station/${x.st.slug}.html">${esc(H.cxStn(stName(x.st), x.ids.size))}</a>`).join(esc(H.cxStnSep)))
        : esc(H.cxAWhereNone(L));
      qa = [
        [H.cxQNext(L),
          next ? H.cxANext(nm(next), relTxt(next), spec(next), upcoming.length - 1) : H.cxANone(nm(latest), relTxt(latest)),
          next ? H.cxANext(itemA(next), esc(relTxt(next)), esc(spec(next)), upcoming.length - 1) : H.cxANone(itemA(latest), esc(relTxt(latest)))],
        [H.cxQLatest(L),
          H.cxALatest(released.length, nm(latest), relTxt(latest), spec(latest), L, list.length, reissues),
          H.cxALatest(released.length, itemA(latest), esc(relTxt(latest)), esc(spec(latest)), esc(L), list.length, reissues)],
        [H.cxQPrice(L), H.cxAPrice(priceTxt), esc(H.cxAPrice(priceTxt))],
        [H.cxQWhere(L), whereTxt, whereHtml],
      ];
      // シリーズ（定番の型）のページは日本語・英語だけ
      const cols = lang !== "en" ? [] : HUB.lines.map((l) => ({ l, k: l.list.filter((it) => list.includes(it)).length })).filter((x) => x.k).sort((a, b) => b.k - a.k).slice(0, 6);
      html = `<section class="section section-tight"><div class="panel">
    <h2 style="font-size:22px">${esc(H.cxStatusH(L))}</h2>
    <p>${esc(H.cxStatus(released.length, upcoming.length, reissues, priceTxt))}</p>
    <p>${H.cxLatestLine(itemA(latest), esc(relTxt(latest)), esc(spec(latest)))}${next ? `<br>${H.cxNextLine(itemA(next), esc(relTxt(next)), esc(spec(next)))}` : ""}</p>
    ${cols.length ? `<p class="hub-links"><b>${esc(H.cxColH)}</b>${cols.map(({ l, k }) => `<a href="${c.H}collection/${l.slug}.html">${esc(l.en)}<small>${esc(H.cxWorks(k))}</small></a>`).join("")}</p>` : ""}
    <h3 class="arr-h">${esc(H.cxFaqH(L))}</h3>
    <dl class="item-qa">${qa.map(([q, , a]) => `<div><dt>${esc(q)}</dt><dd>${a}</dd></div>`).join("")}</dl>
  </div></section>`;
      desc = H.cxDesc(L, list.length, cut(nm(latest), 40), t.month(latest.release), latest.price, next ? cut(nm(next), 40) : "", next ? relShort(next) : "", H.cxPriceShort(pmin, pmax));
    }
    const ld = [{ "@context": "https://schema.org", "@type": "FAQPage", inLanguage: LANG_META[lang].hreflang, mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }];
    return { after: html, description: desc, jsonldExtra: ld };
  };
  // キャラクター・作品ごとのページ
  for (const ch of CHARAS) {
    const list = [...ch.list].sort(byNewest);
    const L = charaLabel(ch, lang);
    const top = list[0];
    const fy = freshYM(list);
    listPage(`chara/${ch.slug}.html`, {
      title: lang === "ja" ? `${L}のガチャガチャ新作・発売日一覧${fy && fy.ja ? `【${fy.ja}最新】` : ""}` : t.x.charaTitle(L, fy || YM_NOW_EN), ...hubHead(L, list),
      lead: lang === "ja"
        ? `${L}のガチャガチャ${list.length}シリーズを新しい順にまとめました。最新は「${top.name}」（${t.month(top.release)}・1回${top.price}円）。それぞれのページで発売日・値段・全何種か・どこで売っているか（在庫店）を確認できます。`
        : t.x.charaLead(L, list.length),
      list, current: "genre", ...charaExtra(ch, L, list),
    });
  }
  {
    const rel = "chara.html", c = ctx(rel);
    const title = lang === "ja" ? "キャラクター・作品からガチャガチャを探す" : t.x.charaIdxTitle;
    const lead = lang === "ja" ? `サンリオ・ポケモン・ディズニーなど${CHARAS.length}のキャラクター・作品ごとに、新作ガチャガチャの発売日・値段をまとめています。` : t.x.charaIdxLead(CHARAS.length);
    const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>${esc(title)}</span></nav>
  <header class="page-head"><h1>${esc(title)}</h1><p class="lead">${esc(lead)}</p></header>
  <section class="section" style="padding-top:32px"><div class="chara-list">${CHARAS.map((ch) => `<a class="chara-chip" href="${c.H}chara/${ch.slug}.html">${esc(charaLabel(ch, lang))}<small>${ch.list.length}</small></a>`).join("")}</div></section>
</div>`;
    layout({ rel, title, description: lead, body, current: "genre", jsonld: [], lastmod: maxAdded(CHARAS.flatMap((ch) => ch.list)) });
  }
  // 今週・来週のページから、その週の固定ページ（/calendar/2026-11/w2）へ
  const permaLink = (W) => {
    if (!W.items.length) return "";
    const w = weekInfo(new Date(`${W.key}T00:00:00Z`)), H = ctx("week.html").H;
    return `<p class="hub-links"><a class="btn hub-perma" href="${H}${hubs.weekRel(w)}">${lang === "ja" ? `${w.m}月第${w.no}週（${w.range}）のページを見る →` : esc(t.hub.perma(t.hub.weekLabel(w.m, w.no), lang === "en" ? enRange(w.range) : w.range.replace("〜", "–")))}</a></p>`;
  };
  // 今週発売のガチャ（X の「今週発売」投稿のリンク先）
  listPage("week.html", {
    title: lang !== "ja" ? t.x.weekTitle(WEEK.range, WEEK.items.length) : `今週発売のガチャガチャ新作（${WEEK.range}）${WEEK.items.length}シリーズ`,
    lead: lang !== "ja" ? t.x.weekLead(WEEK.items.length, WEEK.range, WEEK.items.slice(0, 3).map((it) => nameOf(it, lang))) : `${WEEK.label}（${WEEK.range}）に発売されるガチャ${WEEK.items.length}シリーズを、人気の順に並べています。${WEEK.items.length ? `${WEEK.items.slice(0, 2).map((it) => `「${it.name}」`).join("")}など。` : ""}発売日は地域や店舗によって前後します。`,
    list: WEEK.items, current: "calendar", extra: permaLink(WEEK),
    ogImage: fs.existsSync(path.join(ROOT, "images", "og", "week.jpg")) ? `${SITE_URL}/images/og/week.jpg?v=${today}` : "",
  });
  listPage("next-week.html", {
    title: lang !== "ja" ? t.x.nextTitle(NEXT_WEEK.range, NEXT_WEEK.items.length) : `来週発売のガチャガチャ新作（${NEXT_WEEK.range}）${NEXT_WEEK.items.length}シリーズ`,
    lead: lang !== "ja" ? t.x.nextLead(NEXT_WEEK.items.length, NEXT_WEEK.range, NEXT_WEEK.items.slice(0, 3).map((it) => nameOf(it, lang))) : `${NEXT_WEEK.label}（${NEXT_WEEK.range}）に発売予定のガチャ${NEXT_WEEK.items.length}シリーズです。${NEXT_WEEK.items.length ? `${NEXT_WEEK.items.slice(0, 2).map((it) => `「${it.name}」`).join("")}など、` : ""}値段・全何種か・在庫店の情報もまとめています。発売日は地域や店舗によって前後します。`,
    list: NEXT_WEEK.items, current: "calendar", extra: permaLink(NEXT_WEEK),
  });
  // 新着ガチャ（トップの「全部見る」のリンク先）
  {
    // 載った日が新しい順 → 同じ日なら発売が先の新作から（まとめて取り込んだ日に古い商品が上に来ないように）
    const byAddedRelease = (a, b) => (b.added > a.added ? 1 : b.added < a.added ? -1 : b.release > a.release ? 1 : b.release < a.release ? -1 : b.popularity - a.popularity);
    const monStr = mondayOf(nowJST).toISOString().slice(0, 10);
    const nToday = items.filter((it) => it.added === today).length, nWeek = items.filter((it) => it.added >= monStr && it.added <= today).length;
    listPage("new.html", {
      title: lang !== "ja" ? t.x.newPageTitle : "新着ガチャガチャ一覧（最新の新作情報）",
      lead: `${t.u.addedLine(nToday, nWeek)}。${lang !== "ja" ? t.x.newPageLead : "バンダイ・タカラトミーアーツなどの新作ガチャガチャを、サイトに載った新しい順に並べています。発売月・価格・全何種かもひと目でわかります。"}`.replace(/^(.+?)。(?=[A-Za-z가-힣])/, "$1. "),
      list: [...items].sort(byAddedRelease).slice(0, 120), current: "new",
      extra: lang === "ja" || lang === "en" ? `<p class="hub-links"><a href="${ctx("new.html").H}saihan.html">${lang === "ja" ? "再販・復刻のガチャ →" : t.hub.saihanH1 + " →"}</a><a href="${ctx("new.html").H}collection.html">${lang === "ja" ? "シリーズから探す →" : t.hub.colIdxH1 + " →"}</a></p>` : "",
    });
  }
  for (const g of TYPES) {
    const list = inType(g.slug).sort(byNewest);
    const TL = typeLabel(g, lang);
    if (list.length) listPage(`type/${g.slug}.html`, { title: t.typePage(TL, (freshYM(list) || {}).ja), lead: t.typeLead(TL, list.length, list), list, current: "genre", ...hubHead(TL, list) });
  }
  for (const g of GENRES) {
    const list = inGenre(g.slug).sort(byNewest);
    if (!list.length) continue;
    listPage(`genre/${g.slug}.html`, { title: t.genrePage(genreLabel(g, lang), (freshYM(list) || {}).ja), lead: t.genreLead(genreLabel(g, lang), list.length, list), list, current: "genre", ...hubHead(genreLabel(g, lang), list) });
  }
  for (const maker of [...new Set(items.map((it) => it.maker))]) {
    const list = items.filter((it) => it.maker === maker).sort(byNewest);
    const label = makerOf(list[0], lang);
    listPage(`maker/${makerSlug(maker)}.html`, { title: t.makerPage(label, (freshYM(list) || {}).ja), lead: t.makerLead(label, list.length, list, [...list].sort(byPopular).slice(0, 3).map((it) => nameOf(it, lang))), list, ...hubHead(label, list) }); // 4つ目＝人気の上位3つの名前（中国語・韓国語の説明文で使う）
  }
  // 人気ランキング（日本語だけ）：トップの「人気ランキング」と同じ並び（ハートの数→注目度）。総合TOP50・発売前の注目TOP20・今週発売の人気順
  if (lang === "ja") {
    const rel = "ranking.html", c = ctx(rel);
    const top = [...items].sort(byPopular).slice(0, 50);
    const upTop = items.filter((it) => HUB.isUpcoming(it)).sort(byPopular).slice(0, 20);
    const weekTop = WEEK.items.slice(0, 30); // WEEK.items は人気順にそろえてある
    const rankOl = (list) => `<ol class="rank">${list.map((it, i) => `<li><a href="${c.H}item/${it.id}.html">
      <span class="rank-no">${i + 1}</span>${thumb(it, c.R, { badge: false, load: i === 0 ? "high" : i < 4 ? "eager" : "" })}
      <span style="min-width:0"><span class="card-name">${esc(it.name)}</span><span class="card-foot"><span><b>${priceTxt(it.price)}</b></span><span>${heartsOf(it) ? `<em class="hearts">♥ ${heartsOf(it)}</em>` : t.month(it.release)}</span></span></span>
    </a></li>`).join("")}</ol>`;
    const sec = (id, h, note, list) => `<section class="section" id="${id}"><div class="section-head"><h2>${h}</h2></div>${note ? `<p class="lead" style="margin-top:0">${note}</p>` : ""}${list.length ? rankOl(list) : `<p class="empty">${t.empty}</p>`}</section>`;
    const title = `ガチャガチャ人気ランキング【${YM_NOW}】今いちばん人気の新作TOP50`;
    const h1 = "ガチャガチャ人気ランキング";
    const lead = "ハート（推し）の数と注目度から、今人気のガチャを順位で並べています。毎日更新。";
    const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>${h1}</span></nav>
  <header class="page-head"><h1>${h1}</h1><p class="lead">${lead}</p><p class="hub-links"><a href="#total">総合TOP50</a><a href="#upcoming">発売前で注目</a><a href="#week">今週発売の人気順</a><a href="${c.H}week.html">今週発売のガチャ一覧 →</a></p></header>
  ${sec("total", "総合TOP50", "", top)}
  ${sec("upcoming", "発売前で注目のガチャ TOP20", "まだ発売前で、ハートや注目が集まっているガチャです。", upTop)}
  ${sec("week", `今週発売の人気順（${esc(WEEK.range)}）`, `${esc(WEEK.label)}に発売されるガチャを人気の順に並べています。`, weekTop)}
</div>`;
    const description = `${lead}1位は「${top[0] ? top[0].name : ""}」。${top.slice(1, 3).map((it) => `「${it.name}」`).join("")}など、総合TOP50・発売前の注目・今週発売の人気順を掲載。`;
    layout({ rel, title, description, body, current: "ranking", jaOnly: true, lastmod: today, jsonld: [
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
        { "@type": "ListItem", position: 2, name: h1 } ] },
      { "@context": "https://schema.org", "@type": "ItemList", name: "ガチャガチャ人気ランキング 総合TOP50", itemListOrder: "https://schema.org/ItemListOrderDescending", numberOfItems: top.length,
        itemListElement: top.map((it, i) => ({ "@type": "ListItem", position: i + 1, url: canonical(lang, `item/${it.id}.html`), name: it.name })) },
    ] });
  }
  // オフィシャルショップ限定のガチャ（日本語だけ）：商品名に「オフィシャルショップ限定」（限定再販も含む）が入るもの、発売が新しい順
  if (lang === "ja") {
    const LIMITED_RX = /(ガシャポン(バンダイ)?)?オフィシャルショップ限定/;
    const list = items.filter((it) => LIMITED_RX.test(it.name)).sort((a, b) => (b.release > a.release ? 1 : b.release < a.release ? -1 : byNewest(a, b)));
    const chain = CHAINS.find((ch) => ch.slug === "gashapon-official-shop" && ch.shops.length);
    const H = ctx("limited.html").H;
    listPage("limited.html", {
      title: "ガシャポンバンダイオフィシャルショップ限定ガチャ一覧（限定・限定再販）",
      h1: "ガシャポンバンダイオフィシャルショップ限定ガチャ一覧",
      sub: list.length ? `${list.length}シリーズ・新しい順` : "",
      lead: "「ガシャポンバンダイオフィシャルショップ限定」は、バンダイ直営のガシャポン専門店（ガシャポンバンダイオフィシャルショップ）でしか回せないシリーズです。人気シリーズの限定再販も多く、ふつうのガシャポン設置店やショッピングモールのガチャコーナーには置かれません。オフィシャルショップは主に大きな駅の近くや商業施設の中にあります。",
      list, current: "genre", jaOnly: true,
      extra: `<p class="hub-links">${chain ? `<a href="${H}chain/${chain.slug}.html">ガシャポンバンダイオフィシャルショップの店舗一覧（全国${chain.shops.length}店）→</a>` : ""}<a href="${H}saihan.html">再販・復刻のガチャ →</a></p>`,
    });
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
    const en = lang !== "ja"; // 日本語以外（文言は t.cal。中国語・韓国語は src/i18n/<lang>.js の cal）
    const C = t.cal;
    const weekTitle = (w) => en ? C.week(w) : `${w.m}月 第${w.no}週`;
    const weekBadge = (w) => w.key === WEEK.key ? `<span class="wk-now">${en ? C.now : "今週"}</span>`
      : w.key < WEEK.key ? `<span class="wk-past">${en ? C.out : "発売済み"}</span>` : "";
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
    const CAL_TOP_CAP = 12; // カレンダーのトップで1週に出す件数（style.css の nth-child(n+13) と同じ）
    const calCard = (it, c) => card(it, c).replace('class="card"', 'class="card cal-card"');
    // cap：カレンダーのトップでは各週の最初の cap 件だけ書き出し、「全部見る」は週のページ（週未定は月のページ）へのリンクにする（ページを軽くするため）。
    // 月・週のページは cap なし（全件を出して、多い週はボタンで開く）
    const weekBlock = (m, g, c, cap = 0) => {
      const id = g.w ? `w${g.w.key}` : `w${m}-tbd`;
      const n = g.list.length;
      const cut = cap > 0 && n > cap;
      const cls = ["cal-week", g.w && g.w.key === WEEK.key ? "is-now" : "", g.w && g.w.key < WEEK.key ? "is-past" : "", n > 12 ? "many" : "", n > 9 ? "some" : ""].filter(Boolean).join(" ");
      const head = g.w
        ? `<div class="cal-date"><span class="cal-no">${en ? C.weekNo(g.w.no) : `第${g.w.no}週`}</span><b>${g.w.range}</b></div>
          <div class="cal-info"><span>${weekTitle(g.w)}${en ? C.releases : "発売"}</span><small>${en ? C.series(n) : `${n}シリーズ`}</small>${weekBadge(g.w)}<a class="cal-wlink" href="${c.H}${hubs.weekRel(g.w)}">${en ? t.hub.weekPage : "この週のページ →"}</a></div>`
        : `<div class="cal-date tbd"><span class="cal-no">${en ? C.tba : "週未定"}</span><b>${en ? C.tbaDate : "発売日未定"}</b></div>
          <div class="cal-info"><span>${en ? C.tbaNote : "発売週がまだ発表されていない商品"}</span><small>${en ? C.series(n) : `${n}シリーズ`}</small></div>`;
      const allTxt = en ? C.showAll(n) : `この週をもっと見る（全${n}件）`;
      const more = cut
        ? `<a class="btn" href="${c.H}${g.w ? hubs.weekRel(g.w) : `calendar/${m}.html#${id}`}">${allTxt}</a>`
        : `<button type="button" class="btn cal-more-btn" data-open="${allTxt}" data-close="${en ? C.showLess : "閉じる"}">${allTxt}</button>`;
      return `<section class="${cls}" id="${id}"><header class="cal-head">${head}</header>
        <div class="grid cal-grid">${(cut ? g.list.slice(0, cap) : g.list).map((it) => calCard(it, c)).join("")}</div>
        <p class="cal-more-wrap">${more}</p></section>`;
    };
    const monthBlock = (m, c, cap = 0) => {
      const [y, mo] = m.split("-");
      const { list, groups } = weeksOf(m);
      return `<div class="cal-month" id="m${m}"><h2 class="cal-month-head"><span class="cal-y">${y}</span><b>${en ? C.monthShort(Number(mo)) : `${Number(mo)}月`}</b><small>${en ? C.series(list.length) : `${list.length}シリーズ`}</small>${m === thisMonth ? `<span class="now">${t.thisMonth}</span>` : ""}</h2>
      ${groups.map((g) => weekBlock(m, g, c, cap)).join("")}</div>`;
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
          const lab = `<b>${en ? C.wShort(w.no) : `第${w.no}週`}</b><small>${w.range.split("〜")[0]}〜</small>`;
          const cls = [w.key === WEEK.key ? "on" : "", w.key < WEEK.key ? "past" : ""].filter(Boolean).join(" ");
          return g ? `<a href="#w${w.key}"${cls ? ` class="${cls}"` : ""}>${lab}<i>${en ? C.count(g.list.length) : `${g.list.length}件`}</i></a>` : `<span class="off">${lab}<i>-</i></span>`;
        });
        // 日付の決まった週がまだない月（先の月）は、空のマスを並べずに1マスにまとめる
        if (!byKey.size) { rows.push(`<div class="wg-row${m === thisMonth ? " now" : ""}"><a class="wg-month" href="#m${m}"><b>${en ? C.monthShort(mo) : `${mo}月`}</b><small>${en ? C.count(weeksOf(m).list.length) : `${weeksOf(m).list.length}件`}</small></a>${tbd ? `<a href="#w${m}-tbd" class="tbd wg-span"><b>${en ? `${C.monthShort(mo)} · ${C.series(tbd.list.length)}（${C.tbaDate}）`.replace(/（(.*)）$/, lang === "en" || lang === "ko" ? " ($1)" : "（$1）") : `${mo}月 ${tbd.list.length}件（週未定）`}</b></a>` : `<span class="off tbd wg-span"><b>${en ? C.noneYet || "No releases listed yet" : "まだ登録がありません"}</b></span>`}</div>`); continue; }
        if (mondays.length < 5) cells.push(`<span class="blank"></span>`);
        cells.push(tbd ? `<a href="#w${m}-tbd" class="tbd"><b>${en ? C.tba : "未定"}</b><small>${en ? C.tbaSub : "週未定"}</small><i>${en ? C.count(tbd.list.length) : `${tbd.list.length}件`}</i></a>` : `<span class="off tbd"><b>${en ? C.tba : "未定"}</b><small>&nbsp;</small><i>-</i></span>`);
        rows.push(`<div class="wg-row${m === thisMonth ? " now" : ""}"><a class="wg-month" href="#m${m}"><b>${en ? C.monthShort(mo) : `${mo}月`}</b><small>${en ? C.count(weeksOf(m).list.length) : `${weeksOf(m).list.length}件`}</small></a>${cells.join("")}</div>`);
      }
      return rows.length ? `<nav class="week-grid" id="week-grid" aria-label="${en ? C.jumpAria : "週へジャンプ"}">${rows.join("")}</nav>
  <a class="wg-back" href="#week-grid" aria-label="${en ? C.jumpBack : "週のボタンにもどる"}">${en ? C.jumpBtn : "週をえらぶ"}<span>▲</span></a>` : "";
    };
    // 月ごとのページ（先の月も含めて全部）。「2026年12月発売 ガチャ」のような検索の受け皿
    const monthPages = allMonths.slice().reverse();
    const monthLabel = (m) => { const [y, mo] = m.split("-"); return en ? t.month(m) : `${y}年${Number(mo)}月`; };
    const monthCount = (m) => items.filter((it) => calMonthOf(it) === m).length;
    const archiveNav = (c, cur) => `<nav class="archive" aria-label="${en ? C.monthsAria : "月ごとのページ"}"><h2>${en ? C.byMonth : "月ごとに見る"}</h2><div class="archive-list">${monthPages.map((m) =>
      m === cur ? `<span class="cur">${monthLabel(m)} ${en ? C.series(monthCount(m)) : `${monthCount(m)}シリーズ`}</span>`
        : `<a href="${c.H}calendar/${m}.html">${monthLabel(m)} ${en ? C.series(monthCount(m)) : `${monthCount(m)}シリーズ`}</a>`).join("")}</div></nav>`;
    const itemListLd = (rel, list) => ({ "@context": "https://schema.org", "@type": "ItemList", numberOfItems: list.length,
      itemListElement: list.slice(0, 30).map((it, i) => ({ "@type": "ListItem", position: i + 1, url: canonical(lang, `item/${it.id}.html`), name: nameOf(it, lang) })) });
    const crumbLd = (rel, name) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
      { "@type": "ListItem", position: 2, name: t.calH1, item: canonical(lang, "calendar.html") },
      ...(name ? [{ "@type": "ListItem", position: 3, name }] : []) ] });
    {
      const c = ctx("calendar.html");
      const ahead = allMonths.filter((m) => m >= prevMonth);
      const span = ahead.length ? (en ? C.span(monthLabel(ahead[0]), monthLabel(ahead[ahead.length - 1])) : `${monthLabel(ahead[0])}〜${monthLabel(ahead[ahead.length - 1])}`) : "";
      const title = en ? C.title(span) : `ガチャガチャ発売日カレンダー｜${span}の新作を週ごとに一覧`;
      const desc = en ? C.desc(span, WEEK.items.length, WEEK.range, monthCount(thisMonth))
        : `新作ガチャガチャの発売日を週ごとにまとめたカレンダー（${span}）。今週（${WEEK.range}）は${WEEK.items.length}シリーズ、今月は${monthCount(thisMonth)}シリーズ発売。バンダイ・タカラトミーアーツの価格・種類数もひと目でわかります。`;
      const upcoming = recent.flatMap((m) => weeksOf(m).groups.flatMap((g) => g.list));
      const body = `<div class="wrap">
  <header class="page-head"><h1>${t.calH1}</h1><p class="lead">${t.calLead}</p>${lang === "ja" ? `<p class="hub-links"><b>値段から探す</b>${hubs.PRICES(items).map((p) => `<a href="${c.H}price/${p}.html">${p}円</a>`).join("")}<a href="${c.H}saihan.html">再販・復刻</a><a href="${c.H}collection.html">シリーズ</a><a href="${c.H}stats.html">新作の統計（平均価格など）</a></p>` : lang === "en" ? `<p class="hub-links"><a href="${c.H}saihan.html">${t.hub.saihanH1}</a><a href="${c.H}collection.html">${t.hub.colIdxH1}</a><a href="${c.H}stats.html">Release stats</a></p>` : ""}</header>
  ${jumpNav()}
  <div class="cal">${recent.map((m) => monthBlock(m, c, CAL_TOP_CAP)).join("")}</div>
  ${archiveNav(c, "")}
</div>`;
      layout({ rel: "calendar.html", title, description: desc, body, current: "calendar", lastmod: maxAdded(upcoming), jsonld: [crumbLd("calendar.html", ""), itemListLd("calendar.html", upcoming)] });
    }
    for (const m of allMonths) {
      const rel = `calendar/${m}.html`;
      const c = ctx(rel);
      const [y, mo] = m.split("-");
      const n = monthCount(m);
      const future = m >= thisMonth;
      const h1 = en ? C.monthH1(Number(y), Number(mo), n, future)
        : `${y}年${Number(mo)}月発売のガチャガチャ${future ? "新作" : ""}一覧（${n}シリーズ）`;
      const title = en ? C.monthTitle(Number(y), Number(mo), n, future) : `${h1}｜発売日・値段`;
      const groups = weeksOf(m).groups;
      const weeksTxt = groups.filter((g) => g.w).map((g) => en ? C.weeksTxt(g.w.no, g.list.length) : `第${g.w.no}週${g.list.length}件`).join(en ? C.weeksSep : "・");
      const top = groups.flatMap((g) => g.list).sort(byPopular).slice(0, 3).map((it) => nameOf(it, lang));
      const desc = en ? C.monthDesc(Number(y), Number(mo), n, future, weeksTxt, top)
        : `${y}年${Number(mo)}月に発売${future ? "される" : "された"}ガチャガチャ${n}シリーズを発売週ごとに掲載${weeksTxt ? `（${weeksTxt}）` : ""}。${top.join("、")}など。`;
      const i = allMonths.indexOf(m), prev = allMonths[i - 1], next = allMonths[i + 1];
      const pager = `<nav class="month-pager">${prev ? `<a href="${c.H}calendar/${prev}.html">← ${monthLabel(prev)}</a>` : "<span></span>"}<a href="${c.H}calendar.html">${en ? C.calendar : "カレンダーへ"}</a>${next ? `<a href="${c.H}calendar/${next}.html">${monthLabel(next)} →</a>` : "<span></span>"}</nav>`;
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.H}calendar.html">${t.calH1}</a><span>/</span><span>${esc(monthLabel(m))}</span></nav>
  <header class="page-head"><h1>${esc(en ? h1 : `${y}年${Number(mo)}月発売のガチャ`)}</h1>${en ? "" : `<p class="hub-sub">${n}シリーズ${m === thisMonth ? `<span class="wk-now">${t.thisMonth}</span>` : ""}</p>`}<p class="lead">${esc(desc)}</p>${hubs.updatedLine(groups.flatMap((g) => g.list), lang)}${(() => {
    // その月に多いキャラクター・作品（上位5つ）
    const tops = hubs.monthTops(groups.flatMap((g) => g.list), { CHARAS });
    const tx = tops.map(([ch, k]) => `<a href="${c.H}chara/${ch.slug}.html">${esc(charaLabel(ch, lang))}</a>（${k}）`);
    if (!tops.length && lang === "ja") return "";
    return lang === "ja" ? `<p class="lead month-intro">この月に多いキャラクター・作品：${tx.join("・")}</p>`
      : ((s) => (s ? `<p class="lead month-intro">${s}</p>` : ""))(t.hub.monthIntro(esc(t.month(m)), n, future, tops.map(([ch, k]) => `<a href="${c.H}chara/${ch.slug}.html">${esc(charaLabel(ch, lang))}</a>${t.hub.count(k)}`).join(t.hub.sep)));
  })()}${hubs.weekIndex(HUB, m, { lang, c, t, WEEK })}</header>
  <div class="cal">${monthBlock(m, c)}</div>
  ${pager}
  ${archiveNav(c, m)}
</div>`;
      layout({ rel, title, description: desc, body, current: "calendar", lastmod: maxAdded(groups.flatMap((g) => g.list)), jsonld: [crumbLd(rel, monthLabel(m)), itemListLd(rel, groups.flatMap((g) => g.list)),
        hubs.collectionLd({ name: en ? h1 : `${y}年${Number(mo)}月発売のガチャ`, url: canonical(lang, rel), list: groups.flatMap((g) => g.list), inLanguage: t.htmlLang, siteUrl: SITE_URL })] });
    }
    void past;
  }
  // 週ごとの固定ページ・シリーズ・再販・値段の一覧
  hubs.build(HUB, { lang, t, layout, card, ctx, esc, canonical, nameOf, hasName, CHARAS, charaLabel, WEEK, NEXT_WEEK, byPopular, byNewest, thisMonth, MONTH_EN, thumbOf, listPage, items, weekStartOf, weekInfo, genreLabel, genreOf, makerSlug, makerOf, enRange, SITE_URL });
  if (lang === "ja" || lang === "en") {
    const MK = new Map(items.map((it) => [it.maker, it]));
    stats.build(STATS, { lang, layout, ctx, esc, canonical, t, today, MONTH_EN, charaLabel, makerOf: (name) => (MK.has(name) ? makerOf(MK.get(name), lang) : name), write, SITE_URL, site });
  }

  /* ---------- よくある質問 ---------- */
  {
    const c = ctx("faq.html");
    // 答えの中の [文字](station/〇〇.html) はリンクに（その駅のページがあるときだけ。構造化データでは文字だけ）
    const LINK_RX = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    const faqHtml = (a) => esc(a).replace(LINK_RX, (m, txt, href) => { const st = href.match(/^station\/([a-z0-9-]+)\.html$/); return st && !STATIONS.some((x) => x.slug === st[1]) ? txt : `<a href="${c.H}${href}">${txt}</a>`; });
    const faqText = (a) => a.replace(LINK_RX, "$1");
    const body = `<div class="wrap">
  <header class="page-head"><h1>${t.faqTitle}</h1><p class="lead">${t.faqLead}</p></header>
  <div class="faq">${t.faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><div class="a">${faqHtml(a)}</div></details>`).join("")}</div>
</div>`;
    const jsonld = [{ "@context": "https://schema.org", "@type": "FAQPage", inLanguage: LANG_META[lang].hreflang, mainEntity: t.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: faqText(a) } })) }];
    layout({ rel: "faq.html", title: t.faqPageTitle || t.faqTitle, description: t.faqDesc, body, jsonld, current: "faq" });
  }

  /* ---------- 検索結果ページ ---------- */
  {
    const c = ctx("search.html");
    const body = `<div class="wrap">
  <header class="page-head"><h1 id="sr-title">${t.searchTitle}</h1><p class="lead" id="sr-note"></p></header>
  <section class="section" style="padding-top:32px"><p class="sr-chara" id="sr-chara" hidden></p><div class="grid" id="sr-grid" data-links="${esc(JSON.stringify([
    [`${c.H}week.html`, lang !== "ja" ? t.x.weekH : "今週発売のガチャ"], [`${c.H}index.html#ranking`, t.rankTitle],
    ...(lang === "ja" || lang === "en" ? [[`${c.H}collection.html`, lang === "ja" ? "シリーズ一覧" : t.hub.colIdxH1]] : []),
    ...CHARAS.slice(0, 6).map((ch) => [`${c.H}chara/${ch.slug}.html`, charaLabel(ch, lang)]),
  ]))}"></div></section>
</div>`;
    layout({ rel: "search.html", title: t.searchTitle, description: t.searchTitle, body, noindex: true }); // noindex のページは hreflang も出さない
  }
  // 新着のRSS（Naverなどは新しいページをRSSで見つけるのが得意）
  {
    const feed = [...items].filter((it) => hasName(it, lang)).sort(byNewest).slice(0, 50);
    const self = `${SITE_URL}/${lang === "ja" ? "" : lang + "/"}rss.xml`;
    write(`${langDir(lang)}rss.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${esc(lang === "ja" ? "ガチャプラネット 新着ガチャ" : `${site.name} – ${t.newTitle}`)}</title>
<link>${esc(canonical(lang, "new.html"))}</link>
<description>${esc(t.description)}</description>
<language>${LANG_META[lang].html.toLowerCase()}</language>
<atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>
${feed.map((it) => `<item><title>${esc(nameOf(it, lang))}</title><link>${esc(canonical(lang, `item/${it.id}.html`))}</link><guid>${esc(canonical(lang, `item/${it.id}.html`))}</guid><pubDate>${new Date(`${it.added || today}T09:00:00+09:00`).toUTCString()}</pubDate><description>${esc(`${makerOf(it, lang)} · ¥${it.price}${it.lineup ? " · " + t.lineup(it.lineup) : ""} · ${t.month(it.release)}`)}</description></item>`).join("\n")}
</channel></rss>
`);
  }
  write(`data/search-${lang}.json`, JSON.stringify(items.map((it) => ({
    id: it.id, n: nameOf(it, lang), a: lang !== "ja" ? it.name : it.name_en, m: makerOf(it, lang), img: thumbOf(it.image), p: it.price, l: it.lineup, r: t.month(it.release), g: genreLabel(genreOf(it.genre), lang),
    k: [...(it.tags || []), ...(it.tags_en || []), ...(it.lineup_names || [])].join(" "),
    // w：発売週の月曜日、ym：発売月（ブラウザで「今週発売・発売中」などを出すのに使う）
    w: (() => { const s = weekStartOf(it); return s ? s.toISOString().slice(0, 10) : ""; })(), ym: it.release,
  }))));
  // 検索の候補の先頭に出す「キャラクター・作品の一覧ページ」
  write(`data/chara-${lang}.json`, JSON.stringify(CHARAS.map((ch) => ({ s: ch.slug, l: charaLabel(ch, lang), j: ch.label, e: ch.en, n: ch.list.length, m: ch.match }))));

  /* ---------- マイリスト（★で保存したガチャ。ブラウザの中だけに保存。検索には出さない） ---------- */
  {
    const rel = "mylist.html", c = ctx(rel);
    const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>${esc(t.u.mylist)}</span></nav>
  <header class="page-head"><h1>★ ${esc(t.u.mylistTitle)}</h1><p class="lead">${esc(t.u.mylistLead)}</p></header>
  ${pushBox(t, "ml")}
  <div id="mylist" class="mylist" data-index="${c.R}data/search-${lang}.json" data-home="${c.H}" data-root="${c.R}" data-l="${esc(JSON.stringify({ now: t.u.mlNow, soon: t.u.mlSoon, out: t.u.mlOut }))}">
    <p class="empty ml-empty" hidden>${esc(t.u.mlEmpty)}<br><a class="btn" href="${c.H}week.html" style="margin-top:14px">${esc(t.u.mlBrowse)} →</a></p>
  </div>
</div>`;
    layout({ rel, title: t.u.mylistTitle, description: t.u.mylistLead, body, noindex: true });
  }

  /* ---------- 駅のまわりのガチャのお店（/station/〇〇・5言語）と駅の一覧（/station） ---------- */
  {
    const ja = lang === "ja", S = t.stn;
    const stName = (st) => st[lang] || st.en;
    const jl = ja ? "" : ' lang="ja"';
    const chainLabelOr = (x) => { const ch = CHAIN_BY_SHOP.get(x.sh.id); return ch ? chainLabel(ch, lang) : x.sh.name; };
    const regionOf = (r) => (ja ? STATION_REGION_JA[r] : S.regions[r]) || r;
    const stCrumb = ja ? "駅からさがす" : S.crumb;
    const LM_KEY = { en: "name_en", ko: "name_ko", "zh-cn": "name_zh_cn", "zh-tw": "name_zh_tw" };
    const lmName = (lm) => (ja ? lm.name_ja : lm[LM_KEY[lang]] || lm.name_en || lm.name_ja);
    const YEAR = nowJST.getUTCFullYear();
    for (const st of STATIONS) {
      const rel = `station/${st.slug}.html`, c = ctx(rel);
      const lms = st.lms, rest = st.rest;
      const name = stName(st), n = st.count, near = st.shops[0];
      // 外国語：取扱（公式のシリーズ数）が多い順、同じなら近い順（日本語は近い順のまま）。有名店として上に出したお店は除く
      const kOf = (x) => (SHOP_OFFICIAL[x.sh.id] || []).length;
      const list = ja ? rest : [...rest].sort((a, b) => kOf(b) - kOf(a) || a.d - b.d);
      const best = st.shops.length ? [...st.shops].sort((a, b) => kOf(b) - kOf(a) || a.d - b.d)[0] : null;
      const bestCh = ja || !best ? null : CHAIN_BY_SHOP.get(best.sh.id), bestLabel = bestCh ? chainLabel(bestCh, lang) : null;
      const chainCount = new Map();
      for (const x of st.shops) { const ch = CHAIN_BY_SHOP.get(x.sh.id); if (ch && !ch.store) chainCount.set(ch, (chainCount.get(ch) || 0) + 1); }
      const chains = [...chainCount.entries()].sort((a, b) => b[1] - a[1]).map(([ch]) => ch);
      const most = st.shops.map((x) => ({ sh: x.sh, d: x.d, k: (SHOP_OFFICIAL[x.sh.id] || []).length })).sort((a, b) => b.k - a.k)[0];
      // いちばん近いお店の取扱が5種未満なら、取扱がいちばん多いお店を先に書く（秋葉原でファミレスが先頭に来ないように）
      const top = near && most && most.k >= 5 && most.sh !== near.sh && (SHOP_OFFICIAL[near.sh.id] || []).length < 5 ? most : null;
      // 有名店：台数がいちばん多いお店（lms は台数の多い順）
      const big = lms[0] || null, bigName = big ? lmName(big.lm) : "";
      const walkTxt = (x) => (x.lm && x.lm.in_terminal ? (ja ? "ターミナル内" : S.inTerminal) : ja ? `徒歩約${walkMin(x.d)}分（${fmtDist(x.d)}）` : S.walk(walkMin(x.d), fmtDist(x.d)));
      const lmLead = big ? (ja ? `いちばん大きいのは「${bigName}」${big.lm.machines ? `（約${big.lm.machines.toLocaleString("en-US")}台）` : ""}です。` : S.lmLead(bigName, big.lm.machines, big.lm.in_terminal ? null : walkMin(big.d))) : "";
      const title = ja ? `${name}周辺のガチャガチャ設置場所・設置店${n}店${chains.length ? `｜${chains.slice(0, 2).map(chainName).join("・")}` : ""}【${YM_NOW}】` : S.titleN(name, n, YEAR);
      const leadShops = !near ? "" : ja
        ? `${name}の周り${st.km}km以内に、バンダイ公式の取扱があるガチャガチャの設置場所（設置店）が${st.shops.length}店あります。${top ? `取扱中のガチャがいちばん多いのは「${top.sh.name}」（${top.k}種・徒歩約${walkMin(top.d)}分）。いちばん近いのは「${near.sh.name}」（徒歩約${walkMin(near.d)}分・${fmtDist(near.d)}）。` : `いちばん近いのは「${near.sh.name}」（徒歩約${walkMin(near.d)}分・${fmtDist(near.d)}）。`}${chains.length ? `${chains.slice(0, 3).map(chainName).join("・")}${chains.length > 3 ? "など" : ""}のお店があります。` : ""}${!top && most && most.k ? `取扱中のガチャがいちばん多いのは「${most.sh.name}」（${most.k}種）です。` : ""}`
        : kOf(best) ? S.leadBest(name, st.shops.length, st.km, bestLabel, kOf(best), walkMin(best.d)) : S.lead(name, st.shops.length, st.km, bestLabel || chainLabelOr(near), walkMin(near.d));
      const lead = [lmLead, leadShops].filter(Boolean).join(ja ? "" : " ");
      const desc = ja
        ? `${name}の周りにあるガチャガチャの設置場所（設置店）${n}店。${big ? `有名なガチャ専門店「${bigName}」をはじめ、` : ""}${near ? `いちばん近いのは「${near.sh.name}」（徒歩約${walkMin(near.d)}分）。` : ""}住所・徒歩の目安・営業時間・取扱中のガチャの数・地図つき。`
        : S.descN(name, n, bigName || bestLabel || (near ? chainLabelOr(near) : ""));
      const gm = (x) => `<a href="${esc(gmapUrl(x.lm || x.sh))}" target="_blank" rel="noopener">${ja ? "Googleマップで開く" : S.gmaps}</a>`;
      // 有名なガチャ専門店（カード）
      const lmCard = (x) => {
        const lm = x.lm, nm = lmName(lm), link = x.sh ? `${c.R}shop/${x.sh.id}.html` : "";
        const meta = [walkTxt(x), lm.machines ? (ja ? `約${lm.machines.toLocaleString("en-US")}台` : S.machines(lm.machines)) : "", lm.hours ? (ja ? `営業 ${lm.hours.replace(/\(.*?\)/g, "").trim()}` : S.hours(lm.hours)) : ""].filter(Boolean);
        const pay = lm.cashless === true ? (ja ? "キャッシュレス対応" : S.cashY) : lm.cashless === false ? (ja ? "現金（100円玉）のみ" : S.cashN) : "";
        const closing = lm.closing ? (ja ? `${lm.closing.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, "$1年$2月$3日")}で閉店予定` : S.closing(lm.closing)) : "";
        const where = ja ? (x.sh ? x.sh.address : "") : lm.floor_en || "";
        return `<div class="lm-card"><b>${link ? `<a href="${link}">${esc(nm)}</a>` : esc(nm)}</b>${!ja && nm !== lm.name_ja ? `<small lang="ja">${esc(lm.name_ja)}</small>` : ""}${where ? `<span${ja ? "" : ' lang="en"'}>${esc(where)}</span>` : ""}<em>${esc(meta.join(ja ? "・" : " · "))}</em>${pay || closing ? `<span class="lm-note">${esc([closing, pay].filter(Boolean).join(ja ? "・" : " · "))}</span>` : ""}${lang === "en" && lm.notes_en && !lm.closing ? `<span class="lm-note">${esc(lm.notes_en)}</span>` : ""}<span>${gm(x)}</span></div>`;
      };
      const row = (x) => {
        const sh = x.sh, k = (SHOP_OFFICIAL[sh.id] || []).length, chn = ja ? null : CHAIN_BY_SHOP.get(sh.id);
        // 外国語：チェーンのお店はチェーン名を太字で、日本語の店名は小さく。取扱30種以上は「最大規模」バッジ
        const flag = !ja && k >= 30 ? ` <mark class="ct-tag">${esc(S.flagship)}</mark>` : "";
        return `<div class="shop-row"><b>${chn ? `<a href="${c.R}shop/${sh.id}.html">${esc(chainLabel(chn, lang))}</a>${flag} <small lang="ja">${esc(sh.name)}</small>` : `<a href="${c.R}shop/${sh.id}.html"${jl}>${esc(sh.name)}</a>${flag}`}</b><span${jl}>${esc(sh.address || sh.pref || "")}</span><em>${ja ? `徒歩約${walkMin(x.d)}分（${fmtDist(x.d)}）` : esc(S.walk(walkMin(x.d), fmtDist(x.d)))}${k ? `・${ja ? `取扱中 ${k}種` : esc(S.titles(k))}` : ""}</em><span>${gm(x)}</span></div>`;
      };
      // 地図（Leaflet。地図が画面に近づいたときに読み込む）。有名店は金色、ほかは青
      const pins = [...lms.map((x) => ({ a: x.lm.lat, o: x.lm.lng, t: lmName(x.lm), u: x.sh ? `${c.R}shop/${x.sh.id}.html` : "", m: 1 })),
        ...list.slice(0, 40).map((x) => ({ a: x.sh.lat, o: x.sh.lng, t: !ja && CHAIN_BY_SHOP.get(x.sh.id) ? chainLabel(CHAIN_BY_SHOP.get(x.sh.id), lang) : x.sh.name, u: `${c.R}shop/${x.sh.id}.html`, m: 0 }))]
        .map((p) => ({ ...p, a: +Number(p.a).toFixed(5), o: +Number(p.o).toFixed(5) }));
      const mapHtml = `<div id="stn-map" class="stn-map" role="img" aria-label="${esc(ja ? `${name}周辺のガチャのお店の地図` : S.mapAria(name))}"></div>
    <script type="application/json" id="stn-map-data">${JSON.stringify({ c: [st.lat, st.lng], s: name, p: pins }).replace(/</g, "\\u003c")}</script>
    <script>(function(){var el=document.getElementById("stn-map");if(!el)return;var go=function(){if(go.d)return;go.d=1;var l=document.createElement("link");l.rel="stylesheet";l.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";document.head.appendChild(l);var s=document.createElement("script");s.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";s.defer=true;s.onload=function(){try{var D=JSON.parse(document.getElementById("stn-map-data").textContent),L=window.L,m=L.map(el,{scrollWheelZoom:false}).setView(D.c,15);L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(m);var e=function(t){return String(t).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};var b=[D.c];L.circleMarker(D.c,{radius:6,color:"#333",weight:2,fillColor:"#fff",fillOpacity:1}).addTo(m).bindTooltip(e(D.s));D.p.forEach(function(p){L.circleMarker([p.a,p.o],{radius:p.m?9:6,color:p.m?"#8a6200":"#1f5fbf",weight:2,fillColor:p.m?"#f2b705":"#4a8ef0",fillOpacity:.9}).addTo(m).bindPopup(p.u?'<a href="'+e(p.u)+'">'+e(p.t)+"</a>":e(p.t));if(p.m)b.push([p.a,p.o])});if(b.length>1)m.fitBounds(b,{padding:[28,28],maxZoom:16})}catch(_){}};document.head.appendChild(s)};if("IntersectionObserver"in window){var io=new IntersectionObserver(function(es){if(es.some(function(x){return x.isIntersecting})){io.disconnect();go()}},{rootMargin:"200px"});io.observe(el)}else go()})();</script>`;
      // よくある質問（外国語だけ。データから作る）
      const faq = [];
      if (!ja) {
        if (big && big.lm.machines) faq.push([S.qBig(name), S.aBig(bigName, big.lm.machines, big.lm.floor_en, big.lm.in_terminal ? null : walkMin(big.d))]);
        else if (big) faq.push([S.qBig(name), S.aBigNoN(bigName, big.lm.floor_en)]);
        else if (best && kOf(best)) faq.push([S.qBig(name), S.aBigK(bestLabel || S.shopGeneric, kOf(best), walkMin(best.d))]);
        const hrs = lms.filter((x) => x.lm.hours).slice(0, 3);
        if (hrs.length) faq.push([S.qHours(name), S.aHours(hrs.map((x) => S.hoursPair(lmName(x.lm), x.lm.hours)).join(S.listSep))]);
        const walkable = [...lms.filter((x) => !x.lm.in_terminal), ...st.shops].sort((a, b) => a.d - b.d)[0];
        if (walkable && st.region !== "airport") {
          const ch = walkable.lm ? null : CHAIN_BY_SHOP.get(walkable.sh.id);
          faq.push([S.qNear(name), S.aNear(walkable.lm ? lmName(walkable.lm) : ch ? chainLabel(ch, lang) : S.shopGeneric, walkMin(walkable.d), fmtDist(walkable.d))]);
        }
      }
      const ids = new Set(st.shops.flatMap((x) => SHOP_OFFICIAL[x.sh.id] || []));
      const local = WEEK.items.filter((it) => ids.has(it.id));
      const wk = (local.length ? local : WEEK.items).slice(0, 12);
      const others = STATIONS.filter((x) => x.region === st.region && x !== st);
      const mapGoId = near ? near.sh.id : lms[0] && lms[0].sh ? lms[0].sh.id : "";
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.H}station.html">${stCrumb}</a><span>/</span><span>${esc(name)}</span></nav>
  <header class="page-head"><h1>${esc(ja ? `${name}周辺のガチャガチャ設置場所・設置店` : S.h1(name))}</h1><p class="lead">${esc(lead)}</p>
    <div class="item-actions"><a class="btn btn-gold" href="${c.R}gachakatsu.html">${ja ? "ガチャ活ルートを作る" : S.routeGo}</a><a class="btn" href="${c.R}map.html${mapGoId ? `#${mapGoId}` : ""}">${ja ? "ガチャマップで見る" : S.mapGo}</a></div>
  </header>
  ${lms.length ? `<section class="section" id="landmarks" style="padding-top:32px">
    <div class="section-head"><h2>${ja ? "有名なガチャ専門店" : esc(S.lmH)}</h2></div>
    <div class="lm-list">${lms.map(lmCard).join("")}</div>
    <p class="fine" style="margin-top:10px">${ja ? `台数・営業時間は公式サイトや大手メディアの情報です（${esc(LANDMARKS_CHECKED)}確認）。変わることがあるので、お出かけ前にお店でご確認ください。` : esc(S.lmNote(LANDMARKS_CHECKED))}</p>
  </section>` : ""}
  <section class="section${lms.length ? " section-tight" : ""}" id="map"${lms.length ? "" : ' style="padding-top:32px"'}>
    ${mapHtml}
  </section>
  ${list.length ? `<section class="section section-tight" id="shops">
    <div class="section-head"><h2>${ja ? `${lms.length ? "ほかの設置店" : `${esc(name)}から近い順`}（${list.length}店）` : `${esc(lms.length ? S.shopsMoreH : S.shopsH)} (${list.length})`}</h2></div>
    <div class="shop-list">${list.map(row).join("")}</div>
    <p class="fine" style="margin-top:12px">${ja ? "お店の情報はバンダイ公式「ガシャポンどこ？」の取扱店をもとにしています。距離はまっすぐ測った目安で、徒歩は分速80mで計算しています。営業時間はお店でご確認ください。" : esc(S.note)}</p>
  </section>` : ""}
  ${faq.length ? `<section class="section section-tight" id="faq"><div class="section-head"><h2>${esc(S.faqH)}</h2></div>
    <dl class="prose stn-faq">${faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl></section>` : ""}
  ${wk.length ? `<section class="section section-tight">
    <div class="section-head"><h2>${ja ? (local.length ? "このあたりで今週発売のガチャ" : "今週発売のガチャ") : esc(local.length ? S.weekH : S.weekAllH)}</h2><a class="more" href="${c.H}week.html">${lang !== "ja" ? t.x.seeAll : "全部見る"}</a></div>
    <div class="grid row-scroll">${wk.map((it) => card(it, c)).join("")}</div>
  </section>` : ""}
  ${ja ? `<section class="section section-tight"><div class="panel">
    <h2 style="font-size:20px">何店か回るなら「ガチャ活ルート」</h2>
    <p class="fine" style="margin-top:4px">出発する場所に「${esc(name.replace(/（.*?）/g, ""))}」と入れると、近くのお店を回りやすい順番に並べます。探したいガチャを入れれば、取扱のあるお店だけで作れます。</p>
    <div class="map-add-btns"><a class="btn btn-gold" href="${c.R}gachakatsu.html">ガチャ活ルートを作る →</a></div>
  </div></section>` : `<section class="section section-tight"><div class="panel">
    <h2 style="font-size:20px">${esc(S.routeH)}</h2>
    <p class="fine" style="margin-top:4px">${esc(S.routeText)}</p>
    <div class="map-add-btns"><a class="btn btn-gold" href="${c.R}gachakatsu.html">${esc(S.routeGo)}</a></div>
    <h3 class="arr-h">${esc(S.tipsH)}</h3>
    <ul class="prose" style="margin:8px 0 0;padding-left:1.2em">${S.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
  </div></section>`}
  ${others.length ? `<section class="section section-tight"><div class="section-head"><h2>${ja ? "同じエリアのほかの駅" : esc(S.otherH)}</h2></div>
    <div class="chara-list">${others.map((x) => `<a class="chara-chip" href="${c.H}station/${x.slug}.html">${esc(stName(x))}<small>${x.count}</small></a>`).join("")}<a class="chara-chip chara-more" href="${c.H}station.html">${ja ? "駅をすべて見る →" : esc(S.allStations)}</a></div></section>` : ""}
</div>`;
      const lmLd = (x) => ({ "@type": "Store", name: lmName(x.lm), ...(x.sh ? { url: canonical("ja", `shop/${x.sh.id}.html`) } : {}), geo: { "@type": "GeoCoordinates", latitude: x.lm.lat, longitude: x.lm.lng }, hasMap: gmapUrl(x.lm), address: { "@type": "PostalAddress", addressCountry: "JP", addressRegion: st.pref } });
      const jsonld = [
        { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
          { "@type": "ListItem", position: 2, name: stCrumb, item: canonical(lang, "station.html") },
          { "@type": "ListItem", position: 3, name } ] },
        { "@context": "https://schema.org", "@type": "ItemList", name: ja ? `${name}周辺のガチャガチャ設置店` : S.h1(name), numberOfItems: n,
          itemListElement: [...lms.map(lmLd), ...list.map((x) => storeLd(x.sh))].slice(0, 30).map((item, i) => ({ "@type": "ListItem", position: i + 1, item })) },
        ...(faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }] : []),
      ];
      layout({ rel, title, description: desc, body, jsonld, current: ja ? "map" : "station" });
    }
    {
      const rel = "station.html", c = ctx(rel);
      const title = ja ? "駅からさがすガチャガチャ設置店｜主要駅・空港の周辺ガイド" : S.idxTitle;
      const lead = ja ? `秋葉原・池袋・梅田・なんば・博多など、主要な駅と空港${STATIONS.length}か所の周りにあるガチャガチャ設置店をまとめました。駅を選ぶと、歩いて行けるお店が近い順に見られます。` : S.idxLead(STATIONS.length);
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>${esc(stCrumb)}</span></nav>
  <header class="page-head"><h1>${esc(title.split("｜")[0])}</h1><p class="lead">${esc(lead)}</p></header>
  ${STATION_REGIONS.filter((r) => STATIONS.some((x) => x.region === r)).map((r) => `<section class="section section-tight"><div class="section-head"><h2>${esc(regionOf(r))}</h2></div>
    <div class="chara-list">${STATIONS.filter((x) => x.region === r).map((x) => `<a class="chara-chip" href="${c.H}station/${x.slug}.html">${esc(stName(x))}<small>${ja ? `${x.count}店` : esc(S.nShops(x.count))}</small></a>`).join("")}</div></section>`).join("")}
  ${ja ? `<section class="section section-tight"><div class="section-head"><h2>チェーンからさがす</h2></div><div class="chara-list">${CHAINS.map((ch) => `<a class="chara-chip" href="${c.H}chain/${ch.slug}.html">${esc(ch.label)}<small>${ch.shops.length}店</small></a>`).join("")}</div></section>` : ""}
</div>`;
      layout({ rel, title, description: lead, body, current: ja ? "map" : "station", jsonld: [{ "@context": "https://schema.org", "@type": "ItemList", numberOfItems: STATIONS.length,
        itemListElement: STATIONS.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: canonical(lang, `station/${x.slug}.html`), name: ja ? `${stName(x)}周辺のガチャガチャ設置店` : S.h1(stName(x)) })) }] });
    }
  }

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
  <header class="page-head"><h1>${katsu ? "ガチャ活｜近くのガチャを効率よく回ろう" : "みんなのガチャマップ｜ガチャガチャの設置場所をさがす"}</h1><p class="lead">${katsu ? "ガチャ活は、ガチャのあるお店を巡ってお目当てのガチャを探すこと。今いる場所から近いお店を、回りやすい順番でご案内します。" : "全国のガチャのあるお店を地図で探せます。お店の在庫や台数は、みんなの報告で更新されます。地図にないお店は「ガチャのある場所をピン」から、だれでも足せます。"}</p></header>
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
        <div class="kg-list">${[["🪙", "100円玉がすぐ出せるコインケース", "コインケース 100円玉 収納"], ["👜", "カプセルがまとまる巾着・エコバッグ", "エコバッグ コンパクト 折りたたみ"], ["🔋", "地図とナビの電池切れ対策に", "モバイルバッテリー 軽量 薄型"], ["🖼️", "集めたガチャを飾るコレクションケース", "コレクションケース フィギュア ミニ"]].map(([ic, label, q]) => { const a = affSearch(q); return `<div class="kg"><span class="kg-ic" aria-hidden="true">${ic}</span><span class="kg-l">${label}</span><span class="kg-b"><a href="${esc(a.amazon)}" target="_blank" rel="sponsored nofollow noopener">Amazon</a><a href="${esc(a.rakuten)}" target="_blank" rel="sponsored nofollow noopener">楽天</a></span></div>`; }).join("")}</div>
      </div>
    </div>
    <p class="fine">地図：国土地理院の地図と、拡大したときは OpenStreetMap を使っています。お店の情報はバンダイ公式「ガシャポンどこ？」の取扱店と、みんなの報告をもとにしています。<a href="${c.R}rules.html">投稿のきまり</a></p>
  </section>
  <section class="section" id="prefs"><div class="section-head"><h2>都道府県から探す</h2></div>
    <div class="archive-list">${prefs.map((p) => `<a href="${c.R}shops/${prefSlug(p)}.html">${p}（${SHOPS.filter((x) => x.pref === p).length}）</a>`).join("")}</div>
  </section>
  <section class="section section-tight"><div class="section-head"><h2>駅からさがす</h2><a class="more" href="${c.H}station.html">駅をすべて見る</a></div>
    <div class="chara-list">${STATIONS.map((x) => `<a class="chara-chip" href="${c.H}station/${x.slug}.html">${esc(x.ja)}<small>${x.count}</small></a>`).join("")}</div>
  </section>
  <section class="section section-tight"><div class="section-head"><h2>チェーンからさがす</h2><a class="more" href="${c.H}chain.html">チェーンの一覧</a></div>
    <div class="chara-list">${CHAINS.map((ch) => `<a class="chara-chip" href="${c.H}chain/${ch.slug}.html">${esc(ch.label)}<small>${ch.shops.length}</small></a>`).join("")}</div>
  </section>
</div>`;
      layout({ rel, title: katsu ? "ガチャ活ルート｜近くのガチャのあるお店を効率よく回る" : "みんなのガチャマップ｜全国のガチャガチャ設置場所・設置店を地図で探す", description: katsu ? "ガチャ活（ガチャ巡り）のルートを自動で作成。今いる場所から近いガチャのあるお店を、回りやすい順番でご案内。探したいガチャの取扱店だけで作ることもできます。" : `全国${SHOPS.length}店のガチャガチャ設置場所（設置店）を地図で探せます。在庫や台数はみんなの報告で更新。地図にないお店も追加できます。`, body, current: katsu ? "katsu" : "map", jaOnly: true, extraHead: LEAF });
    }
    // 市区町村ページ（/shops/<都道府県>/<市区町村>）：3店以上ある市区町村だけ。URL は主要な市・区はローマ字、それ以外は市区町村名から作るハッシュ（名前が同じなら毎回同じ）
    const CITY_MIN = 3;
    const CITY_SLUG = {
      "札幌市": "sapporo", "仙台市": "sendai", "さいたま市": "saitama", "千葉市": "chiba", "横浜市": "yokohama", "川崎市": "kawasaki", "相模原市": "sagamihara", "新潟市": "niigata", "静岡市": "shizuoka", "浜松市": "hamamatsu",
      "名古屋市": "nagoya", "京都市": "kyoto", "大阪市": "osaka", "堺市": "sakai", "神戸市": "kobe", "岡山市": "okayama", "広島市": "hiroshima", "北九州市": "kitakyushu", "福岡市": "fukuoka", "熊本市": "kumamoto",
      "千代田区": "chiyoda", "中央区": "chuo", "港区": "minato", "新宿区": "shinjuku", "文京区": "bunkyo", "台東区": "taito", "墨田区": "sumida", "江東区": "koto", "品川区": "shinagawa", "目黒区": "meguro", "大田区": "ota", "世田谷区": "setagaya",
      "渋谷区": "shibuya", "中野区": "nakano", "杉並区": "suginami", "豊島区": "toshima", "北区": "kita", "荒川区": "arakawa", "板橋区": "itabashi", "練馬区": "nerima", "足立区": "adachi", "葛飾区": "katsushika", "江戸川区": "edogawa",
      "八王子市": "hachioji", "立川市": "tachikawa", "町田市": "machida", "船橋市": "funabashi", "柏市": "kashiwa", "川口市": "kawaguchi", "高松市": "takamatsu", "松山市": "matsuyama", "那覇市": "naha", "鹿児島市": "kagoshima", "金沢市": "kanazawa", "宇都宮市": "utsunomiya",
    };
    const citySlug = (k) => CITY_SLUG[k] || hashSlug(k);
    const cityFromM = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth() - 2, 1)).toISOString().slice(0, 7);
    let cityPages = 0;
    // 都道府県ごとのお店一覧
    for (const p of PREF_ORDER) {
      const list = SHOPS.filter((x) => x.pref === p).sort((a, b) => (SHOP_OFFICIAL[b.id] || []).length - (SHOP_OFFICIAL[a.id] || []).length || (a.name > b.name ? 1 : -1));
      if (!list.length) continue;
      const rel = `shops/${prefSlug(p)}.html`;
      const c = ctx(rel);
      // 市区町村ごとに分ける（お店の多い順）
      const byCity = new Map();
      for (const sh of list) { const k = addrParts(sh.address, p).city || "そのほかの地域"; if (!byCity.has(k)) byCity.set(k, []); byCity.get(k).push(sh); }
      const cities = [...byCity.entries()].sort((a, b) => (a[0] === "そのほかの地域") - (b[0] === "そのほかの地域") || b[1].length - a[1].length);
      const pSt = STATIONS.filter((x) => x.pref === p);
      const pCh = CHAINS.map((ch) => ({ ch, k: ch.shops.filter((sh) => sh.pref === p).length })).filter((x) => x.k).sort((a, b) => b.k - a.k);
      // 市区町村ページがある市区町村（3店以上）
      const pageCities = cities.filter(([k, v]) => k !== "そのほかの地域" && v.length >= CITY_MIN);
      const cityRel = (k) => `shops/${prefSlug(p)}/${citySlug(k)}.html`;
      const hasCityPage = new Set(pageCities.map(([k]) => k));
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.R}map.html">ガチャマップ</a><span>/</span><span>${p}</span></nav>
  <header class="page-head"><h1>${p}のガチャガチャ設置場所・設置店（${list.length}店）</h1><p class="lead">${p}でガチャを置いているお店${list.length}店を、市区町村ごとに並べています（${cities.slice(0, 3).map(([k, v]) => `${k}${v.length}店`).join("・")}${cities.length > 3 ? "など" : ""}）。それぞれ取扱中のガチャが多い順です。</p></header>
  ${cities.length > 1 ? `<nav class="archive-list" aria-label="市区町村" style="margin-top:20px">${cities.map(([k, v], i) => `<a href="#city-${i + 1}">${esc(k)}（${v.length}）</a>`).join("")}</nav>` : ""}
  ${pageCities.length ? `<section class="section section-tight"><div class="section-head"><h2>市区町村から探す</h2></div><div class="chara-list">${pageCities.map(([k, v]) => `<a class="chara-chip" href="${c.R}${cityRel(k)}">${esc(k)}<small>${v.length}店</small></a>`).join("")}</div></section>` : ""}
  ${pSt.length ? `<section class="section section-tight"><div class="section-head"><h2>駅からさがす</h2></div><div class="chara-list">${pSt.map((x) => `<a class="chara-chip" href="${c.H}station/${x.slug}.html">${esc(x.ja)}周辺<small>${x.count}店</small></a>`).join("")}</div></section>` : ""}
  ${pCh.length ? `<section class="section section-tight"><div class="section-head"><h2>${p}にあるチェーン</h2></div><div class="chara-list">${pCh.map(({ ch, k }) => `<a class="chara-chip" href="${c.H}chain/${ch.slug}.html">${esc(ch.label)}<small>${k}店</small></a>`).join("")}</div></section>` : ""}
  ${cities.map(([k, v], i) => `<section class="section section-tight" id="city-${i + 1}"><div class="section-head"><h2>${esc(k)}のガチャガチャ設置店（${v.length}店）</h2>${hasCityPage.has(k) ? `<a class="more" href="${c.R}${cityRel(k)}">${esc(k)}の設置場所をくわしく</a>` : ""}</div><div class="shop-list">${v.map((sh) => shopCard(sh, c)).join("")}</div></section>`).join("\n  ")}
</div>`;
      layout({ rel, title: `${p}のガチャガチャ設置場所・設置店（${list.length}店）｜市区町村別の一覧`, description: `${p}でガチャガチャを置いているお店${list.length}店を市区町村別に一覧（${cities.slice(0, 3).map(([k, v]) => `${k}${v.length}店`).join("・")}など）。取扱中のガチャ、在庫や台数のみんなの報告も見られます。`, body, current: "map", jaOnly: true,
        jsonld: [
          { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
            { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
            { "@type": "ListItem", position: 2, name: "ガチャマップ", item: canonical(lang, "map.html") },
            { "@type": "ListItem", position: 3, name: p } ] },
          { "@context": "https://schema.org", "@type": "ItemList", name: `${p}のガチャガチャ設置店`, numberOfItems: list.length, itemListElement: list.slice(0, 30).map((sh, i) => ({ "@type": "ListItem", position: i + 1, item: storeLd(sh) })) },
        ] });
      // 市区町村ページ
      for (const [k, v] of pageCities) {
        const crel = cityRel(k), cc = ctx(crel), n = v.length;
        const most = v.map((sh) => ({ sh, k: (SHOP_OFFICIAL[sh.id] || []).length })).filter((x) => x.k).slice(0, 2); // v は取扱中のガチャが多い順
        // この市区町村でいま取扱店が多いガチャ（公式の取扱店の数。2か月前以降に発売のもの）
        const cnt = new Map();
        for (const sh of v) for (const id of SHOP_OFFICIAL[sh.id] || []) { const it = itemById.get(id); if (it && it.release >= cityFromM) cnt.set(it, (cnt.get(it) || 0) + 1); }
        const hot = [...cnt.entries()].sort((a, b) => b[1] - a[1] || byPopular(a[0], b[0])).slice(0, 8);
        const sts = [...new Set(v.map((sh) => (STATION_OF_SHOP.get(sh.id) || {}).st).filter(Boolean))];
        const cCh = CHAINS.map((ch) => ({ ch, k: v.filter((sh) => CHAIN_BY_SHOP.get(sh.id) === ch).length })).filter((x) => x.k).sort((a, b) => b.k - a.k);
        const others = pageCities.filter(([o]) => o !== k);
        const lead = `${k}（${p}）でガチャガチャを置いているお店${n}店の設置場所をまとめました。${most.length ? `取扱中のガチャが多いのは${most.map((x) => `「${x.sh.name}」（${x.k}種）`).join("、")}。` : ""}${hot.length ? `いま${k}で取扱店が多いガチャは「${hot[0][0].name}」（${hot[0][1]}店）です。` : ""}お店のページで住所・地図・取扱中のガチャ・みんなの在庫報告が見られます。`;
        const cbody = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${cc.H}index.html">${t.home}</a><span>/</span><a href="${cc.R}map.html">ガチャマップ</a><span>/</span><a href="${cc.R}${rel}">${p}</a><span>/</span><span>${esc(k)}</span></nav>
  <header class="page-head"><h1>${esc(k)}のガチャガチャ設置場所・設置店（${n}店）</h1><p class="lead">${esc(lead)}</p></header>
  <section class="section" style="padding-top:32px"><div class="section-head"><h2>${esc(k)}のガチャガチャ設置店（${n}店）</h2><a class="more" href="${cc.R}${rel}">${p}のお店をすべて見る</a></div><div class="shop-list">${v.map((sh) => shopCard(sh, cc)).join("")}</div></section>
  ${hot.length ? `<section class="section section-tight"><div class="section-head"><h2>${esc(k)}で取扱店が多いガチャ（公式）</h2></div>
    <p class="fine" style="margin-top:-12px;margin-bottom:16px">${hot.slice(0, 3).map(([it, j]) => `${esc(it.name)}（${j}店）`).join("、")}など。バンダイ公式「ガシャポンどこ？」の取扱店の数です。</p>
    <div class="grid row-scroll">${hot.map(([it]) => card(it, cc)).join("")}</div></section>` : ""}
  ${sts.length ? `<section class="section section-tight"><div class="section-head"><h2>駅からさがす</h2></div><div class="chara-list">${sts.map((x) => `<a class="chara-chip" href="${cc.H}station/${x.slug}.html">${esc(x.ja)}周辺<small>${x.count}店</small></a>`).join("")}</div></section>` : ""}
  ${cCh.length ? `<section class="section section-tight"><div class="section-head"><h2>${esc(k)}にあるチェーン</h2></div><div class="chara-list">${cCh.map(({ ch, k: j }) => `<a class="chara-chip" href="${cc.H}chain/${ch.slug}.html">${esc(ch.label)}<small>${j}店</small></a>`).join("")}</div></section>` : ""}
  ${others.length ? `<section class="section section-tight"><div class="section-head"><h2>${p}のほかの市区町村</h2><a class="more" href="${cc.R}${rel}">${p}のお店をすべて見る</a></div><div class="chara-list">${others.map(([o, w]) => `<a class="chara-chip" href="${cc.R}${cityRel(o)}">${esc(o)}<small>${w.length}店</small></a>`).join("")}</div></section>` : ""}
  <p class="fine" style="margin-top:32px">お店の情報は、バンダイ公式「ガシャポンどこ？」の取扱店とみんなの報告をもとにしています。市区町村は住所から判定しているため、実際と違うことがあります。</p>
</div>`;
        layout({ rel: crel, title: `${k}のガチャガチャ設置場所・設置店${n}店｜${p}`, description: `${p}${k}でガチャガチャが置いてある設置場所・お店${n}店の一覧。${most.length ? `取扱中のガチャが多いのは「${most[0].sh.name.length > 24 ? most[0].sh.name.slice(0, 23) + "…" : most[0].sh.name}」（${most[0].k}種）。` : ""}住所・地図・取扱中のガチャ・在庫や台数のみんなの報告が見られます。`, body: cbody, current: "map", jaOnly: true, noindex: n < CITY_MIN,
          jsonld: [
            { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
              { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
              { "@type": "ListItem", position: 2, name: "ガチャマップ", item: canonical(lang, "map.html") },
              { "@type": "ListItem", position: 3, name: p, item: canonical(lang, rel) },
              { "@type": "ListItem", position: 4, name: k } ] },
            { "@context": "https://schema.org", "@type": "ItemList", name: `${k}のガチャガチャ設置店`, numberOfItems: n, itemListElement: v.slice(0, 30).map((sh, i) => ({ "@type": "ListItem", position: i + 1, item: storeLd(sh) })) },
          ] });
        cityPages++;
      }
    }
    console.log(`  市区町村ページ: ${cityPages}ページ（${CITY_MIN}店以上の市区町村）`);
    // チェーンごとのお店一覧（/chain/〇〇）と、チェーンの一覧（/chain）
    {
      const fromM = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth() - 2, 1)).toISOString().slice(0, 7);
      for (const ch of CHAINS) {
        const rel = `chain/${ch.slug}.html`, c = ctx(rel);
        const n = ch.shops.length;
        const prefs = PREF_ORDER.map((p) => [p, ch.shops.filter((sh) => sh.pref === p)]).filter(([, v]) => v.length);
        const topPrefs = [...prefs].sort((a, b) => b[1].length - a[1].length).slice(0, 3);
        // このチェーンでいま取扱が多いガチャ（公式の取扱店の数。2か月前以降に発売のもの）
        const cnt = new Map();
        for (const sh of ch.shops) for (const id of SHOP_OFFICIAL[sh.id] || []) { const it = itemById.get(id); if (it && it.release >= fromM) cnt.set(it, (cnt.get(it) || 0) + 1); }
        const hot = [...cnt.entries()].sort((a, b) => b[1] - a[1] || byPopular(a[0], b[0])).slice(0, 12);
        const what = ch.store ? `${ch.label}のガチャガチャ設置店` : ch.label;
        const title = `${ch.store ? `${ch.label}のガチャガチャ設置店一覧` : `${ch.label} 店舗一覧`}（全国${n}店）｜都道府県別・取扱中のガチャ`;
        const lead = `${what}は、バンダイ公式の取扱店情報で全国${n}店（${topPrefs.map(([p, v]) => `${p}${v.length}店`).join("・")}${prefs.length > 3 ? "など" : ""}）。都道府県ごとに一覧にしています。${hot.length ? `いま取扱が多いのは「${hot[0][0].name}」（${hot[0][1]}店）です。` : ""}`;
        const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.H}chain.html">チェーンからさがす</a><span>/</span><span>${esc(ch.label)}</span></nav>
  <header class="page-head"><h1>${esc(ch.store ? `${ch.label}のガチャガチャ設置店` : `${ch.label}の店舗一覧`)}（全国${n}店）</h1><p class="lead">${esc(lead)}</p></header>
  ${prefs.length > 1 ? `<nav class="archive-list" aria-label="都道府県" style="margin-top:20px">${prefs.map(([p, v]) => `<a href="#${prefSlug(p)}">${p}（${v.length}）</a>`).join("")}</nav>` : ""}
  ${hot.length ? `<section class="section section-tight"><div class="section-head"><h2>${esc(ch.label)}で取扱が多いガチャ（公式）</h2></div>
    <p class="fine" style="margin-top:-12px;margin-bottom:16px">${hot.slice(0, 3).map(([it, k]) => `${esc(it.name)}（${k}店）`).join("、")}など。バンダイ公式「ガシャポンどこ？」の取扱店の数です。</p>
    <div class="grid row-scroll">${hot.map(([it]) => card(it, c)).join("")}</div></section>` : ""}
  ${prefs.map(([p, v]) => `<section class="section section-tight" id="${prefSlug(p)}"><div class="section-head"><h2>${p}の${esc(what)}（${v.length}店）</h2><a class="more" href="${c.R}shops/${prefSlug(p)}.html">${p}のお店をすべて見る</a></div>
    <ul class="where-shops">${v.map((sh) => `<li><a href="${c.R}shop/${sh.id}.html">${esc(sh.name)}</a><span>${esc(addrParts(sh.address, p).city || "")}${(SHOP_OFFICIAL[sh.id] || []).length ? `・${(SHOP_OFFICIAL[sh.id] || []).length}種` : ""}</span></li>`).join("")}</ul></section>`).join("\n  ")}
  <p class="fine" style="margin-top:32px">お店の情報は、バンダイ公式「ガシャポンどこ？」の取扱店をもとに、店名からチェーンを判定しています。実際と違うことがあります。</p>
</div>`;
        layout({ rel, title, description: lead, body, current: "map", jaOnly: true,
          jsonld: [
            { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
              { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
              { "@type": "ListItem", position: 2, name: "チェーンからさがす", item: canonical(lang, "chain.html") },
              { "@type": "ListItem", position: 3, name: ch.label } ] },
            { "@context": "https://schema.org", "@type": "ItemList", name: `${what}の店舗一覧`, numberOfItems: n, itemListElement: ch.shops.slice(0, 30).map((sh, i) => ({ "@type": "ListItem", position: i + 1, item: storeLd(sh) })) },
          ] });
      }
      const rel = "chain.html", c = ctx(rel);
      const lead = `ガシャポンのデパート・ガチャガチャの森・#C-plaなど、ガチャガチャのお店${CHAINS.length}チェーンの店舗を、都道府県別にまとめています（バンダイ公式の取扱店情報より）。`;
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.R}map.html">ガチャマップ</a><span>/</span><span>チェーンからさがす</span></nav>
  <header class="page-head"><h1>チェーンからさがすガチャガチャのお店</h1><p class="lead">${esc(lead)}</p></header>
  <section class="section" style="padding-top:32px"><div class="shop-list">${CHAINS.map((ch) => { const ps = new Set(ch.shops.map((sh) => sh.pref).filter(Boolean)); return `<a class="shop-row" href="${c.H}chain/${ch.slug}.html"><b>${esc(ch.label)}</b><span>全国${ch.shops.length}店・${ps.size}都道府県</span></a>`; }).join("")}</div></section>
  <section class="section section-tight"><div class="section-head"><h2>駅からさがす</h2></div><div class="chara-list">${STATIONS.map((x) => `<a class="chara-chip" href="${c.H}station/${x.slug}.html">${esc(x.ja)}<small>${x.count}</small></a>`).join("")}</div></section>
</div>`;
      layout({ rel, title: "ガチャガチャのチェーン店一覧｜ガシャポンのデパート・ガチャガチャの森・#C-plaなど", description: lead, body, current: "map", jaOnly: true });
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
      layout({ rel, title: "☆評価の高いガチャのお店ランキング（都道府県別）", description: "みんなの☆評価が高いガチャガチャのお店ランキングを都道府県別に。品ぞろえや台数のコメントも見られます。", body, current: "toprated", jaOnly: true, noindex: top.length < 5 }); // 評価されたお店が5店そろうまでは検索に出さない
    }
    // 抽選情報
    {
      const rel = "lottery.html", c = ctx(rel);
      const live = LOT_LIVE, KIND = LOT_KIND, groups = LOT_GROUPS; // 言語のループの前で計算したもの（商品ページと共通）
      const fmt = (d) => { const m = d.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/); if (!m) return d; const w = "日月火水木金土"[new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`).getUTCDay()]; return `${+m[2]}/${+m[3]}(${w}) ${m[4]}:${m[5]}`; };
      const prefs = [...new Set(live.map((x) => x.pref).filter(Boolean))].sort((a, b) => PREF_ORDER.indexOf(a) - PREF_ORDER.indexOf(b));
      // タイトル・説明文に、抽選の多い商品の名前を2つ入れる
      const topLot = [...LOT_BY_ITEM.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 2).map(([id]) => itemById.get(id)).filter(Boolean).map((it) => it.name);
      const titleHtml = (g) => g.parts.map(({ p, it }) => (it ? `<a href="${c.H}item/${it.id}.html">${esc(p)}</a>` : esc(p))).join(" / ");
      const lotRow = (x) => `<li class="lot" data-pref="${esc(x.pref || "")}" data-start="${esc(x.start)}" data-end="${esc(x.end)}">
        <div class="lot-top"><span class="lot-state"></span><span class="lot-kind">${KIND[x.kind] || "抽選"}</span>${x.pref ? `<span class="lot-pref">📍${esc(x.pref)}</span>` : ""}</div>
        <p class="lot-store">${esc(x.store)}</p>
        <p class="lot-when">受付：${fmt(x.start)} 〜 <b>${fmt(x.end)}</b></p>
        <p class="lot-how">応募方法：${esc(x.method || "お店でご確認ください")}</p>
        ${x.note ? `<p class="lot-note">${esc(x.note)}</p>` : ""}
        ${x.url ? `<a class="btn btn-gold" href="${esc(x.url)}" target="_blank" rel="noopener">応募ページを開く</a>` : ""}
      </li>`;
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>抽選情報</span></nav>
  <header class="page-head"><h1>ガチャの抽選情報</h1><p class="lead">人気ガチャの抽選販売や、新しいお店のオープン日の入場整理券など、いま受付中・これから始まる抽選をまとめています。商品ごとにまとめて、締め切りが近い順です。</p></header>
  <section class="section" style="padding-top:24px">
    ${prefs.length > 1 ? `<div class="lot-filter" id="lot-filter"><button class="sort is-on" type="button" data-pref="">すべて</button>${prefs.map((p) => `<button class="sort" type="button" data-pref="${p}">${p}</button>`).join("")}</div>` : ""}
    <div class="lot-list" id="lot-list">${groups.length ? groups.map((g) => `<article class="lot-group">
      <div class="lot-head">${g.it && g.it.image ? `<a class="lot-thumb" href="${c.H}item/${g.it.id}.html" tabindex="-1" aria-hidden="true"><img src="${esc(imgURL({ image: thumbOf(g.it.image) }, c.R))}" alt="" width="64" height="64" loading="lazy" decoding="async"></a>` : ""}<div><h3>${titleHtml(g)}</h3><p class="lot-n">${g.list.length}店舗${g.it ? `・<a href="${c.H}item/${g.it.id}.html">商品ページ（発売日・値段）→</a>` : ""}</p></div></div>
      <ul class="lot-stores">${g.list.map(lotRow).join("")}</ul>
    </article>`).join("") : '<p class="fine">いま受付中の抽選はありません。</p>'}</div>
    <p class="lot-caution">抽選の内容は変わることがあります。応募の前に、必ずお店の公式X・公式サイトで最新の情報をご確認ください。</p>
  </section>
</div>`;
      const events = live.map((x) => lotEventLd(x, canonical(lang, rel), (() => { const g = groups.find((y) => y.title === x.title); return g && g.it ? absImg(g.it) : ""; })()));
      layout({ rel, title: topLot.length ? `ガチャの抽選情報｜${topLot.join("・")}ほか受付中` : "ガチャの抽選情報（受付中・これから）",
        description: `人気ガチャの抽選販売、お店のオープン日の入場整理券など、受付中・これから始まるガチャの抽選情報まとめ。${live.length ? `いま受付中は${live.length}件${topLot.length ? `（${topLot.map((n) => `「${n}」`).join("")}など）` : ""}。` : ""}締切が近い順に、お店・受付期間・応募方法をまとめています。`,
        body, current: "lottery", jaOnly: true, jsonld: events });
    }
    // お店ごとのページ
    for (const sh of SHOPS) {
      const rel = `shop/${sh.id}.html`;
      const c = ctx(rel);
      const off = (SHOP_OFFICIAL[sh.id] || []).map((id) => itemById.get(id)).filter(Boolean).sort(byNewest);
      const rp = SHOP_REPORTS[sh.id];
      const gmap = gmapUrl(sh);
      const ap = addrParts(sh.address, sh.pref), chn = CHAIN_BY_SHOP.get(sh.id), sto = STATION_OF_SHOP.get(sh.id);
      const nRep = rp ? rp.n : 0, thin0 = !off.length && !nRep;
      const nearby = nearShops(sh, 5);
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.R}map.html">ガチャマップ</a><span>/</span>${sh.pref ? `<a href="${c.R}shops/${prefSlug(sh.pref)}.html">${esc(sh.pref)}</a><span>/</span>` : ""}<span>${esc(sh.name)}</span></nav>
  <article class="shop" id="shop" data-id="${sh.id}" data-api="${c.R}api/shop/${sh.id}" data-report="${c.R}api/report" data-comment="${c.R}api/comment" data-root="${c.R}" data-lat="${sh.lat}" data-lng="${sh.lng}">
    <header class="page-head" style="padding-top:28px">
      <p class="eyebrow">${sh.src === "user" ? `みんなが追加した場所${KIND_LABEL[sh.kind] ? `・${KIND_LABEL[sh.kind]}` : ""}` : "ガシャポン公式の取扱店"}</p>
      <h1>${esc(sh.name)}${/ガチャガチャ/.test(sh.name) ? "のガチャ情報" : "のガチャガチャ"}</h1>
      <p class="shop-sub" style="margin:6px 0 0;font-weight:700;color:var(--text-2)">${esc([`${ap.pref}${ap.city}`, chn ? `${chn.label}の店舗` : "", sh.src === "user" ? "" : "ガシャポン公式の取扱店"].filter(Boolean).join("・"))}${sto ? `・${esc(sto.st.ja)}から徒歩約${walkMin(sto.d)}分` : ""}</p>
      <p class="lead">設置場所：${esc(sh.address || sh.pref || "")}</p>
      <div class="item-actions shop-actions"><a class="btn btn-gold" href="${esc(gmap)}" target="_blank" rel="noopener">Googleマップで開く</a><a class="sort" href="${c.R}map.html#${sh.id}">ガチャマップで見る</a>${sto ? `<a class="sort" href="${c.H}station/${sto.st.slug}.html">${esc(sto.st.ja)}周辺のお店</a>` : ""}${chn ? `<a class="sort" href="${c.H}chain/${chn.slug}.html">${esc(chn.label)}の店舗一覧</a>` : ""}</div>
    </header>
    <div class="shop-grid">
      <div class="shop-mapbox"><div id="shop-map" class="map map-sm"></div>
        ${sh.src === "user" ? `<div class="map-add-btns" id="mv-btns"><button class="sort" type="button" id="mv-start">📍 ピンの位置がずれていたら直す</button></div>` : ""}
        <div class="mv-box" id="mv-box" hidden><p class="fine"><b>地図を動かして、真ん中の＋を正しいお店の場所に合わせてください。</b>拡大すると建物やお店の名前が出ます（1回に動かせるのは1kmまで）。</p>
          <div class="map-add-btns"><button class="btn btn-gold" type="button" id="mv-save">この位置に直す</button><button class="btn btn-ghost" type="button" id="mv-cancel">やめる</button></div></div>
        <p class="fine" id="mv-msg" role="status"></p></div>
      <dl class="arr-stats shop-stats">
        <div${off.length ? "" : " hidden"}><dt>取扱中のガチャ（公式）</dt><dd id="st-off">${off.length}種</dd></div>
        <div${nRep ? "" : " hidden"}><dt>みんなの報告（30日）</dt><dd id="st-rep">${nRep}件</dd></div>
        <div hidden><dt>ガチャの台数（報告）</dt><dd id="st-mac">—</dd></div>
        <div id="st-first"${thin0 ? "" : " hidden"}><dt>まだ情報がありません</dt><dd style="font-size:16px"><a href="#report-box">このお店の情報をいちばんに報告しよう →</a></dd></div>
      </dl>
    </div>
    <p class="shop-warn" id="shop-warn" hidden></p>
    <script>(function(){var Z=/^(0種|0件|—|)$/,f=document.getElementById("st-first");["st-off","st-rep","st-mac"].forEach(function(id){var d=document.getElementById(id);if(!d||!window.MutationObserver)return;new MutationObserver(function(){var on=!Z.test(d.textContent.trim());d.parentNode.hidden=!on;if(on&&f)f.hidden=true;}).observe(d,{childList:true,characterData:true,subtree:true});});})();</script>

    ${off.length ? `<section class="section section-tight shop-off"><div class="section-head"><h2>取扱中のガチャ（公式）</h2></div>
      <p class="fine" style="margin-top:-16px;margin-bottom:20px">バンダイ公式「ガシャポンどこ？」で、このお店の取扱があるガチャです（通信機能のあるマシンのみ）。</p>
      <div class="grid">${off.slice(0, 40).map((it) => card(it, c)).join("")}</div>${off.length > 8 ? `<p class="cal-more-wrap"><button type="button" class="btn cal-more-btn" data-open="すべて見る（${Math.min(off.length, 40)}種）" data-close="閉じる">すべて見る（${Math.min(off.length, 40)}種）</button></p>` : ""}</section>` : ""}

    <section class="section panel" id="report-box">
      <h2 style="font-size:20px">在庫を報告する</h2>
      ${thin0 ? `<p class="shop-first" style="margin:6px 0 0;font-weight:700;color:var(--gold)">このお店の情報をいちばんに報告しよう。見たガチャを1つ入れるだけでOKです。</p>` : ""}
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

    ${nearby.length ? `<section class="section section-tight"><div class="section-head"><h2>近くのガチャガチャ設置店</h2>${sh.pref ? `<a class="more" href="${c.R}shops/${prefSlug(sh.pref)}.html">${esc(sh.pref)}のお店をすべて見る</a>` : ""}</div>
      <div class="shop-list">${nearby.map((x) => `<a class="shop-row" href="${c.R}shop/${x.sh.id}.html"><b>${esc(x.sh.name)}</b><span>${esc(x.sh.address || x.sh.pref || "")}</span><em>ここから${fmtDist(x.d)}${x.d <= 3000 ? `（徒歩約${walkMin(x.d)}分）` : ""}${(SHOP_OFFICIAL[x.sh.id] || []).length ? `・取扱中 ${(SHOP_OFFICIAL[x.sh.id] || []).length}種` : ""}</em></a>`).join("")}</div>
      ${sto ? `<p style="margin-top:16px"><a class="chara-chip" href="${c.H}station/${sto.st.slug}.html">🚉 最寄り駅ガイド：${esc(sto.st.ja)}周辺のガチャガチャ設置店（${sto.st.count}店）</a></p>` : ""}
    </section>` : ""}
  </article>
  <p class="fine" style="margin-top:40px">お店の情報は、バンダイ公式の取扱店とみんなの報告をもとにしています。実際と違うことがあります。営業時間などはお店でご確認ください。<a href="${c.R}rules.html">投稿のきまり</a></p>
</div>
<script type="application/json" id="shop-items">${JSON.stringify(off.map((it) => [it.id, it.name])).replace(/</g, "\\u003c")}</script>`;
      const city = ((sh.address || "").replace(/^\s*(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, "").match(/^.+?[市区町村]/) || [""])[0];
      const thinShop = !off.length && !(rp && rp.n) && !SHOP_RATINGS[sh.id];
      // lastmod：みんなの報告の最新日と、公式の取扱（stock.json）の更新日のうち新しいほう。どちらもなければ付けない
      const shopLm = [rp && rp.last, off.length && stockFile.updated_at].filter(Boolean).sort().pop() || "";
      layout({ rel, title: `${sh.name}｜${city || sh.pref || ""}のガチャガチャ設置場所・取扱ガチャ${off.length ? `${off.length}種` : ""}`, noindex: thinShop, lastmod: shopLm, description: `${sh.pref && !(sh.address || "").startsWith(sh.pref) ? sh.pref : ""}${sh.address ? sh.address.replace(/\s+/g, " ") : sh.pref || ""}にある${sh.name}のガチャガチャ設置場所・取扱ガチャの情報。${off.length ? `取扱中のガチャ${off.length}種（${off.slice(0, 2).map((x) => x.name).join("、")}など）や、` : ""}みんなの在庫報告・台数・評価を確認できます。`, body, current: "map", jaOnly: true, extraHead: LEAF,
        jsonld: [{ "@context": "https://schema.org", ...storeLd(sh) }] });
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
    const c = ctx("about.html");
    const x = site.x_account ? site.x_account.replace(/^@/, "") : "";
    const contact = site.contact_url
      ? `<p><a class="btn btn-gold" href="${esc(site.contact_url)}" target="_blank" rel="noopener">${t.contactForm}</a></p>`
      : x ? `<p>${t.contactX(esc(x))}</p>` : `<p>${t.contactNone}</p>`;
    const body = `<div class="wrap">
  <header class="page-head"><h1>${t.aboutH1}</h1></header>
  <div class="prose">${t.aboutSections(site).map(([h, p]) => `<h2>${h}</h2>${p === null ? contact : `<p>${esc(p).replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (m, txt, href) => `<a href="${href}" target="_blank" rel="noopener">${txt}</a>`)}</p>`}`).join("\n")}
  ${lang === "ja" ? `<h2>データと統計</h2><p>当サイトのデータから、新作の数・平均価格・500円以上の割合などを毎月まとめています。<a href="${c.H}stats.html">ガチャガチャ新作の統計を見る →</a></p>` : lang === "en" ? `<h2>Data & stats</h2><p>Every month we sum up our data: new series, average price, the share of ¥500+ gacha and more. <a href="${c.H}stats.html">See the gacha release stats →</a></p>` : ""}</div>
</div>`;
    layout({ rel: "about.html", title: t.aboutTitle, description: t.aboutDesc, body });
  }
  /* ---------- プライバシーポリシー（日本語だけ） ---------- */
  if (lang === "ja") {
    const secs = [
      ["広告について", "当サイトは、Amazonアソシエイト・プログラム、楽天アフィリエイト、バリューコマース（Yahoo!ショッピング）、メルカリアンバサダーなどのアフィリエイトプログラムに参加しています。商品へのリンクから購入された場合、当サイトに紹介料が支払われることがあります。これらのリンクには「PR」と表示しています。"],
      ["Cookie（クッキー）について", "広告の提供元（Amazon、楽天、バリューコマース、メルカリなど）は、リンクのクリックや購入を確認するためにCookieを使うことがあります。Cookieはブラウザの設定で無効にできます。"],
      ["アクセス解析について", "サイトの改善のため、Googleアナリティクス（Google LLC）とCloudflareのアクセス解析を使っています。Googleアナリティクスはデータ収集のためにCookieを使いますが、個人を特定できる情報は集めていません。データの収集はブラウザのCookie設定や「Googleアナリティクス オプトアウト アドオン」で止められます。くわしくはGoogleのポリシーと規約をご覧ください。"],
      ["みんなの報告・コメントについて", "ガチャマップへの在庫報告・評価・コメントは、名前を出さずに表示します。いたずら防止のため、端末を見分けるための読めない符号を記録しますが、IPアドレスそのものは保存しません。"],
      ["位置情報について", "「現在地から探す」などで使う現在地は、近いお店を並べる計算だけに使い、どこにも送信しません。"],
      ["マイリスト（★保存）・ハートについて", "★で保存したガチャ（マイリスト）と、ハートを押した記録は、お使いのブラウザの中（ローカルストレージ）だけに保存され、当サイトのサーバーには送信されません。ブラウザのデータを消すと、保存した内容も消えます。ハートの数（人気ランキング）だけは、名前などを含まない形で集計しています。"],
      ["発売日のお知らせ（プッシュ通知）について", "「発売日にお知らせを受け取る」を選んだ場合だけ、通知の送り先（ブラウザが発行するプッシュ通知用のアドレスと暗号化の鍵）と、★で保存したガチャの番号・表示言語を当サイトのサーバーに保存します。名前・メールアドレスなどは受け取りません。いたずら防止のため、端末を見分けるための読めない符号も記録します（IPアドレスそのものは保存しません）。「お知らせをやめる」を押せば、いつでもすぐに削除されます。"],
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
// 言語ごとの 404（Cloudflare Pages はいちばん近いフォルダの 404.html を出すので、/en/… などの迷子にはその言語で案内する）
{
  const NF = {
    en: { title: "Page not found", lead: "This page could not be found. The item may have been removed after it went out of sale.", home: "Back to home", station: "Find shops by station", search: "Search gachapon" },
    "zh-cn": { title: "找不到页面", lead: "找不到该页面。商品可能已停售并被移除。", home: "返回首页", station: "按车站找店", search: "搜索扭蛋" },
    "zh-tw": { title: "找不到頁面", lead: "找不到這個頁面。商品可能已停售並被移除。", home: "回到首頁", station: "依車站找店", search: "搜尋扭蛋" },
    ko: { title: "페이지를 찾을 수 없습니다", lead: "페이지를 찾을 수 없습니다. 판매가 종료되어 삭제되었을 수 있습니다.", home: "홈으로", station: "역에서 가게 찾기", search: "가챠 검색" },
  };
  for (const [l, m] of Object.entries(NF)) {
    const base = `/${langDir(l)}`;
    write(`${langDir(l)}404.html`, `<!doctype html><html lang="${LANG_META[l].html}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(m.title)} | ${esc(site.name)}</title><link rel="stylesheet" href="/assets/style.css?v=${CSS_V}"></head>
<body><main><div class="wrap"><header class="page-head"><h1>${esc(m.title)}</h1><p class="lead">${esc(m.lead)}</p>
<p style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-gold" href="${base}">${esc(m.home)}</a><a class="btn" href="${base}station">${esc(m.station)}</a><a class="btn" href="${base}search">${esc(m.search)}</a><a class="btn" href="/" lang="ja">日本語</a></p></header></div></main></body></html>`);
  }
}

const lm = (d) => (d ? `<lastmod>${String(d).slice(0, 10)}</lastmod>` : "");
// 商品ページは画像サイトマップ（<image:image>）も付ける：画像検索に商品写真を載せてもらう
const imgEntry = (lang, rel, img) => {
  if (!img) return "";
  const it = itemById.get(rel.replace(/^item\//, "").replace(/\.html$/, ""));
  return `<image:image><image:loc>${esc(img)}</image:loc>${it ? `<image:title>${esc(nameOf(it, lang))}</image:title>` : ""}</image:image>`;
};
const urlEntry = ([lang, rel, alts, , lastmod, img]) => alts.length < 2 ? `  <url><loc>${esc(canonical(lang, rel))}</loc>${lm(lastmod)}${imgEntry(lang, rel, img)}</url>` : `  <url><loc>${esc(canonical(lang, rel))}</loc>${lm(lastmod)}${imgEntry(lang, rel, img)}
${alts.flatMap((l) => [LANG_META[l].hreflang, ...(LANG_META[l].extra || [])].map((code) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${esc(canonical(l, rel))}"/>`)).join("\n")}
    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(canonical(xDefault(rel, alts), rel))}"/>
  </url>`;
// サイトマップは種類ごとに分けて、sitemap.xml はその目次にする（Search Console で種類ごとの登録状況が見える）
{
  const groups = { items: [], hubs: [], shops: [], ...Object.fromEntries(LANGS.filter((l) => l !== "ja").map((l) => [l, []])) };
  for (const pg of pages) {
    const [lang, rel, , noindex] = pg;
    if (noindex || rel === "search.html" || rel === "404.html") continue;
    const g = lang !== "ja" ? lang : /^item\//.test(rel) ? "items" : /^(shop|shops)\//.test(rel) ? "shops" : "hubs";
    groups[g].push(pg);
  }
  const maxLm = (list) => list.reduce((m, p) => (p[4] && p[4] > m ? p[4] : m), "");
  for (const [g, list] of Object.entries(groups)) {
    write(`sitemap-${g}.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"${list.some((p) => p[5]) ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ""}>
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
  // ミニチュアは「種類」から「ジャンル」へ移した
  ...LANGS.flatMap((l) => [`/${langDir(l)}type/miniature /${langDir(l)}genre/miniature 301`, `/${langDir(l)}type/miniature.html /${langDir(l)}genre/miniature 301`]),
].join("\n") + "\n");
write("data/mercari-item-ids.json", JSON.stringify({ ids: [...MERCARI_ITEM_IDS] }));
// 発売週のお知らせ（Web Push）：ワーカーが月曜の朝に読む「今週・来週発売のガチャ」（ビルドが日曜でも月曜でも合うように2週分）
{
  const wk = (W) => ({ week_key: W.key, items: W.items.map((it) => ({ id: it.id, ...Object.fromEntries(LANGS.map((l) => [`name_${l}`, nameOf(it, l)])), url: `/item/${it.id}` })) });
  const weeks = [wk(WEEK), wk(NEXT_WEEK)];
  write("data/push-week.json", JSON.stringify({ ...weeks[0], weeks }));
}
// 通知を受け取るための Service Worker（通知の表示と、押したときにページを開くだけ。キャッシュはしない）
write("sw.js", fs.readFileSync(path.join(__dirname, "sw.js"), "utf8"));
write("x-img.html", fs.readFileSync(path.join(__dirname, "tpl", "x-img.html"), "utf8").replace("__FONTS__", FONTS));
if (fs.existsSync(path.join(ROOT, "brand", "logo-lab.html"))) write("logo-lab.html", fs.readFileSync(path.join(ROOT, "brand", "logo-lab.html"), "utf8"));
if (site.indexnow_key) fs.writeFileSync(path.join(OUT, site.indexnow_key + ".txt"), site.indexnow_key);
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /x-img\nDisallow: /logo-lab\nSitemap: ${SITE_URL}/sitemap.xml\n`);
// Cloudflare の窓口（functions/）を動かすのは、ページと /api/ だけ（画像などでは動かさず、無料の回数を節約する）
// ふつうのページは Functions を通さない（無料枠：1日10万回を節約）。古い住所の転送と /api だけ通す
write("_routes.json", JSON.stringify({ version: 1, include: ["/api/*", "/", "/maker/m*", "/en/maker/m*", "/series/*", "/en/series/*", "/chara/sanrio-characters-all*", "/en/chara/sanrio-characters-all*"], exclude: ["/assets/*", "/images/*", "/data/*", "/sw.js"] }));
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
    /ディズニー|ミッキー|ミニー|ドナルド|プーさん|くまのプー|スティッチ|ピクサー|トイ・ストーリー|ラプンツェル|アナと雪|ディズニープリンセス|ツイステ|Disney/i,
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
    const packEn = (it) => ({ id: it.id, name: it.name_en, price: it.price, lineup: it.lineup || 0, release: (() => { const w = weekStartOf(it); return w ? `week of ${MONTH_EN[w.getUTCMonth()]} ${w.getUTCDate()}` : (([y, m]) => `${MONTH_EN[+m - 1]} ${y}`)(it.release.split("-")); })(), maker: it.maker === "バンダイ" ? "Bandai" : it.maker === "タカラトミーアーツ" ? "Takara Tomy A.R.T.S" : it.maker === "キタンクラブ" ? "Kitan Club" : it.maker === "クオリア" ? "Qualia" : it.maker_en || it.maker, img_large: absImg(it).replace("/thumb/", "/"), url: `${SITE_URL}/en/item/${it.id}` });
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
    // 朝7時：今日の1つ（人気の系統から、daily と重ならないもの）。昼：旅行者向けの「駅の近くのガチャ屋さん」
    const usedEn = new Set((daily.items || []).map((x) => x.id));
    const pk = items.filter((it) => ok(it) && isFav(it) && !usedEn.has(it.id)).sort((a, b) => (b.release > a.release ? 1 : b.release < a.release ? -1 : a.id < b.id ? -1 : 1));
    const pick = pk.length ? packEn(pk[(dn * 7) % pk.length]) : null;
    const sts = STATIONS.filter((st) => st.shops && st.shops.length >= 2);
    // 曜日ごとの駅のグループ（月：東京の中心／火：大阪／水：京都・名古屋／木：空港／金：地方／土：渋谷・新宿／日：原宿・中野など）。週ごとに同じグループ内で入れかえ
    const DOW_ST = [["harajuku", "nakano", "ueno", "asakusa", "kichijoji"], ["akihabara", "ikebukuro", "tokyo", "ueno"], ["umeda", "namba", "shinsaibashi", "tennoji"], ["kyoto", "nagoya", "sakae", "sannomiya"], ["narita-airport", "haneda-airport", "kansai-airport", "new-chitose-airport"], ["hakata", "tenjin", "sapporo", "sendai", "hiroshima", "naha"], ["shibuya", "shinjuku", "harajuku", "yokohama"]];
    const dow = new Date(day).getUTCDay(), wkn = Math.floor(dn / 7);
    const grp = DOW_ST[dow].map((g) => sts.find((x) => x.slug === g)).filter(Boolean);
    const st = grp.length ? grp[wkn % grp.length] : sts.length ? sts[dn % sts.length] : null;
    const spot = st ? { name: st.en, slug: st.slug, count: st.shops.length, url: `${SITE_URL}/en/station/${st.slug}`, nearest: st.shops[0] && Math.max(1, Math.round(st.shops[0].d / 80)), items: wk.slice(0, 4).map(packEn) } : null;
    // 23時「どれを回す？」：人気の系統から4つ（daily・pick と重ならない）
    const used2 = new Set([...usedEn, pick && pick.id].filter(Boolean));
    const po = items.filter((it) => ok(it) && !used2.has(it.id) && it.release >= thisMonth && isFav(it)).sort((a, b) => (a.id < b.id ? -1 : 1));
    const pst = po.length ? (dn * 4) % po.length : 0;
    const pickone = po.length >= 4 ? [...po.slice(pst), ...po.slice(0, pst)].slice(0, 4).map(packEn) : null;
    // 土曜の統計（今月）
    const sm = (() => { const ms = items.filter((it) => it.release === thisMonth && it.price); if (ms.length < 30) return null; const avg = Math.round(ms.reduce((a, b) => a + b.price, 0) / ms.length); return { month: `${MONTH_EN[+thisMonth.slice(5) - 1]} ${thisMonth.slice(0, 4)}`, count: ms.length, avg, pct500: Math.round((ms.filter((x) => x.price >= 500).length / ms.length) * 100), url: `${SITE_URL}/en/stats` }; })();
    return { dow, daily, pick, spot, pickone, stats: sm, week: { range: WEEK.range, count: WEEK.items.length, url: `${SITE_URL}/en/week`, items: wk.slice(0, 4).map(packEn) } };
  })(), fav_ids: favIds, site: SITE_URL }));
}
write("_headers", `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/images/*\n  Cache-Control: public, max-age=604800\n  Access-Control-Allow-Origin: *\n/data/*\n  Cache-Control: public, max-age=300\n  Access-Control-Allow-Origin: *\n/sw.js\n  Cache-Control: no-cache\n`);

const noEn = items.filter((it) => !it.name_en).length;
if (noEn) warnings.push(`英語名（name_en）がまだない商品が${noEn}件あります（英語ページでは日本語名を表示）`);

/* ---------- 結果 ---------- */
console.log(`✔ ${items.length}商品・${validStores.length}店舗から 日本語${pages.filter((p) => p[0] === "ja").length}・英語${pages.filter((p) => p[0] === "en").length}ページを ${path.relative(ROOT, OUT)}/ に書き出しました`);
if (warnings.length) { console.log(`⚠ 注意 ${warnings.length}件:`); warnings.forEach((w) => console.log("  - " + w)); }
