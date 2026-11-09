/*
 * 海外の旅行者向けガイド（/en/guide/〇〇・/ko/guide/〇〇・/zh-tw/guide/〇〇・/zh-cn/guide/〇〇）
 * build.js の「駅のページ」のところから呼ぶ（有名店のカード lmCardAt・お店の行 rowAt をそのまま使う）
 * 書いてよいこと：data/landmarks.json・data/stores.json・data/items.json から出る数字と、だれでも知っている一般的なこと
 *   （100円玉・両替機・無人の機械なので免税にならない・空カプセルの回収箱 など）。数字を作らない
 */

const GUIDE_LANGS = ["en", "ko", "zh-tw", "zh-cn"];
const PUBLISHED = "2026-11-08";
const SLUGS = ["how-to-play-gachapon", "gashapon-department-store-ikebukuro", "tokyo-gachapon-shops", "osaka-gachapon-shops", "airport-gachapon", "fukuoka-gachapon", "check-gachapon-stock"];
// フッター・トップのリンクの文字
const NAV = { en: "Travel guides", ko: "가챠 여행 가이드", "zh-tw": "扭蛋旅遊攻略", "zh-cn": "扭蛋旅游攻略" };

// 各ガイドの短い名前（トップ・「ほかのガイド」のリンク）
const SHORT = {
  en: ["How to play gachapon", "Gashapon Department Store Ikebukuro", "Biggest gachapon shops in Tokyo", "Osaka gachapon shops", "Airport gachapon", "Fukuoka gachapon", "How to check gachapon stock"],
  ko: ["일본 가챠 하는 법", "이케부쿠로 가샤폰 백화점", "도쿄 대형 가챠샵 순위", "오사카 가챠샵", "공항 가챠", "후쿠오카 가챠 성지", "가챠 재고 확인하는 법"],
  "zh-tw": ["日本扭蛋怎麼玩", "池袋扭蛋百貨總店", "東京大型扭蛋店排行", "大阪扭蛋店攻略", "機場扭蛋", "福岡扭蛋攻略", "日本扭蛋庫存查詢教學"],
  "zh-cn": ["日本扭蛋怎么玩", "池袋扭蛋百货总店", "东京大型扭蛋店排行", "大阪扭蛋店攻略", "机场扭蛋", "福冈扭蛋攻略", "日本扭蛋库存查询教程"],
};
const fmt = (n) => Number(n).toLocaleString("en-US");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
// 韓国語の助詞（은/는・이/가・으로/로）：前の言葉の最後の文字にパッチムがあるかで選ぶ
const kj = (w, a, b) => {
  w = String(w); const ch = w.trim().slice(-1), c = ch.charCodeAt(0);
  let bat, rieul = false;
  if (c >= 0xac00 && c <= 0xd7a3) { const j = (c - 0xac00) % 28; bat = j > 0; rieul = j === 8; }
  else if (/[0-9]/.test(ch)) { bat = /[013678]/.test(ch); rieul = /[178]/.test(ch); }
  else bat = /[lmn]/i.test(ch);
  if (a === "으로") return w + (bat && !rieul ? "으로" : "로");
  return w + (bat ? a : b);
};
const pctTxt = (a, b) => { const v = pct(a, b); return v === 0 && a > 0 ? "<1%" : `${v}%`; }; // 表の「割合」（0件でなければ 0% と書かない）
const yen = (p) => `¥${fmt(p)}`;
// 営業時間 "10:00–21:00 (…)" → 開店・閉店（分）
const hOpen = (h) => { const m = String(h || "").match(/^(\d{1,2}):(\d\d)/); return m ? +m[1] * 60 + +m[2] : null; };
const hClose = (h) => { const m = String(h || "").match(/[–-]\s*(\d{1,2}):(\d\d)/); return m ? +m[1] * 60 + +m[2] : null; };
const fmtYMD = (d, lang) => {
  const [y, m, dd] = String(d).split("-").map(Number);
  if (lang === "en") return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${dd}, ${y}`;
  if (lang === "ko") return `${y}년 ${m}월 ${dd}일`;
  return `${y}年${m}月${dd}日`;
};

/* ---------- 画面の共通の文言 ---------- */
const UI = {
  en: {
    crumb: "Guides", idxTitle: "Gachapon Travel Guides for Japan", idxH1: "Gachapon travel guides",
    idxDesc: "Practical guides to gachapon (capsule toys) in Japan for travelers: how to play, the biggest shops in Tokyo, Osaka and Fukuoka, airports, and how to check stock before you go.",
    idxLead: "Everything a first-time visitor needs to enjoy gachapon in Japan — how the machines work, where the biggest shops are, and how to find the series you want. Shop facts come from official sites and major travel media; new releases are updated daily.",
    updated: (d) => `Updated ${fmtYMD(d, "en")}`, quick: "Quick answer", faqH: "FAQ", more: "More gacha guides", read: "Read the guide →", all: "All guides →",
    homeH: "Gachapon guides for travelers",
  },
  ko: {
    crumb: "가이드", idxTitle: "일본 가챠 여행 가이드 모음", idxH1: "일본 가챠 여행 가이드",
    idxDesc: "일본 여행에서 가챠(캡슐토이)를 즐기기 위한 가이드 모음. 가챠 하는 법, 도쿄·오사카·후쿠오카의 큰 가챠샵, 공항 가챠, 가기 전에 재고 확인하는 법까지 정리했어요.",
    idxLead: "처음 일본에서 가챠를 해 보는 분도 바로 쓸 수 있도록, 기계 사용법부터 큰 가챠샵 위치, 원하는 가챠 찾는 법까지 정리했어요. 매장 정보는 공식 사이트와 주요 여행 매체를 바탕으로 하고, 신작 정보는 매일 업데이트돼요.",
    updated: (d) => `${fmtYMD(d, "ko")} 업데이트`, quick: "한눈에 보기", faqH: "자주 묻는 질문", more: "다른 가챠 가이드", read: "가이드 보기 →", all: "가이드 전체 보기 →",
    homeH: "여행자를 위한 가챠 가이드",
  },
  "zh-tw": {
    crumb: "攻略", idxTitle: "日本扭蛋旅遊攻略總整理", idxH1: "日本扭蛋旅遊攻略",
    idxDesc: "給旅客的日本扭蛋（轉蛋、Gashapon）攻略：扭蛋怎麼玩、東京・大阪・福岡的大型扭蛋店、機場扭蛋，以及出發前怎麼查庫存。",
    idxLead: "第一次在日本玩扭蛋也不用怕：從機器怎麼用、大型扭蛋店在哪裡，到怎麼找到想要的系列，這裡都整理好了。店家資訊來自官方網站與大型旅遊媒體，新品資訊每天更新。",
    updated: (d) => `${fmtYMD(d, "zh-tw")}更新`, quick: "快速解答", faqH: "常見問題", more: "更多扭蛋攻略", read: "看攻略 →", all: "所有攻略 →",
    homeH: "給旅客的扭蛋攻略",
  },
  "zh-cn": {
    crumb: "攻略", idxTitle: "日本扭蛋旅游攻略合集", idxH1: "日本扭蛋旅游攻略",
    idxDesc: "写给游客的日本扭蛋（Gashapon）攻略：扭蛋怎么玩、东京・大阪・福冈的大型扭蛋店、机场扭蛋，以及出发前怎么查库存。",
    idxLead: "第一次在日本扭蛋也不用担心：从机器怎么用、大型扭蛋店在哪里，到怎么找到想要的系列，这里都整理好了。店铺信息来自官方网站和大型旅游媒体，新品信息每天更新。",
    updated: (d) => `${fmtYMD(d, "zh-cn")}更新`, quick: "快速解答", faqH: "常见问题", more: "更多扭蛋攻略", read: "查看攻略 →", all: "全部攻略 →",
    homeH: "写给游客的扭蛋攻略",
  },
};

/* ---------- データ（言語に関係ないもの） ---------- */
const prepareData = (E) => {
  const { STATIONS, items, WEEK, SHOP_OFFICIAL, OFFICIAL_BY_ITEM, distM, compDraws, today, nowJST } = E;
  const ST = Object.fromEntries(STATIONS.map((s) => [s.slug, s]));
  const open = (x) => !x.lm.closing || x.lm.closing >= today;
  const lmsOf = (slug) => (ST[slug] ? ST[slug].lms.filter(open) : []);
  const lmById = (id) => { for (const s of STATIONS) { const x = s.lms.find((y) => y.lm.id === id); if (x && open(x)) return { ...x, st: s }; } return null; };
  const allLms = STATIONS.flatMap((s) => s.lms.filter(open).map((x) => ({ ...x, st: s })));

  // 今年発売のガチャの値段の分布（items.json）
  const year = nowJST.getUTCFullYear();
  const yItems = items.filter((it) => String(it.release || "").startsWith(String(year)) && Number(it.price) > 0);
  const cnt = {}; for (const it of yItems) cnt[it.price] = (cnt[it.price] || 0) + 1;
  const prices = Object.entries(cnt).map(([p, n]) => [Number(p), n]).sort((a, b) => a[0] - b[0]);
  const N = yItems.length;
  const byCount = [...prices].sort((a, b) => b[1] - a[1]);
  const main = byCount.slice(0, 3).sort((a, b) => a[0] - b[0]);
  const P = {
    year, N, prices, main, mainPct: pct(main.reduce((s, x) => s + x[1], 0), N),
    lo: prices.length ? prices[0][0] : 0, hi: prices.length ? prices[prices.length - 1][0] : 0,
    upTo800: pct(prices.filter(([p]) => p <= 800).reduce((s, x) => s + x[1], 0), N),
    over800: prices.filter(([p]) => p > 800).reduce((s, x) => s + x[1], 0),
    mode: byCount.length ? byCount[0][0] : 0,
  };
  P.mainLo = main.length ? main[0][0] : 0; P.mainHi = main.length ? main[main.length - 1][0] : 0;
  // 全何種かの分布（いちばん多い種類数）
  const lc = {}; for (const it of yItems) if (Number(it.lineup) > 0) lc[it.lineup] = (lc[it.lineup] || 0) + 1;
  const lineN = Object.values(lc).reduce((s, n) => s + n, 0);
  const lModeE = Object.entries(lc).sort((a, b) => b[1] - a[1])[0] || ["5", 0];
  const L = { mode: Number(lModeE[0]), modePct: pct(lModeE[1], lineN), n: lineN };
  const DRAWS = [3, 4, 5, 6, 8, 10, 12].map((n) => [n, compDraws(n)]);

  // 現金のみ・キャッシュレス（landmarks の cashless）
  const cashYes = allLms.filter((x) => x.lm.cashless === true);
  const cashNo = allLms.filter((x) => x.lm.cashless === false);
  // 両替機があると書かれているお店（landmarks の notes_en）
  const changeLms = allLms.filter((x) => /change machine/i.test(x.lm.notes_en || ""));

  // 池袋
  const ike = { st: ST.ikebukuro, main: lmById("gashapon-dept-ikebukuro"), mori: lmById("gachagacha-no-mori-ikebukuro"), coco: lmById("gashacoco-ikebukuro") };
  if (ike.st) {
    const ids = new Set(ike.st.shops.flatMap((x) => SHOP_OFFICIAL[x.sh.id] || []));
    const local = WEEK.items.filter((it) => ids.has(it.id));
    ike.week = (local.length >= 4 ? local : WEEK.items).slice(0, 8);
    ike.weekLocal = local.length >= 4;
  }
  const between = (a, b) => (a && b ? distM(a.lm.lat, a.lm.lng, b.lm.lat, b.lm.lng) : null);

  // 東京（東京都の駅の有名店を台数の多い順。台数がわからないものは最後）
  const seen = new Set();
  const tokyo = allLms.filter((x) => x.st.pref === "東京都" && !seen.has(x.lm.id) && seen.add(x.lm.id))
    .sort((a, b) => (b.lm.machines || -1) - (a.lm.machines || -1) || String(a.lm.name_en).localeCompare(String(b.lm.name_en)));

  // 大阪（御堂筋線で北から南：梅田 → 心斎橋 → なんば → 天王寺）
  const osakaSlugs = ["umeda", "shinsaibashi", "namba", "tennoji"].filter((s) => ST[s]);
  const osakaAll = osakaSlugs.flatMap((s) => (ST[s].lms || []).map((x) => ({ ...x, st: ST[s] }))); // 閉店予定も含む（閉店日を書くため）
  const osakaStops = osakaSlugs.map((s) => lmsOf(s)[0] ? { ...lmsOf(s)[0], st: ST[s] } : null).filter(Boolean);
  const osakaLegs = osakaStops.slice(1).map((x, i) => ({ from: osakaStops[i], to: x, d: between(osakaStops[i], x) }));
  const nambaClosing = osakaAll.find((x) => x.lm.closing);
  const nambaRest = ST.namba ? ST.namba.rest.slice(0, 4) : [];

  // 空港
  const air = {
    haneda: lmsOf("haneda-airport"), kix: lmsOf("kansai-airport"),
    narita: ST["narita-airport"] ? ST["narita-airport"].rest : [], chitose: ST["new-chitose-airport"] ? ST["new-chitose-airport"].rest : [],
    st: (s) => ST[s] || null,
  };
  const before = (lm) => /before security|landside/i.test(`${lm.floor_en || ""} ${lm.notes_en || ""}`);

  // 福岡（博多・天神。キャナルシティ博多の有名店と、公式の取扱店）
  const fuk = { hakata: ST.hakata || null, tenjin: ST.tenjin || null, canal: lmById("gashapon-official-canal-city-hakata") };
  {
    const ids = new Set(); const canalShop = fuk.canal && fuk.canal.sh ? fuk.canal.sh.id : "";
    const pick = (st) => (st ? st.shops.filter((x) => x.d <= 1500 && x.sh.id !== canalShop && !ids.has(x.sh.id) && ids.add(x.sh.id)) : []);
    fuk.hakataRows = pick(fuk.hakata); fuk.tenjinRows = pick(fuk.tenjin);
    fuk.busTerm = fuk.hakataRows.filter((x) => /バスターミナル\s*7F/i.test(String(x.sh.address || "").normalize("NFKC")));
    fuk.canalFromTenjin = fuk.canal && fuk.tenjin ? distM(fuk.tenjin.lat, fuk.tenjin.lng, fuk.canal.lm.lat, fuk.canal.lm.lng) : null;
  }

  // 在庫の調べ方：公式の取扱店がいちばん多い最近のガチャ
  const from = new Date(Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const popular = items.filter((it) => (it.release || "") >= from && (OFFICIAL_BY_ITEM.get(it.id) || []).length && it.name_en)
    .sort((a, b) => (OFFICIAL_BY_ITEM.get(b.id) || []).length - (OFFICIAL_BY_ITEM.get(a.id) || []).length)[0] || null;
  const popularShops = popular ? (OFFICIAL_BY_ITEM.get(popular.id) || []).length : 0;

  return { ST, lmsOf, lmById, allLms, P, L, DRAWS, cashYes, cashNo, changeLms, ike, between, tokyo, osakaStops, osakaLegs, nambaClosing, nambaRest, air, before, fuk, popular, popularShops, weekN: WEEK.items.length, stationsN: STATIONS.length };
};

/* ---------- 各ガイドの中身（言語ごと） ----------
 * h（ページごとの道具）：
 *   a(href, text) リンク・st(slug) 駅ページへのリンク・stN(slug) 駅の名前・lm(x) 店名・cards(list) 有名店のカード・rows(list) お店の行
 *   grid(items) 商品カード・H 言語トップへの相対パス・esc
 * 返すもの：{ title, h1, desc, short, intro, quick?, sections: [[見出し, HTML]], faq: [[質問, 答え（文字だけ）]] }
 */
const C = { en: {}, ko: {}, "zh-tw": {}, "zh-cn": {} };

/* ===== 1. ガチャのやり方 ===== */
C.en["how-to-play-gachapon"] = (D, h) => {
  const { P, L } = D;
  const mainTxt = P.main.map(([p]) => yen(p)).join(", ").replace(/, ([^,]*)$/, " or $1");
  const drawRow = D.DRAWS.map(([n, d]) => `<tr><td>${n}</td><td>${d}</td><td>${yen(d * P.mode)}</td></tr>`).join("");
  return {
    title: "How to Play Gachapon in Japan: Coins, Cashless & Tax-Free",
    h1: "How to Play Gachapon in Japan: Coins, Change Machines, Cashless & Tax-Free",
    short: "How to play gachapon",
    desc: `How gachapon machines work in Japan: most cost ${yen(P.mainLo)}–${yen(P.mainHi)} (${P.mainPct}% of ${P.year} releases), ¥100 coins and change machines, cashless, why it isn't tax-free, and what to do if nothing comes out.`,
    intro: "Gachapon (also called gacha or gashapon) are Japan's capsule toy machines: you pay, turn the handle and get one random toy from the series shown on the front. Here is everything you need to know before your first turn — what it costs, how to pay, and the unwritten rules.",
    quick: `Put ¥100 coins into the slot (most machines take nothing else), turn the handle clockwise until a capsule drops, and take it from the flap at the bottom. Most gacha cost ${mainTxt} — that covers ${P.mainPct}% of the ${fmt(P.N)} series released in ${P.year} that we track. Gacha shops have change machines that turn ¥1,000 bills into ¥100 coins. Gacha is not tax-free.`,
    sections: [
      ["How much does gachapon cost?", `<p>The price is printed on each machine, and you pay in ¥100 coins — a ¥400 gacha takes four coins. Of the ${fmt(P.N)} gacha series released in Japan in ${P.year} that we track, prices ranged from ${yen(P.lo)} to ${yen(P.hi)}. ${P.upTo800}% cost ${yen(800)} or less; only ${P.over800} premium series cost more.</p>
<div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>Price per play</th><th>Series in ${P.year}</th><th>Share</th></tr></thead><tbody>${P.prices.map(([p, n]) => `<tr><td>${yen(p)}</td><td>${fmt(n)}</td><td>${esc(pctTxt(n, P.N))}</td></tr>`).join("")}</tbody></table></div>
<p>Every series page on this site shows its price and the number of designs. See ${h.a(`${h.H}week.html`, "this week's releases")} or ${h.a(`${h.H}new.html`, "the newest additions")}.</p>`],
      ["¥100 coins and change machines", `<p>Almost all machines take only ¥100 coins. Don't worry if you only have bills: gacha shops and large gacha corners have change machines (両替機, <i>ryōgaeki</i>) that turn a ¥1,000 bill into ten ¥100 coins. ${D.changeLms.length ? `For example, ${D.changeLms.map((x) => h.lm(x)).join(" and ")} ${D.changeLms.length > 1 ? "list" : "lists"} change machines in the shop.` : ""} Breaking a bill at a convenience store before you go also works.</p>
${D.changeLms.length ? h.cards(D.changeLms) : ""}`],
      ["Can you pay by card, Suica or QR code?", `<p>Some newer machines accept cashless payment such as IC transit cards (Suica, PASMO and others) or QR code payments — look for a sticker or a card reader on the machine. They are still a minority, and credit cards generally can't be used at gacha machines, so carry coins.</p>
<p>${D.cashYes.length ? `Shops in our list that accept cashless payment: ${D.cashYes.map((x) => h.lm(x)).join(", ")}. ` : "None of the big shops in our verified list is confirmed as fully cashless yet. "}${D.cashNo.length ? `${D.cashNo.map((x) => h.lm(x)).join(", ")} ${D.cashNo.length > 1 ? "are" : "is"} confirmed as coins only.` : ""} ${D.lmById("gashacoco-ikebukuro") ? `${h.lm(D.lmById("gashacoco-ikebukuro"))} notes that credit cards are not accepted.` : ""}</p>`],
      ["Is gachapon tax-free for tourists?", "<p>No. Tax-free shopping in Japan needs a staffed counter that checks your passport, but gacha is bought from an unattended machine, one play at a time, so there is no tax-free procedure. The price on the machine already includes consumption tax, so what you see is what you pay.</p>"],
      ["Gacha etiquette", `<ul>
<li>Get your coins ready before you step up to a machine, especially when others are waiting.</li>
<li>Open capsules away from the machines, and put empty capsules in the capsule recycling bins most gacha shops have. Don't leave them on top of machines.</li>
<li>Never shake, tilt or hit a machine.</li>
<li>Popular new series sometimes have a "limit per person" sign — please follow it.</li>
<li>Rules on photos differ by shop; check the signs.</li>
</ul>`],
      ["What if nothing comes out?", "<p>Sometimes a capsule gets stuck or the coins are not counted. Don't shake the machine. If the shop is staffed, tell a staff member which machine it was. If it isn't, look for the contact phone number on the sticker on the machine and call the operator; note the machine's series name, the time and how much you put in. In Japanese, \"出てきません\" (<i>detekimasen</i>, \"nothing came out\") is enough.</p>"],
      ["How many draws to complete a set?", `<p>Each turn gives a random design, so you get duplicates. If every design is equally likely, the average number of turns to collect all <i>n</i> designs is <i>n</i> × (1 + 1/2 + … + 1/<i>n</i>) — the "coupon collector" problem. For a 5-design series that is about ${D.DRAWS.find(([n]) => n === 5)[1]} turns. The most common line-up in ${P.year} was ${L.mode} designs (${L.modePct}% of series).</p>
<div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>Designs</th><th>Average turns for the full set</th><th>At ${yen(P.mode)} per turn</th></tr></thead><tbody>${drawRow}</tbody></table></div>
<p>Series with a rare or secret design take longer. Trading duplicates with friends helps a lot.</p>`],
      ["Where to start", `<p>For your first visit, a big shop is easiest: hundreds or thousands of machines in one place, plus change machines. See ${h.a(`${h.H}guide/tokyo-gachapon-shops.html`, "the biggest gachapon shops in Tokyo")}, ${h.a(`${h.H}guide/gashapon-department-store-ikebukuro.html`, "the Gashapon Department Store in Ikebukuro")}, or ${h.a(`${h.H}station.html`, "find gacha shops by station")}.</p>`],
    ],
    faq: [
      ["How much does one gacha cost in Japan?", `Most cost ${mainTxt} per turn (${P.mainPct}% of ${P.year} releases). Prices ranged from ${yen(P.lo)} to ${yen(P.hi)}, and ${P.upTo800}% were ${yen(800)} or less.`],
      ["Do gacha machines take ¥500 coins or bills?", "Most machines accept only ¥100 coins. Use the change machine in the shop to turn bills into ¥100 coins."],
      ["Where can I get ¥100 coins?", "Gacha shops and large gacha corners have change machines that turn ¥1,000 bills into ¥100 coins. You can also break a bill when you buy something at a convenience store."],
      ["Can I use a credit card or Suica for gacha?", "Some newer machines accept IC cards like Suica or QR code payments — look for a sticker or reader on the machine. Credit cards generally can't be used, so bring coins."],
      ["Is gachapon tax-free?", "No. Gacha is bought from unattended machines one play at a time, so there is no tax-free procedure. The price on the machine already includes tax."],
      ["What should I do if the capsule doesn't come out?", "Don't shake the machine. Tell the shop staff, or call the contact number on the sticker on the machine and tell them the series name, time and amount."],
      ["How many times do I need to play to get the full set?", `If all designs are equally likely, about ${D.DRAWS.find(([n]) => n === 5)[1]} turns on average for 5 designs and ${D.DRAWS.find(([n]) => n === 6)[1]} for 6 designs (n × (1 + 1/2 + … + 1/n)).`],
      ["What do I do with the empty capsule?", "Put it in the capsule recycling bin that most gacha shops have next to the machines."],
      ["Can I choose which design I get?", "No. Each turn gives one random design from the line-up shown on the front of the machine."],
      ["What's the difference between gacha, gachapon and gashapon?", "They are the same kind of capsule toy machine. \"Gashapon\" is Bandai's brand name; \"gachapon\" and \"gacha\" are the everyday words used for all makers."],
    ],
  };
};
C.ko["how-to-play-gachapon"] = (D, h) => {
  const { P, L } = D;
  const mainTxt = P.main.map(([p]) => `${fmt(p)}엔`).join("·");
  const drawRow = D.DRAWS.map(([n, d]) => `<tr><td>${n}종</td><td>${d}회</td><td>${fmt(d * P.mode)}엔</td></tr>`).join("");
  const d5 = D.DRAWS.find(([n]) => n === 5)[1], d6 = D.DRAWS.find(([n]) => n === 6)[1];
  return {
    title: "일본 가챠 하는 법: 동전·환전기·카드 결제·면세",
    h1: "일본 가챠 하는 법: 동전·환전기·카드 결제·면세",
    short: "일본 가챠 하는 법",
    desc: `일본 가챠(캡슐토이) 하는 법 총정리. ${P.year}년 발매작의 ${P.mainPct}%가 ${fmt(P.mainLo)}~${fmt(P.mainHi)}엔, 100엔 동전과 환전기, 카드·교통카드 결제, 면세가 안 되는 이유, 캡슐이 안 나올 때 대처법까지.`,
    intro: "가챠(가샤폰·가챠폰)는 돈을 넣고 손잡이를 돌리면 앞에 그려진 시리즈 중 하나가 랜덤으로 나오는 일본의 캡슐토이 기계예요. 처음 해 보기 전에 알아 두면 좋은 가격, 결제 방법, 매너를 한 번에 정리했어요.",
    quick: `100엔 동전을 넣고(대부분 100엔 동전만 돼요) 손잡이를 오른쪽(시계 방향)으로 돌리면 아래 투입구로 캡슐이 나와요. 가격은 대부분 ${mainTxt}이에요(${P.year}년 발매작 ${fmt(P.N)}개 중 ${P.mainPct}%). 가챠샵에는 1,000엔 지폐를 100엔 동전으로 바꿔 주는 환전기가 있고, 가챠는 면세가 안 돼요.`,
    sections: [
      ["가챠 가격은 얼마인가요?", `<p>가격은 기계마다 적혀 있고 100엔 동전으로 내요. 400엔 가챠라면 100엔 동전 4개예요. 저희가 정리한 ${P.year}년 일본 발매 가챠 ${fmt(P.N)}개 시리즈의 가격은 ${fmt(P.lo)}엔부터 ${fmt(P.hi)}엔까지였고, ${P.upTo800}%가 800엔 이하였어요. 800엔이 넘는 프리미엄 가챠는 ${P.over800}개뿐이에요.</p>
<div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>1회 가격</th><th>${P.year}년 시리즈 수</th><th>비율</th></tr></thead><tbody>${P.prices.map(([p, n]) => `<tr><td>${fmt(p)}엔</td><td>${fmt(n)}</td><td>${esc(pctTxt(n, P.N))}</td></tr>`).join("")}</tbody></table></div>
<p>이 사이트의 각 가챠 페이지에서 가격과 전체 종류 수를 볼 수 있어요. ${h.a(`${h.H}week.html`, "이번 주 발매 가챠")}나 ${h.a(`${h.H}new.html`, "새로 올라온 가챠")}도 확인해 보세요.</p>`],
      ["100엔 동전과 환전기", `<p>대부분의 가챠 기계는 100엔 동전만 받아요. 지폐밖에 없어도 괜찮아요. 가챠샵이나 큰 가챠 코너에는 1,000엔 지폐를 100엔 동전 10개로 바꿔 주는 환전기(両替機, 료가에키)가 있어요. ${D.changeLms.length ? `예를 들어 ${D.changeLms.map((x) => h.lm(x)).join(", ")}에는 환전기가 있어요.` : ""} 가기 전에 편의점에서 물건을 사며 잔돈을 만들어 두는 것도 방법이에요.</p>
${D.changeLms.length ? h.cards(D.changeLms) : ""}`],
      ["카드·교통카드·QR 결제가 되나요?", `<p>최근 기계 중에는 Suica·PASMO 같은 교통카드(IC카드)나 QR 결제가 되는 것도 있어요. 기계에 붙은 스티커나 카드 단말기를 확인하세요. 다만 아직은 일부이고, 신용카드는 대부분 쓸 수 없으니 동전을 꼭 챙기세요.</p>
<p>${D.cashYes.length ? `저희 목록에서 캐시리스 결제가 되는 곳: ${D.cashYes.map((x) => h.lm(x)).join(", ")}. ` : "저희가 확인한 대형 가챠샵 중 전부 캐시리스로 결제되는 곳은 아직 확인되지 않았어요. "}${D.cashNo.length ? `현금(동전)만 되는 곳: ${D.cashNo.map((x) => h.lm(x)).join(", ")}.` : ""} ${D.lmById("gashacoco-ikebukuro") ? `${h.lm(D.lmById("gashacoco-ikebukuro"))}도 신용카드는 받지 않아요.` : ""}</p>`],
      ["가챠도 면세가 되나요?", "<p>안 돼요. 일본의 면세는 직원이 여권을 확인하는 계산대에서만 가능한데, 가챠는 무인 기계에서 1회씩 사는 방식이라 면세 절차가 없어요. 기계에 적힌 가격은 소비세가 포함된 가격이라 적힌 금액 그대로 내면 돼요.</p>"],
      ["가챠 매너", `<ul>
<li>기다리는 사람이 있으면 동전을 미리 준비해 두세요.</li>
<li>캡슐은 기계 앞이 아닌 곳에서 열고, 빈 캡슐은 가게에 있는 캡슐 회수함에 넣어 주세요. 기계 위에 두고 가면 안 돼요.</li>
<li>기계를 흔들거나 기울이거나 치면 안 돼요.</li>
<li>인기 신작은 '1인 ○회까지' 같은 제한이 있을 때가 있어요. 꼭 지켜 주세요.</li>
<li>사진 촬영 규칙은 가게마다 달라요. 안내문을 확인하세요.</li>
</ul>`],
      ["캡슐이 안 나오면 어떻게 하나요?", "<p>가끔 캡슐이 걸리거나 동전이 인식되지 않을 때가 있어요. 기계를 흔들지 말고, 직원이 있는 가게라면 어느 기계인지 알려 주세요. 무인 매장이라면 기계에 붙은 스티커의 연락처(전화번호)로 연락하면 돼요. 시리즈 이름, 시간, 넣은 금액을 메모해 두면 좋아요. 일본어로는 \"出てきません(데테키마센, 안 나와요)\"이라고 하면 통해요.</p>"],
      ["전 종류 모으려면 몇 번 돌려야 할까?", `<p>매번 랜덤이라 중복이 나와요. 모든 종류가 같은 확률로 나온다고 하면, <i>n</i>종을 다 모으는 데 평균 <i>n</i> × (1 + 1/2 + … + 1/<i>n</i>)회가 필요해요(쿠폰 수집가 문제). 5종이면 평균 약 ${d5}회예요. ${P.year}년 가챠에서 가장 많은 구성은 전 ${L.mode}종(${L.modePct}%)이었어요.</p>
<div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>종류 수</th><th>전 종류 평균 횟수</th><th>1회 ${fmt(P.mode)}엔일 때</th></tr></thead><tbody>${drawRow}</tbody></table></div>
<p>레어·시크릿이 있는 시리즈는 더 많이 필요해요. 친구와 중복을 교환하면 훨씬 빨리 모을 수 있어요.</p>`],
      ["어디서 시작하면 좋을까?", `<p>처음이라면 기계가 수백~수천 대 모여 있고 환전기도 있는 큰 가챠샵이 편해요. ${h.a(`${h.H}guide/tokyo-gachapon-shops.html`, "도쿄 대형 가챠샵 순위")}, ${h.a(`${h.H}guide/gashapon-department-store-ikebukuro.html`, "이케부쿠로 가샤폰 백화점 가이드")}, ${h.a(`${h.H}guide/fukuoka-gachapon.html`, "후쿠오카 가챠 가이드")}를 보거나 ${h.a(`${h.H}station.html`, "역에서 가챠샵 찾기")}를 이용해 보세요.</p>`],
    ],
    faq: [
      ["일본 가챠 1회는 얼마예요?", `대부분 1회 ${mainTxt}이에요(${P.year}년 발매작의 ${P.mainPct}%). 가격 범위는 ${fmt(P.lo)}~${fmt(P.hi)}엔이고, ${P.upTo800}%가 800엔 이하였어요.`],
      ["500엔 동전이나 지폐도 되나요?", "대부분의 기계는 100엔 동전만 받아요. 가게 안의 환전기로 지폐를 100엔 동전으로 바꾸세요."],
      ["100엔 동전은 어디서 바꾸나요?", "가챠샵이나 큰 가챠 코너에 1,000엔 지폐를 100엔 동전으로 바꿔 주는 환전기가 있어요. 편의점에서 물건을 사며 잔돈을 만들어도 돼요."],
      ["신용카드나 Suica로 할 수 있나요?", "최근 기계 중에는 Suica 같은 IC카드나 QR 결제가 되는 것도 있어요(기계의 스티커·단말기 확인). 신용카드는 대부분 안 되니 동전을 챙기세요."],
      ["가챠도 면세 되나요?", "안 돼요. 무인 기계에서 1회씩 사는 방식이라 면세 절차가 없어요. 기계에 적힌 가격은 세금 포함이에요."],
      ["캡슐이 안 나오면 어떻게 해요?", "기계를 흔들지 말고 직원에게 알리거나, 기계에 붙은 스티커의 연락처로 시리즈 이름·시간·금액을 알려 주세요."],
      ["전 종류를 모으려면 몇 번 돌려야 해요?", `모든 종류가 같은 확률이라면 5종은 평균 약 ${d5}회, 6종은 약 ${d6}회예요(n × (1 + 1/2 + … + 1/n)).`],
      ["빈 캡슐은 어떻게 해요?", "대부분의 가챠샵에는 기계 옆에 캡슐 회수함이 있어요. 거기에 넣어 주세요."],
      ["원하는 종류를 골라서 뽑을 수 있나요?", "아니요. 기계 앞에 그려진 라인업 중 하나가 랜덤으로 나와요."],
      ["가챠, 가챠폰, 가샤폰은 뭐가 달라요?", "모두 같은 캡슐토이 기계를 말해요. '가샤폰'은 반다이의 브랜드 이름이고, '가챠폰'·'가챠'는 모든 회사 제품을 부르는 일반적인 말이에요."],
    ],
  };
};
C["zh-tw"]["how-to-play-gachapon"] = (D, h) => {
  const { P, L } = D;
  const mainTxt = P.main.map(([p]) => `${fmt(p)}日圓`).join("、");
  const drawRow = D.DRAWS.map(([n, d]) => `<tr><td>${n}款</td><td>${d}次</td><td>${fmt(d * P.mode)}日圓</td></tr>`).join("");
  const d5 = D.DRAWS.find(([n]) => n === 5)[1], d6 = D.DRAWS.find(([n]) => n === 6)[1];
  return {
    title: "日本扭蛋怎麼玩：硬幣、換鈔機、刷卡與免稅",
    h1: "日本扭蛋怎麼玩：硬幣、換鈔機、刷卡與免稅",
    short: "日本扭蛋怎麼玩",
    desc: `日本扭蛋（轉蛋）新手教學：${P.year}年新品有${P.mainPct}%落在${fmt(P.mainLo)}～${fmt(P.mainHi)}日圓、百圓硬幣與換鈔機、能不能刷卡或用交通卡、為什麼不能免稅、扭蛋沒掉出來怎麼辦。`,
    intro: "扭蛋（Gashapon、轉蛋）就是投錢、轉把手，就會隨機掉出一款正面所畫系列玩具的日本膠囊玩具機。第一次玩之前，先看看價格、付款方式和禮儀吧。",
    quick: `投入100日圓硬幣（大多數機器只收100日圓硬幣），把把手往右（順時針）轉到底，扭蛋就會從下方出口掉出來。價格大多是${mainTxt}（我們整理的${P.year}年${fmt(P.N)}個系列中佔${P.mainPct}%）。扭蛋店裡有可以把1,000日圓鈔票換成100日圓硬幣的換鈔機。扭蛋不能免稅。`,
    sections: [
      ["扭蛋一次多少錢？", `<p>每台機器上都標有價格，用100日圓硬幣付款，400日圓的扭蛋就是投4枚。我們整理的${P.year}年日本發售扭蛋共${fmt(P.N)}個系列，價格從${fmt(P.lo)}日圓到${fmt(P.hi)}日圓，其中${P.upTo800}%在800日圓以下，超過800日圓的高價扭蛋只有${P.over800}個。</p>
<div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>一次的價格</th><th>${P.year}年系列數</th><th>比例</th></tr></thead><tbody>${P.prices.map(([p, n]) => `<tr><td>${fmt(p)}日圓</td><td>${fmt(n)}</td><td>${esc(pctTxt(n, P.N))}</td></tr>`).join("")}</tbody></table></div>
<p>本站每個扭蛋頁面都有價格和全套款數。也可以看看${h.a(`${h.H}week.html`, "本週發售的扭蛋")}和${h.a(`${h.H}new.html`, "最新上架")}。</p>`],
      ["100日圓硬幣與換鈔機", `<p>幾乎所有扭蛋機都只收100日圓硬幣。只有鈔票也沒關係，扭蛋專賣店和大型扭蛋區都有換鈔機（兌幣機，日文「両替機」），可以把1張1,000日圓鈔票換成10枚100日圓硬幣。${D.changeLms.length ? `例如${D.changeLms.map((x) => h.lm(x)).join("、")}店內都有換鈔機。` : ""}出發前先在便利商店買東西換些零錢也可以。</p>
${D.changeLms.length ? h.cards(D.changeLms) : ""}`],
      ["可以刷卡、用西瓜卡或行動支付嗎？", `<p>部分較新的機器可以用Suica、PASMO等交通IC卡或QR Code支付，看看機器上有沒有貼紙或感應器。不過這類機器還是少數，信用卡基本上不能用，記得帶硬幣。</p>
<p>${D.cashYes.length ? `我們的清單中可以無現金支付的店家：${D.cashYes.map((x) => h.lm(x)).join("、")}。` : "我們確認過的大型扭蛋店中，目前還沒有確定能全面無現金支付的店。"}${D.cashNo.length ? `${D.cashNo.map((x) => h.lm(x)).join("、")}確定只收現金（硬幣）。` : ""}${D.lmById("gashacoco-ikebukuro") ? `${h.lm(D.lmById("gashacoco-ikebukuro"))}也註明不收信用卡。` : ""}</p>`],
      ["扭蛋可以免稅嗎？", "<p>不行。日本的免稅購物需要在有店員核對護照的櫃台辦理，而扭蛋是從無人機器一次一次購買，沒有辦理免稅的程序。機器上標的價格已經含消費稅，看到多少就付多少。</p>"],
      ["扭蛋禮儀", `<ul>
<li>有人在排隊時，先把硬幣準備好再上前。</li>
<li>請離開機器前再打開扭蛋，空殼丟進店裡的扭蛋殼回收箱，不要放在機器上。</li>
<li>不要搖晃、傾斜或拍打機器。</li>
<li>熱門新品有時會有「每人限購○次」的告示，請遵守。</li>
<li>能不能拍照每家店規定不同，請看店內告示。</li>
</ul>`],
      ["扭蛋沒掉出來怎麼辦？", "<p>偶爾會卡住或硬幣沒被讀到。不要搖機器；如果店裡有店員，告訴店員是哪一台。無人店的話，打機器貼紙上的聯絡電話找營運公司，記下系列名稱、時間和投了多少錢會比較好說明。日文說「出てきません（de-te-ki-ma-sen，沒有掉出來）」就能溝通。</p>"],
      ["要轉幾次才能收集全套？", `<p>每次都是隨機，所以會重複。假設每款出現機率相同，收集全部<i>n</i>款平均需要 <i>n</i> ×（1 + 1/2 + … + 1/<i>n</i>）次（集卡問題）。5款平均約${d5}次。${P.year}年的扭蛋最常見的是全${L.mode}款（佔${L.modePct}%）。</p>
<div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>款數</th><th>集滿平均次數</th><th>一次${fmt(P.mode)}日圓時</th></tr></thead><tbody>${drawRow}</tbody></table></div>
<p>有稀有款或隱藏款的系列需要更多次。和朋友交換重複的款式可以快很多。</p>`],
      ["從哪裡開始玩？", `<p>第一次建議去大型扭蛋店：數百到數千台機器集中在一起，也有換鈔機。可以參考${h.a(`${h.H}guide/tokyo-gachapon-shops.html`, "東京大型扭蛋店排行")}、${h.a(`${h.H}guide/gashapon-department-store-ikebukuro.html`, "池袋扭蛋百貨攻略")}，或用${h.a(`${h.H}station.html`, "依車站找扭蛋店")}。</p>`],
    ],
    faq: [
      ["日本扭蛋一次多少錢？", `大多是一次${mainTxt}（${P.year}年新品的${P.mainPct}%）。價格範圍是${fmt(P.lo)}～${fmt(P.hi)}日圓，${P.upTo800}%在800日圓以下。`],
      ["扭蛋機收500日圓硬幣或鈔票嗎？", "大多數機器只收100日圓硬幣，請用店內的換鈔機把鈔票換成100日圓硬幣。"],
      ["去哪裡換100日圓硬幣？", "扭蛋店和大型扭蛋區都有換鈔機，可以把1,000日圓鈔票換成100日圓硬幣；也可以在便利商店買東西時換零錢。"],
      ["可以刷信用卡或用Suica嗎？", "部分較新的機器可以用Suica等IC卡或QR Code支付（看機器上的貼紙或感應器）。信用卡基本上不能用，請帶硬幣。"],
      ["扭蛋可以免稅嗎？", "不行。扭蛋是從無人機器一次一次購買，沒有免稅程序。機器上的價格已含稅。"],
      ["扭蛋沒有掉出來怎麼辦？", "不要搖晃機器。告訴店員，或打機器貼紙上的聯絡電話，說明系列名稱、時間和金額。"],
      ["要轉幾次才能集滿全套？", `假設每款機率相同，5款平均約${d5}次、6款約${d6}次（n ×（1 + 1/2 + … + 1/n））。`],
      ["空的扭蛋殼要丟哪裡？", "大部分扭蛋店在機器旁邊都有扭蛋殼回收箱，請丟在那裡。"],
      ["可以選要哪一款嗎？", "不行。每次會從機器正面的款式中隨機掉出一款。"],
      ["Gacha、Gachapon、Gashapon有什麼不同？", "都是指同一種膠囊玩具機。「Gashapon」是萬代（BANDAI）的品牌名稱，「Gachapon」「Gacha」則是所有廠商通用的說法。"],
    ],
  };
};
C["zh-cn"]["how-to-play-gachapon"] = (D, h) => {
  const { P, L } = D;
  const mainTxt = P.main.map(([p]) => `${fmt(p)}日元`).join("、");
  const drawRow = D.DRAWS.map(([n, d]) => `<tr><td>${n}款</td><td>${d}次</td><td>${fmt(d * P.mode)}日元</td></tr>`).join("");
  const d5 = D.DRAWS.find(([n]) => n === 5)[1], d6 = D.DRAWS.find(([n]) => n === 6)[1];
  return {
    title: "日本扭蛋怎么玩：硬币、换币机、刷卡与免税",
    h1: "日本扭蛋怎么玩：硬币、换币机、刷卡与免税",
    short: "日本扭蛋怎么玩",
    desc: `日本扭蛋新手教程：${P.year}年新品有${P.mainPct}%在${fmt(P.mainLo)}～${fmt(P.mainHi)}日元、100日元硬币与换币机、能否刷卡或用交通卡、为什么不能免税、扭蛋没掉出来怎么办。`,
    intro: "扭蛋（Gashapon）就是投币、转动把手，就会随机掉出一款机器正面所画系列玩具的日本胶囊玩具机。第一次玩之前，先了解一下价格、付款方式和礼仪吧。",
    quick: `投入100日元硬币（大多数机器只收100日元硬币），把把手向右（顺时针）转到底，扭蛋就会从下方出口掉出来。价格大多是${mainTxt}（我们整理的${P.year}年${fmt(P.N)}个系列中占${P.mainPct}%）。扭蛋店里有能把1,000日元纸币换成100日元硬币的换币机。扭蛋不能免税。`,
    sections: [
      ["扭蛋一次多少钱？", `<p>每台机器上都标有价格，用100日元硬币付款，400日元的扭蛋就是投4枚。我们整理的${P.year}年日本发售扭蛋共${fmt(P.N)}个系列，价格从${fmt(P.lo)}日元到${fmt(P.hi)}日元，其中${P.upTo800}%在800日元以下，超过800日元的高价扭蛋只有${P.over800}个。</p>
<div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>一次的价格</th><th>${P.year}年系列数</th><th>比例</th></tr></thead><tbody>${P.prices.map(([p, n]) => `<tr><td>${fmt(p)}日元</td><td>${fmt(n)}</td><td>${esc(pctTxt(n, P.N))}</td></tr>`).join("")}</tbody></table></div>
<p>本站每个扭蛋页面都有价格和全套款数。也可以看看${h.a(`${h.H}week.html`, "本周发售的扭蛋")}和${h.a(`${h.H}new.html`, "最新上架")}。</p>`],
      ["100日元硬币与换币机", `<p>几乎所有扭蛋机都只收100日元硬币。只有纸币也没关系，扭蛋专卖店和大型扭蛋区都有换币机（日文「両替機」），可以把1张1,000日元纸币换成10枚100日元硬币。${D.changeLms.length ? `例如${D.changeLms.map((x) => h.lm(x)).join("、")}店内都有换币机。` : ""}出发前在便利店买点东西换些零钱也可以。</p>
${D.changeLms.length ? h.cards(D.changeLms) : ""}`],
      ["可以刷卡、用交通卡或扫码支付吗？", `<p>部分较新的机器可以用Suica、PASMO等交通IC卡或二维码支付，看看机器上有没有贴纸或感应器。不过这类机器还是少数，信用卡基本上不能用，记得带硬币。</p>
<p>${D.cashYes.length ? `我们的清单中可以无现金支付的店铺：${D.cashYes.map((x) => h.lm(x)).join("、")}。` : "我们确认过的大型扭蛋店中，目前还没有确定能全面无现金支付的店。"}${D.cashNo.length ? `${D.cashNo.map((x) => h.lm(x)).join("、")}确定只收现金（硬币）。` : ""}${D.lmById("gashacoco-ikebukuro") ? `${h.lm(D.lmById("gashacoco-ikebukuro"))}也注明不收信用卡。` : ""}</p>`],
      ["扭蛋可以免税吗？", "<p>不可以。日本的免税购物需要在有店员核对护照的柜台办理，而扭蛋是在无人机器上一次一次购买，没有办理免税的流程。机器上标的价格已经含消费税，看到多少就付多少。</p>"],
      ["扭蛋礼仪", `<ul>
<li>有人排队时，先把硬币准备好再上前。</li>
<li>请离开机器再打开扭蛋，空壳放进店里的扭蛋壳回收箱，不要放在机器上。</li>
<li>不要摇晃、倾斜或拍打机器。</li>
<li>热门新品有时会有“每人限购○次”的告示，请遵守。</li>
<li>能否拍照每家店规定不同，请看店内告示。</li>
</ul>`],
      ["扭蛋没掉出来怎么办？", "<p>偶尔会卡住或硬币没被识别。不要摇机器；如果店里有店员，告诉店员是哪一台。无人店的话，拨打机器贴纸上的联系电话找运营公司，记下系列名称、时间和投了多少钱会更好说明。日语说「出てきません（de-te-ki-ma-sen，没有掉出来）」就能沟通。</p>"],
      ["要扭几次才能集齐全套？", `<p>每次都是随机的，所以会重复。假设每款出现概率相同，集齐全部<i>n</i>款平均需要 <i>n</i> ×（1 + 1/2 + … + 1/<i>n</i>）次（集卡问题）。5款平均约${d5}次。${P.year}年的扭蛋最常见的是全${L.mode}款（占${L.modePct}%）。</p>
<div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>款数</th><th>集齐平均次数</th><th>一次${fmt(P.mode)}日元时</th></tr></thead><tbody>${drawRow}</tbody></table></div>
<p>有稀有款或隐藏款的系列需要更多次。和朋友交换重复的款式能快很多。</p>`],
      ["从哪里开始？", `<p>第一次建议去大型扭蛋店：几百到几千台机器集中在一起，也有换币机。可以参考${h.a(`${h.H}guide/tokyo-gachapon-shops.html`, "东京大型扭蛋店排行")}、${h.a(`${h.H}guide/gashapon-department-store-ikebukuro.html`, "池袋扭蛋百货攻略")}，或用${h.a(`${h.H}station.html`, "按车站找扭蛋店")}。</p>`],
    ],
    faq: [
      ["日本扭蛋一次多少钱？", `大多是一次${mainTxt}（${P.year}年新品的${P.mainPct}%）。价格范围是${fmt(P.lo)}～${fmt(P.hi)}日元，${P.upTo800}%在800日元以下。`],
      ["扭蛋机收500日元硬币或纸币吗？", "大多数机器只收100日元硬币，请用店内的换币机把纸币换成100日元硬币。"],
      ["去哪里换100日元硬币？", "扭蛋店和大型扭蛋区都有换币机，可以把1,000日元纸币换成100日元硬币；也可以在便利店买东西时换零钱。"],
      ["可以刷信用卡或用Suica吗？", "部分较新的机器可以用Suica等IC卡或二维码支付（看机器上的贴纸或感应器）。信用卡基本不能用，请带硬币。"],
      ["扭蛋可以免税吗？", "不可以。扭蛋是在无人机器上一次一次购买，没有免税流程。机器上的价格已含税。"],
      ["扭蛋没有掉出来怎么办？", "不要摇晃机器。告诉店员，或拨打机器贴纸上的联系电话，说明系列名称、时间和金额。"],
      ["要扭几次才能集齐全套？", `假设每款概率相同，5款平均约${d5}次、6款约${d6}次（n ×（1 + 1/2 + … + 1/n））。`],
      ["空的扭蛋壳扔在哪里？", "大部分扭蛋店在机器旁边都有扭蛋壳回收箱，请放在那里。"],
      ["可以选要哪一款吗？", "不可以。每次会从机器正面的款式中随机掉出一款。"],
      ["Gacha、Gachapon、Gashapon有什么区别？", "都是指同一种胶囊玩具机。“Gashapon”是万代（BANDAI）的品牌名称，“Gachapon”“Gacha”是所有厂商通用的叫法。"],
    ],
  };
};

/* ===== 2. ガシャポンのデパート池袋総本店 ===== */
// 共通の数字（駅から・お店どうしの距離）
const ikeNums = (D) => {
  const { ike, between } = D, { walkMin } = D.E;
  const m = ike.main, mo = ike.mori, co = ike.coco;
  return {
    m, mo, co,
    wMain: m ? walkMin(m.d) : null, wMori: mo ? walkMin(mo.d) : null, wCoco: co ? walkMin(co.d) : null,
    mainMori: between(m, mo), mainCoco: between(m, co),
    total: [m, mo, co].filter(Boolean).reduce((s, x) => s + (x.lm.machines || 0), 0),
    early: [m, mo, co].filter(Boolean).sort((a, b) => hOpen(a.lm.hours) - hOpen(b.lm.hours))[0],
    hg: ((m && m.lm.notes_en || "").match(/About (\d+) min from Higashi-Ikebukuro/) || [])[1] || "",
    late: [m, mo, co].filter(Boolean).sort((a, b) => hClose(b.lm.hours) - hClose(a.lm.hours))[0],
  };
};
C.en["gashapon-department-store-ikebukuro"] = (D, h) => {
  const N = ikeNums(D), { m, mo, co } = N, fd = D.E.fmtDist, wm = D.E.walkMin;
  if (!m) return null;
  return {
    title: "Gashapon Department Store Ikebukuro: Complete Guide",
    h1: "Gashapon Department Store Ikebukuro: complete guide",
    short: "Gashapon Department Store Ikebukuro",
    desc: `Gashapon Department Store Ikebukuro: ~${fmt(m.lm.machines)} machines in Sunshine City, open ${m.lm.hours}. Access from Ikebukuro Station, nearby shops and this week's new gacha.`,
    intro: `The Gashapon Department Store Ikebukuro Main Store (ガシャポンのデパート 池袋総本店) is Bandai's flagship gacha shop and one of the largest in the world, with about ${fmt(m.lm.machines)} machines. Two more giant shops are a short walk away, so Ikebukuro is the easiest place in Tokyo to see thousands of gacha in one afternoon.`,
    quick: `${m.lm.floor_en}. Open ${m.lm.hours}. About ${fmt(m.lm.machines)} machines. About ${N.wMain} min on foot from Ikebukuro Station (${fd(m.d)} straight-line), or about ${N.hg} min from Higashi-Ikebukuro Station on the Yurakucho Line.${mo && co ? ` With Gachagacha no Mori and gashacoco nearby, that's about ${fmt(N.total)} machines in walking distance.` : ""}`,
    sections: [
      ["Main store facts", `<dl class="guide-facts"><dt>Location</dt><dd>${h.esc(m.lm.floor_en)}</dd><dt>Hours</dt><dd>${h.esc(m.lm.hours)}</dd><dt>Machines</dt><dd>About ${fmt(m.lm.machines)}</dd><dt>Nearest stations</dt><dd>Ikebukuro (about ${N.wMain} min on foot) · Higashi-Ikebukuro, Yurakucho Line (about ${N.hg} min)</dd></dl>
${h.cards([m])}
<p>Hours follow Bandai Namco Cross Store Tokyo in the same building. Bring ¥100 coins (big gacha shops usually have change machines); gacha is not tax-free (see ${h.a(`${h.H}guide/how-to-play-gachapon.html`, "how to play gachapon")}).</p>`],
      ["Getting there from Ikebukuro Station", `<p>Leave Ikebukuro Station by the East Exit and walk along Sunshine 60-dori to Sunshine City; the shop is on 3F of the World Import Mart building. It's about ${fd(m.d)} in a straight line — about ${N.wMain} minutes on foot. If you're on the Tokyo Metro Yurakucho Line, Higashi-Ikebukuro Station is closer, about ${N.hg} minutes away.</p>
<p>All gacha shops around the station are on our ${h.st("ikebukuro")} page with a map.</p>`],
      ["Nearby: Gachagacha no Mori and gashacoco", `<p>${mo ? `${h.lm(mo)} is in Sunshine City Alta, only about ${fd(N.mainMori)} from the main store, with about ${fmt(mo.lm.machines)} machines (${h.esc(mo.lm.hours)}). ` : ""}${co ? `${h.lm(co)} is closer to the station (about ${N.wCoco} min on foot) with about ${fmt(co.lm.machines)} machines on two floors, change machines on each floor, and no credit cards (${h.esc(co.lm.hours)}).` : ""}</p>
${h.cards([mo, co].filter(Boolean))}`],
      ["Suggested order", `<ol>
<li><b>${h.lm(N.early)}</b> opens earliest (${h.esc(N.early.lm.hours)}), so start there.</li>
${mo && N.early !== mo ? `<li><b>${h.lm(mo)}</b>, about ${wm(N.mainMori)} min away in Sunshine City Alta.</li>` : ""}
${co && N.late === co ? `<li><b>${h.lm(co)}</b> on your way back to the station — it stays open latest (${h.esc(co.lm.hours)}).</li>` : ""}
</ol>
<p>Want a route through more shops? Try the ${h.a(`${h.R}gachakatsu.html`, "gacha route planner")} (in Japanese; just type 池袋).</p>`],
      ["More gacha shops near Ikebukuro", `<p>Besides these, Bandai's official shop finder lists ${D.ike.st.rest.length} more gacha shops around Ikebukuro Station.</p>${h.rows(D.ike.st.rest.slice(0, 4))}<p>${h.a(`${h.H}station/ikebukuro.html`, `See all ${D.ike.st.count} shops near Ikebukuro on a map →`)}</p>`],
      ["What's new this week", `<p>${D.ike.weekLocal ? "New gacha releasing this week that Bandai's shop list shows at shops around Ikebukuro" : "New gacha releasing in Japan this week"} (shops may get them a few days earlier or later):</p>${h.grid(D.ike.week)}<p>${h.a(`${h.H}week.html`, `All ${D.weekN} releases this week →`)}</p>`],
    ],
    faq: [
      ["Where is the Gashapon Department Store in Ikebukuro?", `${m.lm.floor_en}. About ${N.wMain} min on foot from Ikebukuro Station (East Exit), or about ${N.hg} min from Higashi-Ikebukuro Station.`],
      ["How many gacha machines does the Ikebukuro store have?", `About ${fmt(m.lm.machines)} machines, making it one of the largest gacha shops in the world.`],
      ["What are the opening hours?", `${m.lm.hours}. Hours follow Bandai Namco Cross Store Tokyo and can change on holidays, so check before you go.`],
      ...(mo && co ? [["Are there other big gacha shops nearby?", `Yes: ${mo.lm.name_en} (about ${fmt(mo.lm.machines)} machines) in Sunshine City Alta, and gashacoco Ikebukuro (about ${fmt(co.lm.machines)} machines) near the station. Together with the main store that's about ${fmt(N.total)} machines.`]] : []),
      ["Can I pay by credit card?", `Gacha machines generally take ¥100 coins; use the change machines.${co ? " gashacoco Ikebukuro states that credit cards are not accepted." : ""}`],
      ["Is it tax-free?", "No. Gacha is bought from unattended machines, so there is no tax-free procedure."],
    ],
  };
};
C.ko["gashapon-department-store-ikebukuro"] = (D, h) => {
  const N = ikeNums(D), { m, mo, co } = N, fd = D.E.fmtDist, wm = D.E.walkMin;
  if (!m) return null;
  return {
    title: "이케부쿠로 가샤폰 백화점 완벽 가이드: 영업시간·가는 법·근처 가챠샵",
    h1: "이케부쿠로 가샤폰 백화점 완벽 가이드",
    short: "이케부쿠로 가샤폰 백화점",
    desc: `가샤폰 백화점 이케부쿠로 본점은 선샤인시티 월드 임포트 마트 3층, 약 ${fmt(m.lm.machines)}대, ${m.lm.hours} 영업. 이케부쿠로역에서 가는 법, 근처 가챠가챠의 숲·가샤코코, 이번 주 신작까지.`,
    intro: `가샤폰 백화점 이케부쿠로 본점(ガシャポンのデパート 池袋総本店)은 반다이의 대표 가챠샵으로, 약 ${fmt(m.lm.machines)}대의 가챠가 모여 있는 세계 최대급 매장이에요. 걸어갈 수 있는 거리에 대형 가챠샵이 두 곳 더 있어서, 이케부쿠로는 도쿄에서 반나절 만에 수천 대의 가챠를 볼 수 있는 곳이에요.`,
    quick: `선샤인시티 월드 임포트 마트 빌딩 3층, 영업 ${m.lm.hours}, 약 ${fmt(m.lm.machines)}대. 이케부쿠로역에서 걸어서 약 ${N.wMain}분(직선 ${fd(m.d)}), 유라쿠초선 히가시이케부쿠로역에서는 약 ${N.hg}분이에요.${mo && co ? ` 근처의 가챠가챠의 숲, 가샤코코까지 합치면 걸어서 갈 수 있는 곳에 약 ${fmt(N.total)}대가 있어요.` : ""}`,
    sections: [
      ["본점 기본 정보", `<dl class="guide-facts"><dt>위치</dt><dd>선샤인시티 월드 임포트 마트 빌딩 3층</dd><dt>영업시간</dt><dd>${h.esc(m.lm.hours)}</dd><dt>기계 수</dt><dd>약 ${fmt(m.lm.machines)}대</dd><dt>가까운 역</dt><dd>이케부쿠로역(도보 약 ${N.wMain}분) · 유라쿠초선 히가시이케부쿠로역(약 ${N.hg}분)</dd></dl>
${h.cards([m])}
<p>영업시간은 같은 건물의 반다이남코 크로스 스토어 도쿄와 같아요. 100엔 동전을 준비하세요(대형 가챠샵에는 보통 환전기가 있어요). 가챠는 면세가 안 돼요(${h.a(`${h.H}guide/how-to-play-gachapon.html`, "일본 가챠 하는 법")} 참고).</p>`],
      ["이케부쿠로역에서 가는 법", `<p>이케부쿠로역 동쪽 출구(東口)로 나와 선샤인 60 거리(サンシャイン60通り)를 따라 선샤인시티까지 걸어가면 돼요. 매장은 월드 임포트 마트 빌딩 3층이에요. 직선거리 약 ${fd(m.d)}, 걸어서 약 ${N.wMain}분이에요. 도쿄메트로 유라쿠초선을 탄다면 히가시이케부쿠로역이 더 가까워서 약 ${N.hg}분이면 도착해요.</p>
<p>역 주변의 모든 가챠샵은 ${h.st("ikebukuro")} 페이지에서 지도로 볼 수 있어요.</p>`],
      ["근처 가챠샵: 가챠가챠의 숲·가샤코코", `<p>${mo ? `${h.lm(mo)}은 선샤인시티 알타 안에 있어서 본점에서 약 ${fd(N.mainMori)}밖에 안 떨어져 있고, 약 ${fmt(mo.lm.machines)}대가 있어요(${h.esc(mo.lm.hours)}). ` : ""}${co ? `${h.lm(co)}는 역에서 더 가까워요(도보 약 ${N.wCoco}분). 2개 층에 약 ${fmt(co.lm.machines)}대가 있고, 층마다 환전기가 있으며 신용카드는 안 돼요(${h.esc(co.lm.hours)}).` : ""}</p>
${h.cards([mo, co].filter(Boolean))}`],
      ["추천 순서", `<ol>
<li><b>${h.lm(N.early)}</b>이 가장 일찍 열어요(${h.esc(N.early.lm.hours)}). 여기서 시작하세요.</li>
${mo && N.early !== mo ? `<li>선샤인시티 알타의 <b>${h.lm(mo)}</b>까지 걸어서 약 ${wm(N.mainMori)}분.</li>` : ""}
${co && N.late === co ? `<li>역으로 돌아가는 길에 <b>${h.lm(co)}</b>. 가장 늦게까지 열어요(${h.esc(co.lm.hours)}).</li>` : ""}
</ol>
<p>더 많은 가게를 돌고 싶다면 ${h.a(`${h.R}gachakatsu.html`, "가챠 투어 루트")} 기능을 써 보세요(일본어 페이지, 池袋라고 입력하면 돼요).</p>`],
      ["이케부쿠로 주변 다른 가챠샵", `<p>이 밖에도 반다이 공식 매장 검색 기준으로 이케부쿠로역 주변에 가챠샵이 ${D.ike.st.rest.length}곳 더 있어요.</p>${h.rows(D.ike.st.rest.slice(0, 4))}<p>${h.a(`${h.H}station/ikebukuro.html`, `이케부쿠로 주변 ${D.ike.st.count}곳 지도로 보기 →`)}</p>`],
      ["이번 주 신작 가챠", `<p>${D.ike.weekLocal ? "반다이 공식 매장 목록 기준으로 이케부쿠로 주변 매장에 들어오는 이번 주 발매 가챠예요" : "이번 주 일본에서 발매되는 가챠예요"}(매장에 따라 며칠 빠르거나 늦을 수 있어요).</p>${h.grid(D.ike.week)}<p>${h.a(`${h.H}week.html`, `이번 주 발매 ${D.weekN}개 전체 보기 →`)}</p>`],
    ],
    faq: [
      ["이케부쿠로 가샤폰 백화점은 어디에 있어요?", `선샤인시티 월드 임포트 마트 빌딩 3층이에요. 이케부쿠로역 동쪽 출구에서 걸어서 약 ${N.wMain}분, 히가시이케부쿠로역에서 약 ${N.hg}분이에요.`],
      ["가챠 기계는 몇 대 있어요?", `약 ${fmt(m.lm.machines)}대로, 세계 최대급 가챠샵이에요.`],
      ["영업시간은요?", `${m.lm.hours}예요. 반다이남코 크로스 스토어 도쿄와 같고 휴일에는 바뀔 수 있으니 가기 전에 확인하세요.`],
      ...(mo && co ? [["근처에 다른 대형 가챠샵도 있나요?", `네. 선샤인시티 알타의 가챠가챠의 숲(약 ${fmt(mo.lm.machines)}대)과 역 근처의 가샤코코 이케부쿠로(약 ${fmt(co.lm.machines)}대)가 있어요. 본점까지 합치면 약 ${fmt(N.total)}대예요.`]] : []),
      ["신용카드 되나요?", `가챠 기계는 기본적으로 100엔 동전을 써요. 환전기를 이용하세요.${co ? " 가샤코코 이케부쿠로는 신용카드를 받지 않는다고 안내하고 있어요." : ""}`],
      ["면세 되나요?", "안 돼요. 가챠는 무인 기계에서 사는 방식이라 면세 절차가 없어요."],
    ],
  };
};
C["zh-tw"]["gashapon-department-store-ikebukuro"] = (D, h) => {
  const N = ikeNums(D), { m, mo, co } = N, fd = D.E.fmtDist, wm = D.E.walkMin;
  if (!m) return null;
  return {
    title: "池袋扭蛋百貨總店完整攻略：營業時間、交通、附近扭蛋店",
    h1: "池袋扭蛋百貨（Gashapon Department Store）完整攻略",
    short: "池袋扭蛋百貨總店",
    desc: `扭蛋百貨池袋總店位於太陽城World Import Mart 3F，約${fmt(m.lm.machines)}台、營業${m.lm.hours}。從池袋站怎麼走、附近的扭蛋森林與gashacoco，以及本週新品。`,
    intro: `扭蛋百貨池袋總店（ガシャポンのデパート 池袋総本店）是萬代的旗艦扭蛋店，約有${fmt(m.lm.machines)}台扭蛋機，是世界最大級的扭蛋店之一。走路就能到的地方還有兩家大型扭蛋店，在池袋一個下午就能逛遍幾千台扭蛋。`,
    quick: `太陽城World Import Mart大樓3F，營業${m.lm.hours}，約${fmt(m.lm.machines)}台。從池袋站步行約${N.wMain}分鐘（直線${fd(m.d)}），從有樂町線東池袋站約${N.hg}分鐘。${mo && co ? `加上附近的扭蛋森林和gashacoco，步行範圍內約有${fmt(N.total)}台。` : ""}`,
    sections: [
      ["總店基本資訊", `<dl class="guide-facts"><dt>位置</dt><dd>太陽城 World Import Mart大樓3F</dd><dt>營業時間</dt><dd>${h.esc(m.lm.hours)}</dd><dt>機台數</dt><dd>約${fmt(m.lm.machines)}台</dd><dt>最近車站</dt><dd>池袋站（步行約${N.wMain}分鐘）・有樂町線東池袋站（約${N.hg}分鐘）</dd></dl>
${h.cards([m])}
<p>營業時間與同一棟的Bandai Namco Cross Store東京相同。請準備100日圓硬幣（大型扭蛋店通常有換鈔機）；扭蛋不能免稅（參考${h.a(`${h.H}guide/how-to-play-gachapon.html`, "日本扭蛋怎麼玩")}）。</p>`],
      ["從池袋站怎麼走", `<p>從池袋站東口出站，沿著太陽城60通（サンシャイン60通り）走到太陽城，店在World Import Mart大樓3F。直線距離約${fd(m.d)}，步行約${N.wMain}分鐘。如果搭東京Metro有樂町線，東池袋站更近，約${N.hg}分鐘就到。</p>
<p>車站周邊所有扭蛋店都整理在${h.st("ikebukuro")}頁面，附地圖。</p>`],
      ["附近的扭蛋森林與gashacoco", `<p>${mo ? `${h.lm(mo)}在太陽城ALTA裡，距離總店只有約${fd(N.mainMori)}，約有${fmt(mo.lm.machines)}台（${h.esc(mo.lm.hours)}）。` : ""}${co ? `${h.lm(co)}離車站更近（步行約${N.wCoco}分鐘），兩層樓約${fmt(co.lm.machines)}台，每層都有換鈔機，不收信用卡（${h.esc(co.lm.hours)}）。` : ""}</p>
${h.cards([mo, co].filter(Boolean))}`],
      ["推薦逛法", `<ol>
<li><b>${h.lm(N.early)}</b>最早開門（${h.esc(N.early.lm.hours)}），從這裡開始。</li>
${mo && N.early !== mo ? `<li>走約${wm(N.mainMori)}分鐘到太陽城ALTA的<b>${h.lm(mo)}</b>。</li>` : ""}
${co && N.late === co ? `<li>回車站的路上逛<b>${h.lm(co)}</b>，它開到最晚（${h.esc(co.lm.hours)}）。</li>` : ""}
</ol>
<p>想多逛幾家，可以用${h.a(`${h.R}gachakatsu.html`, "扭蛋巡店路線")}（日文頁面，輸入「池袋」即可）。</p>`],
      ["池袋周邊其他扭蛋店", `<p>除此之外，根據萬代官方的店鋪搜尋，池袋站周邊還有${D.ike.st.rest.length}家扭蛋店。</p>${h.rows(D.ike.st.rest.slice(0, 4))}<p>${h.a(`${h.H}station/ikebukuro.html`, `用地圖看池袋周邊全部${D.ike.st.count}家 →`)}</p>`],
      ["本週新品", `<p>${D.ike.weekLocal ? "依萬代官方店鋪清單，池袋周邊店家會進貨的本週新品扭蛋" : "本週在日本發售的扭蛋"}（各店可能早幾天或晚幾天上架）：</p>${h.grid(D.ike.week)}<p>${h.a(`${h.H}week.html`, `本週發售全部${D.weekN}款 →`)}</p>`],
    ],
    faq: [
      ["池袋扭蛋百貨在哪裡？", `在太陽城World Import Mart大樓3F。從池袋站東口步行約${N.wMain}分鐘，從東池袋站約${N.hg}分鐘。`],
      ["池袋總店有幾台扭蛋機？", `約${fmt(m.lm.machines)}台，是世界最大級的扭蛋店之一。`],
      ["營業時間是幾點？", `${m.lm.hours}。與Bandai Namco Cross Store東京相同，假日可能變動，出發前請確認。`],
      ...(mo && co ? [["附近還有其他大型扭蛋店嗎？", `有。太陽城ALTA的扭蛋森林（約${fmt(mo.lm.machines)}台），以及車站附近的gashacoco池袋（約${fmt(co.lm.machines)}台）。加上總店共約${fmt(N.total)}台。`]] : []),
      ["可以刷信用卡嗎？", `扭蛋機基本上用100日圓硬幣，請使用換鈔機。${co ? "gashacoco池袋註明不收信用卡。" : ""}`],
      ["可以免稅嗎？", "不行。扭蛋是從無人機器購買，沒有免稅程序。"],
    ],
  };
};
C["zh-cn"]["gashapon-department-store-ikebukuro"] = (D, h) => {
  const N = ikeNums(D), { m, mo, co } = N, fd = D.E.fmtDist, wm = D.E.walkMin;
  if (!m) return null;
  return {
    title: "池袋扭蛋百货总店完整攻略：营业时间、交通、附近扭蛋店",
    h1: "池袋扭蛋百货（Gashapon Department Store）完整攻略",
    short: "池袋扭蛋百货总店",
    desc: `扭蛋百货池袋总店位于阳光城World Import Mart 3F，约${fmt(m.lm.machines)}台、营业${m.lm.hours}。从池袋站怎么走、附近的扭蛋森林和gashacoco，以及本周新品。`,
    intro: `扭蛋百货池袋总店（ガシャポンのデパート 池袋総本店）是万代的旗舰扭蛋店，约有${fmt(m.lm.machines)}台扭蛋机，是世界最大级的扭蛋店之一。步行可达的地方还有两家大型扭蛋店，在池袋一个下午就能逛遍几千台扭蛋。`,
    quick: `阳光城World Import Mart大楼3F，营业${m.lm.hours}，约${fmt(m.lm.machines)}台。从池袋站步行约${N.wMain}分钟（直线${fd(m.d)}），从有乐町线东池袋站约${N.hg}分钟。${mo && co ? `加上附近的扭蛋森林和gashacoco，步行范围内约有${fmt(N.total)}台。` : ""}`,
    sections: [
      ["总店基本信息", `<dl class="guide-facts"><dt>位置</dt><dd>阳光城 World Import Mart大楼3F</dd><dt>营业时间</dt><dd>${h.esc(m.lm.hours)}</dd><dt>机台数</dt><dd>约${fmt(m.lm.machines)}台</dd><dt>最近车站</dt><dd>池袋站（步行约${N.wMain}分钟）・有乐町线东池袋站（约${N.hg}分钟）</dd></dl>
${h.cards([m])}
<p>营业时间与同一栋楼的Bandai Namco Cross Store东京相同。请准备100日元硬币（大型扭蛋店通常有换币机）；扭蛋不能免税（参考${h.a(`${h.H}guide/how-to-play-gachapon.html`, "日本扭蛋怎么玩")}）。</p>`],
      ["从池袋站怎么走", `<p>从池袋站东口出站，沿着阳光60大道（サンシャイン60通り）走到阳光城，店在World Import Mart大楼3F。直线距离约${fd(m.d)}，步行约${N.wMain}分钟。如果坐东京Metro有乐町线，东池袋站更近，约${N.hg}分钟就到。</p>
<p>车站周边所有扭蛋店都整理在${h.st("ikebukuro")}页面，附地图。</p>`],
      ["附近的扭蛋森林和gashacoco", `<p>${mo ? `${h.lm(mo)}在阳光城ALTA里，距离总店只有约${fd(N.mainMori)}，约有${fmt(mo.lm.machines)}台（${h.esc(mo.lm.hours)}）。` : ""}${co ? `${h.lm(co)}离车站更近（步行约${N.wCoco}分钟），两层楼约${fmt(co.lm.machines)}台，每层都有换币机，不收信用卡（${h.esc(co.lm.hours)}）。` : ""}</p>
${h.cards([mo, co].filter(Boolean))}`],
      ["推荐路线", `<ol>
<li><b>${h.lm(N.early)}</b>最早开门（${h.esc(N.early.lm.hours)}），从这里开始。</li>
${mo && N.early !== mo ? `<li>步行约${wm(N.mainMori)}分钟到阳光城ALTA的<b>${h.lm(mo)}</b>。</li>` : ""}
${co && N.late === co ? `<li>回车站的路上逛<b>${h.lm(co)}</b>，它营业到最晚（${h.esc(co.lm.hours)}）。</li>` : ""}
</ol>
<p>想多逛几家，可以用${h.a(`${h.R}gachakatsu.html`, "扭蛋巡店路线")}（日文页面，输入「池袋」即可）。</p>`],
      ["池袋周边其他扭蛋店", `<p>除此之外，根据万代官方的店铺搜索，池袋站周边还有${D.ike.st.rest.length}家扭蛋店。</p>${h.rows(D.ike.st.rest.slice(0, 4))}<p>${h.a(`${h.H}station/ikebukuro.html`, `用地图看池袋周边全部${D.ike.st.count}家 →`)}</p>`],
      ["本周新品", `<p>${D.ike.weekLocal ? "根据万代官方店铺清单，池袋周边店铺会进货的本周新品扭蛋" : "本周在日本发售的扭蛋"}（各店可能早几天或晚几天上架）：</p>${h.grid(D.ike.week)}<p>${h.a(`${h.H}week.html`, `本周发售全部${D.weekN}款 →`)}</p>`],
    ],
    faq: [
      ["池袋扭蛋百货在哪里？", `在阳光城World Import Mart大楼3F。从池袋站东口步行约${N.wMain}分钟，从东池袋站约${N.hg}分钟。`],
      ["池袋总店有多少台扭蛋机？", `约${fmt(m.lm.machines)}台，是世界最大级的扭蛋店之一。`],
      ["营业时间是几点？", `${m.lm.hours}。与Bandai Namco Cross Store东京相同，节假日可能变动，出发前请确认。`],
      ...(mo && co ? [["附近还有其他大型扭蛋店吗？", `有。阳光城ALTA的扭蛋森林（约${fmt(mo.lm.machines)}台），以及车站附近的gashacoco池袋（约${fmt(co.lm.machines)}台）。加上总店共约${fmt(N.total)}台。`]] : []),
      ["可以刷信用卡吗？", `扭蛋机基本上用100日元硬币，请使用换币机。${co ? "gashacoco池袋注明不收信用卡。" : ""}`],
      ["可以免税吗？", "不可以。扭蛋是在无人机器上购买，没有免税流程。"],
    ],
  };
};

/* ===== 3. 東京の大きいガチャ専門店（台数順） ===== */
const tokyoTable = (D, h, L) => `<div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>#</th><th>${L.shop}</th><th>${L.area}</th><th>${L.machines}</th><th>${L.floor}</th><th>${L.hours}</th></tr></thead><tbody>${D.tokyo.map((x, i) => `<tr><td>${x.lm.machines ? i + 1 : "–"}</td><td>${h.lmLink(x)}</td><td>${h.st(x.st.slug)}</td><td>${x.lm.machines ? L.n(x.lm.machines) : L.unknown}</td><td lang="en">${h.esc(x.lm.floor_en || "")}</td><td>${h.esc(x.lm.hours || "–")}</td></tr>`).join("")}</tbody></table></div>`;
const tokyoNums = (D) => {
  const known = D.tokyo.filter((x) => x.lm.machines);
  const late = D.tokyo.filter((x) => hClose(x.lm.hours) != null).sort((a, b) => hClose(b.lm.hours) - hClose(a.lm.hours));
  const lateMax = late.length ? hClose(late[0].lm.hours) : null;
  const latest = late.filter((x) => hClose(x.lm.hours) === lateMax);
  const areaTop = (slug) => D.tokyo.filter((x) => x.st.slug === slug && x.lm.machines)[0] || null;
  return { known, top: known[0], latest, lateTxt: lateMax != null ? `${Math.floor(lateMax / 60)}:${String(lateMax % 60).padStart(2, "0")}` : "", areaTop, top5: known.slice(0, 6) };
};
C.en["tokyo-gachapon-shops"] = (D, h) => {
  const T = tokyoNums(D); if (!T.top) return null;
  const aki = T.areaTop("akihabara"), shi = T.areaTop("shibuya"), shj = T.areaTop("shinjuku");
  return {
    title: "Biggest Gachapon Shops in Tokyo, Ranked by Number of Machines",
    h1: "Biggest gachapon shops in Tokyo (ranked by machines)",
    short: "Biggest gachapon shops in Tokyo",
    desc: `The ${D.tokyo.length} best-known gachapon shops in Tokyo ranked by machines — ${T.top.lm.name_en} (~${fmt(T.top.lm.machines)}) and more — with area, floor, hours and station links.`,
    intro: `Tokyo has more giant gacha shops than anywhere else in Japan. Here are the ${D.tokyo.length} best-known ones, ranked by approximate number of machines (shops whose count isn't published come last). Machine counts and hours are from official sites or major travel media, checked ${D.E.LANDMARKS_CHECKED}.`,
    quick: `The biggest is ${T.top.lm.name_en} with about ${fmt(T.top.lm.machines)} machines (${T.top.st.en}). ${T.known[1] ? `Next come ${T.known[1].lm.name_en} (~${fmt(T.known[1].lm.machines)})` : ""}${T.known[2] ? ` and ${T.known[2].lm.name_en} (~${fmt(T.known[2].lm.machines)})` : ""}.`,
    sections: [
      ["Ranking table", `${tokyoTable(D, h, { shop: "Shop", area: "Area", machines: "Machines", floor: "Floor", hours: "Hours", n: (k) => `~${fmt(k)}`, unknown: "not published" })}<p class="fine">Machine counts are approximate and change as shops refit. Tap an area to see every gacha shop near that station.</p>`],
      ["The top shops at a glance", h.cards(T.top5)],
      ["Which area should I visit?", `<ul>
<li><b>Ikebukuro</b> — three giant shops within walking distance. See our ${h.a(`${h.H}guide/gashapon-department-store-ikebukuro.html`, "Ikebukuro guide")}.</li>
${shi ? `<li><b>Shibuya</b> — ${h.lm(shi)} (~${fmt(shi.lm.machines)}) in Center-gai, close to the Scramble Crossing.</li>` : ""}
${aki ? `<li><b>Akihabara</b> — ${h.lm(aki)} (~${fmt(aki.lm.machines)}) plus gacha corners all over the electric town.</li>` : ""}
${shj ? `<li><b>Shinjuku</b> — ${h.lm(shj)} (~${fmt(shj.lm.machines)}) in the underground mall.</li>` : ""}
</ul>${T.latest.length ? `<p>Latest closing: ${T.latest.map((x) => h.lm(x)).join(", ")} (until ${T.lateTxt}).</p>` : ""}`],
      ["Before you go", `<p>Bring ¥100 coins (or use the change machines) — read ${h.a(`${h.H}guide/how-to-play-gachapon.html`, "how to play gachapon")}. To find a specific series, see ${h.a(`${h.H}guide/check-gachapon-stock.html`, "how to check stock")} and ${h.a(`${h.H}week.html`, "this week's releases")}.</p>`],
    ],
    faq: [
      ["What is the biggest gachapon shop in Tokyo?", `${T.top.lm.name_en}, with about ${fmt(T.top.lm.machines)} machines (${T.top.lm.floor_en}).`],
      ...(aki ? [["What is the biggest gacha shop in Akihabara?", `${aki.lm.name_en}, with about ${fmt(aki.lm.machines)} machines (${aki.lm.floor_en}).`]] : []),
      ...(shi ? [["What is the biggest gacha shop in Shibuya?", `${shi.lm.name_en}, with about ${fmt(shi.lm.machines)} machines (${shi.lm.floor_en}).`]] : []),
      ...(T.latest.length ? [["Which Tokyo gacha shops are open late?", `${T.latest.map((x) => x.lm.name_en).join(" and ")} ${T.latest.length > 1 ? "are" : "is"} open until ${T.lateTxt}.`]] : []),
      ["Are machine counts exact?", "No. They're approximate figures from official sites and major media and can change as shops refit."],
    ],
  };
};
C.ko["tokyo-gachapon-shops"] = (D, h) => {
  const T = tokyoNums(D); if (!T.top) return null;
  const aki = T.areaTop("akihabara"), shi = T.areaTop("shibuya"), shj = T.areaTop("shinjuku");
  return {
    title: "도쿄 대형 가챠샵 순위: 기계 수 많은 곳 TOP",
    h1: "도쿄 대형 가챠샵 순위(기계 수 기준)",
    short: "도쿄 대형 가챠샵 순위",
    desc: `도쿄의 유명 가챠샵 ${D.tokyo.length}곳을 기계 수 순으로 정리. ${T.known.slice(0, 3).map((x) => `${h.lmName(x)}(약 ${fmt(x.lm.machines)}대)`).join(", ")} 등. 지역·층·영업시간·역 링크.`,
    intro: `도쿄에는 일본에서 가장 많은 대형 가챠샵이 모여 있어요. 유명한 ${D.tokyo.length}곳을 기계 수(대략) 순으로 정리했어요(기계 수가 공개되지 않은 곳은 맨 뒤). 기계 수와 영업시간은 공식 사이트나 주요 매체 정보예요(${D.E.LANDMARKS_CHECKED} 확인).`,
    quick: `가장 큰 곳은 ${kj(h.lmName(T.top), "으로")} 약 ${fmt(T.top.lm.machines)}대예요(${T.top.st.ko}). ${T.known[1] ? `그다음은 ${h.lmName(T.known[1])}(약 ${fmt(T.known[1].lm.machines)}대)` : ""}${T.known[2] ? `, ${h.lmName(T.known[2])}(약 ${fmt(T.known[2].lm.machines)}대)` : ""} 순이에요.`,
    sections: [
      ["순위표", `${tokyoTable(D, h, { shop: "가게", area: "지역", machines: "기계 수", floor: "층", hours: "영업시간", n: (k) => `약 ${fmt(k)}대`, unknown: "비공개" })}<p class="fine">기계 수는 대략적인 수치이고 리뉴얼 등으로 바뀔 수 있어요. 지역을 누르면 그 역 주변의 모든 가챠샵을 볼 수 있어요.</p>`],
      ["상위 가챠샵 한눈에 보기", h.cards(T.top5)],
      ["어느 지역에 가면 좋을까?", `<ul>
<li><b>이케부쿠로</b> — 걸어서 갈 수 있는 거리에 대형 가챠샵 3곳. ${h.a(`${h.H}guide/gashapon-department-store-ikebukuro.html`, "이케부쿠로 가이드")} 참고.</li>
${shi ? `<li><b>시부야</b> — 센터가이의 ${h.lm(shi)}(약 ${fmt(shi.lm.machines)}대). 스크램블 교차로 근처예요.</li>` : ""}
${aki ? `<li><b>아키하바라</b> — ${h.lm(aki)}(약 ${fmt(aki.lm.machines)}대)와 전자상가 곳곳의 가챠 코너.</li>` : ""}
${shj ? `<li><b>신주쿠</b> — 지하상가의 ${h.lm(shj)}(약 ${fmt(shj.lm.machines)}대).</li>` : ""}
</ul>${T.latest.length ? `<p>가장 늦게까지 여는 곳: ${T.latest.map((x) => h.lm(x)).join(", ")}(${T.lateTxt}까지).</p>` : ""}`],
      ["가기 전에", `<p>100엔 동전을 챙기거나 환전기를 이용하세요. ${h.a(`${h.H}guide/how-to-play-gachapon.html`, "일본 가챠 하는 법")}을 먼저 읽어 보세요. 원하는 시리즈를 찾는다면 ${h.a(`${h.H}guide/check-gachapon-stock.html`, "가챠 재고 확인하는 법")}과 ${h.a(`${h.H}week.html`, "이번 주 발매 가챠")}도 확인하세요.</p>`],
    ],
    faq: [
      ["도쿄에서 가장 큰 가챠샵은 어디예요?", `${kj(h.lmName(T.top), "으로")}, 약 ${fmt(T.top.lm.machines)}대가 있어요.`],
      ...(aki ? [["아키하바라에서 가장 큰 가챠샵은요?", `${kj(h.lmName(aki), "으로")}, 약 ${fmt(aki.lm.machines)}대가 있어요.`]] : []),
      ...(shi ? [["시부야에서 가장 큰 가챠샵은요?", `${kj(h.lmName(shi), "으로")}, 약 ${fmt(shi.lm.machines)}대가 있어요.`]] : []),
      ...(T.latest.length ? [["늦게까지 여는 도쿄 가챠샵은요?", `${T.lateTxt}까지 여는 곳: ${T.latest.map((x) => h.lmName(x)).join(", ")}.`]] : []),
      ["기계 수는 정확한가요?", "아니요. 공식 사이트나 주요 매체의 대략적인 수치이고, 리뉴얼 등으로 바뀔 수 있어요."],
    ],
  };
};
C["zh-tw"]["tokyo-gachapon-shops"] = (D, h) => {
  const T = tokyoNums(D); if (!T.top) return null;
  const aki = T.areaTop("akihabara"), shi = T.areaTop("shibuya"), shj = T.areaTop("shinjuku");
  return {
    title: "東京大型扭蛋店排行：依機台數排名",
    h1: "東京大型扭蛋店排行（依機台數）",
    short: "東京大型扭蛋店排行",
    desc: `東京${D.tokyo.length}家知名扭蛋店依機台數排名：${T.known.slice(0, 3).map((x) => `${h.lmName(x)}（約${fmt(x.lm.machines)}台）`).join("、")}等，附區域、樓層、營業時間與車站連結。`,
    intro: `東京是全日本大型扭蛋店最多的地方。這裡把${D.tokyo.length}家知名扭蛋店依大約的機台數排名（沒有公開台數的排在最後）。台數與營業時間來自官方網站或大型媒體（${D.E.LANDMARKS_CHECKED}確認）。`,
    quick: `最大的是${h.lmName(T.top)}，約${fmt(T.top.lm.machines)}台（${T.top.st["zh-tw"]}）。${T.known[1] ? `其次是${h.lmName(T.known[1])}（約${fmt(T.known[1].lm.machines)}台）` : ""}${T.known[2] ? `和${h.lmName(T.known[2])}（約${fmt(T.known[2].lm.machines)}台）` : ""}。`,
    sections: [
      ["排行表", `${tokyoTable(D, h, { shop: "店家", area: "區域", machines: "機台數", floor: "樓層", hours: "營業時間", n: (k) => `約${fmt(k)}台`, unknown: "未公開" })}<p class="fine">機台數為大約數字，可能因改裝而變動。點區域可以看該車站周邊的所有扭蛋店。</p>`],
      ["前幾名一次看", h.cards(T.top5)],
      ["該去哪一區？", `<ul>
<li><b>池袋</b>：步行範圍內有3家大型扭蛋店，參考${h.a(`${h.H}guide/gashapon-department-store-ikebukuro.html`, "池袋攻略")}。</li>
${shi ? `<li><b>澀谷</b>：中心街的${h.lm(shi)}（約${fmt(shi.lm.machines)}台），離澀谷十字路口很近。</li>` : ""}
${aki ? `<li><b>秋葉原</b>：${h.lm(aki)}（約${fmt(aki.lm.machines)}台），電器街到處都有扭蛋區。</li>` : ""}
${shj ? `<li><b>新宿</b>：地下街的${h.lm(shj)}（約${fmt(shj.lm.machines)}台）。</li>` : ""}
</ul>${T.latest.length ? `<p>營業到最晚的是${T.latest.map((x) => h.lm(x)).join("、")}（到${T.lateTxt}）。</p>` : ""}`],
      ["出發前", `<p>準備好100日圓硬幣或使用換鈔機，先看${h.a(`${h.H}guide/how-to-play-gachapon.html`, "日本扭蛋怎麼玩")}。想找特定系列，請看${h.a(`${h.H}guide/check-gachapon-stock.html`, "日本扭蛋庫存查詢教學")}和${h.a(`${h.H}week.html`, "本週發售")}。</p>`],
    ],
    faq: [
      ["東京最大的扭蛋店是哪一家？", `${h.lmName(T.top)}，約有${fmt(T.top.lm.machines)}台。`],
      ...(aki ? [["秋葉原最大的扭蛋店是哪一家？", `${h.lmName(aki)}，約有${fmt(aki.lm.machines)}台。`]] : []),
      ...(shi ? [["澀谷最大的扭蛋店是哪一家？", `${h.lmName(shi)}，約有${fmt(shi.lm.machines)}台。`]] : []),
      ...(T.latest.length ? [["東京哪些扭蛋店開到比較晚？", `${T.latest.map((x) => h.lmName(x)).join("、")}營業到${T.lateTxt}。`]] : []),
      ["機台數是準確的嗎？", "不是。這是官方網站或大型媒體公布的大約數字，可能因改裝而變動。"],
    ],
  };
};
C["zh-cn"]["tokyo-gachapon-shops"] = (D, h) => {
  const T = tokyoNums(D); if (!T.top) return null;
  const aki = T.areaTop("akihabara"), shi = T.areaTop("shibuya"), shj = T.areaTop("shinjuku");
  return {
    title: "东京大型扭蛋店排行：按机台数排名",
    h1: "东京大型扭蛋店排行（按机台数）",
    short: "东京大型扭蛋店排行",
    desc: `东京${D.tokyo.length}家知名扭蛋店按机台数排名：${T.known.slice(0, 3).map((x) => `${h.lmName(x)}（约${fmt(x.lm.machines)}台）`).join("、")}等，附区域、楼层、营业时间和车站链接。`,
    intro: `东京是全日本大型扭蛋店最多的地方。这里把${D.tokyo.length}家知名扭蛋店按大约的机台数排名（没有公开台数的排在最后）。台数和营业时间来自官方网站或大型媒体（${D.E.LANDMARKS_CHECKED}确认）。`,
    quick: `最大的是${h.lmName(T.top)}，约${fmt(T.top.lm.machines)}台（${T.top.st["zh-cn"]}）。${T.known[1] ? `其次是${h.lmName(T.known[1])}（约${fmt(T.known[1].lm.machines)}台）` : ""}${T.known[2] ? `和${h.lmName(T.known[2])}（约${fmt(T.known[2].lm.machines)}台）` : ""}。`,
    sections: [
      ["排行表", `${tokyoTable(D, h, { shop: "店铺", area: "区域", machines: "机台数", floor: "楼层", hours: "营业时间", n: (k) => `约${fmt(k)}台`, unknown: "未公开" })}<p class="fine">机台数为大约数字，可能因改装而变动。点区域可以查看该车站周边的所有扭蛋店。</p>`],
      ["前几名一览", h.cards(T.top5)],
      ["该去哪个区域？", `<ul>
<li><b>池袋</b>：步行范围内有3家大型扭蛋店，参考${h.a(`${h.H}guide/gashapon-department-store-ikebukuro.html`, "池袋攻略")}。</li>
${shi ? `<li><b>涩谷</b>：中心街的${h.lm(shi)}（约${fmt(shi.lm.machines)}台），离涩谷十字路口很近。</li>` : ""}
${aki ? `<li><b>秋叶原</b>：${h.lm(aki)}（约${fmt(aki.lm.machines)}台），电器街到处都有扭蛋区。</li>` : ""}
${shj ? `<li><b>新宿</b>：地下街的${h.lm(shj)}（约${fmt(shj.lm.machines)}台）。</li>` : ""}
</ul>${T.latest.length ? `<p>营业到最晚的是${T.latest.map((x) => h.lm(x)).join("、")}（到${T.lateTxt}）。</p>` : ""}`],
      ["出发前", `<p>准备好100日元硬币或使用换币机，先看${h.a(`${h.H}guide/how-to-play-gachapon.html`, "日本扭蛋怎么玩")}。想找特定系列，请看${h.a(`${h.H}guide/check-gachapon-stock.html`, "日本扭蛋库存查询教程")}和${h.a(`${h.H}week.html`, "本周发售")}。</p>`],
    ],
    faq: [
      ["东京最大的扭蛋店是哪家？", `${h.lmName(T.top)}，约有${fmt(T.top.lm.machines)}台。`],
      ...(aki ? [["秋叶原最大的扭蛋店是哪家？", `${h.lmName(aki)}，约有${fmt(aki.lm.machines)}台。`]] : []),
      ...(shi ? [["涩谷最大的扭蛋店是哪家？", `${h.lmName(shi)}，约有${fmt(shi.lm.machines)}台。`]] : []),
      ...(T.latest.length ? [["东京哪些扭蛋店营业到比较晚？", `${T.latest.map((x) => h.lmName(x)).join("、")}营业到${T.lateTxt}。`]] : []),
      ["机台数准确吗？", "不完全准确。这是官方网站或大型媒体公布的大约数字，可能因改装而变动。"],
    ],
  };
};

/* ===== 4. 大阪 ===== */
const WALK_MAX = 1600; // これより遠い区間は地下鉄（御堂筋線）をすすめる
const OSAKA_SHORT = { umeda: { en: "Umeda", ko: "우메다", "zh-tw": "梅田", "zh-cn": "梅田" }, shinsaibashi: { en: "Shinsaibashi", ko: "신사이바시", "zh-tw": "心齋橋", "zh-cn": "心斋桥" }, namba: { en: "Namba", ko: "난바", "zh-tw": "難波", "zh-cn": "难波" }, tennoji: { en: "Tennoji (Abeno)", ko: "덴노지(아베노)", "zh-tw": "天王寺（阿倍野）", "zh-cn": "天王寺（阿倍野）" } };
const osk = (x, l) => (OSAKA_SHORT[x.st.slug] || {})[l] || x.st[l] || x.st.en;
C.en["osaka-gachapon-shops"] = (D, h) => {
  const S = D.osakaStops; if (!S.length) return null;
  const big = [...S].sort((a, b) => (b.lm.machines || 0) - (a.lm.machines || 0))[0];
  const nc = D.nambaClosing;
  return {
    title: "Osaka Gachapon Shops: Umeda, Namba, Shinsaibashi & Abeno (Walking Route)",
    h1: "Gachapon shops in Osaka: Umeda, Shinsaibashi, Namba & Abeno",
    short: "Osaka gachapon shops",
    desc: `Osaka's biggest gachapon shops in ${S.map((x) => osk(x, "en").replace(/ \(.*\)$/, "")).join(", ")} — ${big.lm.name_en}${big.lm.machines ? ` (~${fmt(big.lm.machines)} machines)` : ""} and more — with a route along the Midosuji Line.`,
    intro: "Osaka's big gacha shops sit along one subway line: the Midosuji Line runs north–south through Umeda, Shinsaibashi, Namba and Tennoji, so you can visit them all in one day. Here they are in order, with walking times and station links.",
    quick: `Biggest: ${big.lm.name_en}${big.lm.machines ? ` with about ${fmt(big.lm.machines)} machines` : ""} in ${osk(big, "en")}. Route: ${S.map((x) => osk(x, "en")).join(" → ")} along the Midosuji Line.${nc ? ` Note: ${nc.lm.name_en} closes after ${fmtYMD(nc.lm.closing, "en")}.` : ""}`,
    sections: [
      ["Shops by area", `${S.map((x) => `<h3 class="arr-h">${h.st(x.st.slug)}</h3>${h.cards([x])}`).join("")}
${nc && !S.some((x) => x.lm.id === nc.lm.id) ? `<h3 class="arr-h">${h.st(nc.st.slug)}</h3>${h.cards([nc])}` : ""}`],
      ["Suggested route (north to south)", `<ol>${S.map((x, i) => { const leg = D.osakaLegs[i - 1]; return `<li><b>${h.lm(x)}</b> (${h.st(x.st.slug)})${leg ? ` — ${leg.d <= WALK_MAX ? `about ${D.E.walkMin(leg.d)} min on foot from the previous shop (${D.E.fmtDist(leg.d)})` : `take the Midosuji Line from the previous stop (${D.E.fmtDist(leg.d)} apart)`}` : ""}${x.lm.hours ? `. Open ${h.esc(x.lm.hours)}` : ""}</li>`; }).join("")}</ol>
<p>Distances are straight-line. Want more stops? Try the ${h.a(`${h.R}gachakatsu.html`, "gacha route planner")} (in Japanese).</p>`],
      ...(nc ? [[`${nc.lm.name_en} is closing`, `<p>According to Bandai's official shop list, ${h.lm(nc)} (${h.esc(nc.lm.floor_en)}) will close after ${fmtYMD(nc.lm.closing, "en")}. ${D.nambaRest.length ? "Other gacha shops near Namba from Bandai's shop finder:" : ""}</p>${h.rows(D.nambaRest)}<p>${h.a(`${h.H}station/namba.html`, "All gacha shops near Namba →")}</p>`]] : []),
      ["Before you go", `<p>Read ${h.a(`${h.H}guide/how-to-play-gachapon.html`, "how to play gachapon")} (coins, change machines, tax-free), and check ${h.a(`${h.H}week.html`, "this week's releases")}. Flying out of Kansai? See ${h.a(`${h.H}guide/airport-gachapon.html`, "airport gachapon")}.</p>`],
    ],
    faq: [
      ["What is the biggest gachapon shop in Osaka?", `${big.lm.name_en}${big.lm.machines ? `, with about ${fmt(big.lm.machines)} machines` : ""} (${big.lm.floor_en}).`],
      ["Can I visit Osaka's gacha shops in one day?", `Yes. ${S.map((x) => osk(x, "en")).join(", ")} are all on the Midosuji subway line, so go north to south (or the reverse).`],
      ...(nc ? [[`Is ${nc.lm.name_en} closing?`, `Yes. According to Bandai's official shop list, its last day of business is ${fmtYMD(nc.lm.closing, "en")}.`]] : []),
      ...(S.find((x) => x.st.slug === "shinsaibashi") ? [["Which Osaka gacha shop is open late?", (() => { const x = [...S].sort((a, b) => (hClose(b.lm.hours) || 0) - (hClose(a.lm.hours) || 0))[0]; return `${x.lm.name_en} is open ${x.lm.hours}.`; })()]] : []),
    ],
  };
};
C.ko["osaka-gachapon-shops"] = (D, h) => {
  const S = D.osakaStops; if (!S.length) return null;
  const big = [...S].sort((a, b) => (b.lm.machines || 0) - (a.lm.machines || 0))[0];
  const nc = D.nambaClosing;
  const nm = (x) => osk(x, "ko");
  return {
    title: "오사카 가챠샵 총정리: 우메다·신사이바시·난바·아베노 동선",
    h1: "오사카 가챠샵: 우메다·신사이바시·난바·아베노",
    short: "오사카 가챠샵",
    desc: `오사카 지역별 대형 가챠샵 ${S.map((x) => `${h.lmName(x)}${x.lm.machines ? `(약 ${fmt(x.lm.machines)}대)` : ""}`).join(", ")}와 미도스지선 따라 북→남 추천 동선.`,
    intro: "오사카의 대형 가챠샵은 지하철 한 노선을 따라 있어요. 미도스지선이 우메다·신사이바시·난바·덴노지를 남북으로 지나기 때문에 하루에 다 돌 수 있어요. 순서대로 도보 시간과 역 링크를 정리했어요.",
    quick: `가장 큰 곳은 ${big.lm.machines ? `${h.lmName(big)}(약 ${fmt(big.lm.machines)}대)예요` : kj(h.lmName(big), "이에요", "예요")}. 동선은 미도스지선을 따라 ${S.map(nm).join(" → ")}.${nc ? ` 참고로 ${kj(h.lmName(nc), "은", "는")} ${fmtYMD(nc.lm.closing, "ko")} 영업을 끝으로 문을 닫아요.` : ""}`,
    sections: [
      ["지역별 가챠샵", `${S.map((x) => `<h3 class="arr-h">${h.st(x.st.slug)}</h3>${h.cards([x])}`).join("")}
${nc && !S.some((x) => x.lm.id === nc.lm.id) ? `<h3 class="arr-h">${h.st(nc.st.slug)}</h3>${h.cards([nc])}` : ""}`],
      ["추천 동선(북 → 남)", `<ol>${S.map((x, i) => { const leg = D.osakaLegs[i - 1]; return `<li><b>${h.lm(x)}</b>(${h.st(x.st.slug)})${leg ? ` — ${leg.d <= WALK_MAX ? `앞 가게에서 걸어서 약 ${D.E.walkMin(leg.d)}분(${D.E.fmtDist(leg.d)})` : `앞 가게에서 미도스지선으로 이동(직선 ${D.E.fmtDist(leg.d)})`}` : ""}${x.lm.hours ? `. 영업 ${h.esc(x.lm.hours)}` : ""}</li>`; }).join("")}</ol>
<p>거리는 직선거리예요. 더 많이 돌고 싶다면 ${h.a(`${h.R}gachakatsu.html`, "가챠 투어 루트")}(일본어)를 써 보세요.</p>`],
      ...(nc ? [[`${h.lmName(nc)} 폐점 예정`, `<p>반다이 공식 매장 목록에 따르면 ${h.esc(kj(h.lmName(nc), "은", "는"))} ${fmtYMD(nc.lm.closing, "ko")}이 마지막 영업일이에요. ${D.nambaRest.length ? "반다이 공식 매장 검색 기준 난바 근처의 다른 가챠샵:" : ""}</p>${h.rows(D.nambaRest)}<p>${h.a(`${h.H}station/namba.html`, "난바 주변 가챠샵 전체 보기 →")}</p>`]] : []),
      ["가기 전에", `<p>${h.a(`${h.H}guide/how-to-play-gachapon.html`, "일본 가챠 하는 법")}(동전·환전기·면세)과 ${h.a(`${h.H}week.html`, "이번 주 발매 가챠")}를 확인하세요. 간사이공항에서 출국한다면 ${h.a(`${h.H}guide/airport-gachapon.html`, "공항 가챠")}도 참고하세요.</p>`],
    ],
    faq: [
      ["오사카에서 가장 큰 가챠샵은 어디예요?", big.lm.machines ? `${kj(h.lmName(big), "으로")}, 약 ${fmt(big.lm.machines)}대가 있어요.` : `${kj(h.lmName(big), "이에요", "예요")}.`],
      ["오사카 가챠샵을 하루에 다 돌 수 있나요?", `네. ${S.map(nm).join("·")} 모두 지하철 미도스지선에 있어서 북쪽에서 남쪽(또는 반대)으로 돌면 돼요.`],
      ...(nc ? [[`${kj(h.lmName(nc), "이", "가")} 문을 닫나요?`, `네. 반다이 공식 매장 목록에 따르면 마지막 영업일은 ${fmtYMD(nc.lm.closing, "ko")}이에요.`]] : []),
      ...(S.find((x) => x.st.slug === "shinsaibashi") ? [["늦게까지 여는 오사카 가챠샵은요?", (() => { const x = [...S].sort((a, b) => (hClose(b.lm.hours) || 0) - (hClose(a.lm.hours) || 0))[0]; return `${kj(h.lmName(x), "은", "는")} ${x.lm.hours} 영업해요.`; })()]] : []),
    ],
  };
};
const osakaZh = (tw) => (D, h) => {
  const S = D.osakaStops; if (!S.length) return null;
  const big = [...S].sort((a, b) => (b.lm.machines || 0) - (a.lm.machines || 0))[0];
  const nc = D.nambaClosing, L = tw ? "zh-tw" : "zh-cn";
  const nm = (x) => osk(x, L);
  const z = (a, b) => (tw ? a : b);
  return {
    title: z("大阪扭蛋店攻略：梅田、心齋橋、難波、阿倍野逛店路線", "大阪扭蛋店攻略：梅田、心斋桥、难波、阿倍野逛店路线"),
    h1: z("大阪扭蛋店：梅田・心齋橋・難波・阿倍野", "大阪扭蛋店：梅田・心斋桥・难波・阿倍野"),
    short: z("大阪扭蛋店攻略", "大阪扭蛋店攻略"),
    desc: z(`大阪各區大型扭蛋店：${S.map((x) => `${h.lmName(x)}${x.lm.machines ? `（約${fmt(x.lm.machines)}台）` : ""}`).join("、")}，以及沿御堂筋線由北往南的逛店路線。`, `大阪各区大型扭蛋店：${S.map((x) => `${h.lmName(x)}${x.lm.machines ? `（约${fmt(x.lm.machines)}台）` : ""}`).join("、")}，以及沿御堂筋线由北往南的逛店路线。`),
    intro: z("大阪的大型扭蛋店都在同一條地鐵線上：御堂筋線南北貫穿梅田、心齋橋、難波、天王寺，一天就能全部逛完。以下依序整理步行時間和車站連結。", "大阪的大型扭蛋店都在同一条地铁线上：御堂筋线南北贯穿梅田、心斋桥、难波、天王寺，一天就能全部逛完。以下按顺序整理步行时间和车站链接。"),
    quick: z(`最大的是${h.lmName(big)}${big.lm.machines ? `（約${fmt(big.lm.machines)}台）` : ""}。路線：沿御堂筋線 ${S.map(nm).join(" → ")}。${nc ? `注意：${h.lmName(nc)}將在${fmtYMD(nc.lm.closing, L)}營業後結束營業。` : ""}`, `最大的是${h.lmName(big)}${big.lm.machines ? `（约${fmt(big.lm.machines)}台）` : ""}。路线：沿御堂筋线 ${S.map(nm).join(" → ")}。${nc ? `注意：${h.lmName(nc)}将在${fmtYMD(nc.lm.closing, L)}营业后闭店。` : ""}`),
    sections: [
      [z("各區扭蛋店", "各区扭蛋店"), `${S.map((x) => `<h3 class="arr-h">${h.st(x.st.slug)}</h3>${h.cards([x])}`).join("")}
${nc && !S.some((x) => x.lm.id === nc.lm.id) ? `<h3 class="arr-h">${h.st(nc.st.slug)}</h3>${h.cards([nc])}` : ""}`],
      [z("推薦路線（由北往南）", "推荐路线（由北往南）"), `<ol>${S.map((x, i) => { const leg = D.osakaLegs[i - 1]; return `<li><b>${h.lm(x)}</b>（${h.st(x.st.slug)}）${leg ? ` — ${leg.d <= WALK_MAX ? z(`從上一家步行約${D.E.walkMin(leg.d)}分鐘（${D.E.fmtDist(leg.d)}）`, `从上一家步行约${D.E.walkMin(leg.d)}分钟（${D.E.fmtDist(leg.d)}）`) : z(`從上一站搭御堂筋線（直線${D.E.fmtDist(leg.d)}）`, `从上一站坐御堂筋线（直线${D.E.fmtDist(leg.d)}）`)}` : ""}${x.lm.hours ? z(`。營業${h.esc(x.lm.hours)}`, `。营业${h.esc(x.lm.hours)}`) : ""}</li>`; }).join("")}</ol>
<p>${z("距離為直線距離。想多逛幾家可以用", "距离为直线距离。想多逛几家可以用")}${h.a(`${h.R}gachakatsu.html`, z("扭蛋巡店路線", "扭蛋巡店路线"))}${z("（日文）。", "（日文）。")}</p>`],
      ...(nc ? [[z(`${h.lmName(nc)}即將結束營業`, `${h.lmName(nc)}即将闭店`), `<p>${z(`根據萬代官方店鋪清單，${h.lm(nc)}的最後營業日是${fmtYMD(nc.lm.closing, L)}。${D.nambaRest.length ? "萬代官方店鋪搜尋中難波附近的其他扭蛋店：" : ""}`, `根据万代官方店铺清单，${h.lm(nc)}的最后营业日是${fmtYMD(nc.lm.closing, L)}。${D.nambaRest.length ? "万代官方店铺搜索中难波附近的其他扭蛋店：" : ""}`)}</p>${h.rows(D.nambaRest)}<p>${h.a(`${h.H}station/namba.html`, z("難波周邊所有扭蛋店 →", "难波周边所有扭蛋店 →"))}</p>`]] : []),
      [z("出發前", "出发前"), `<p>${z("先看", "先看")}${h.a(`${h.H}guide/how-to-play-gachapon.html`, z("日本扭蛋怎麼玩", "日本扭蛋怎么玩"))}${z("（硬幣、換鈔機、免稅），也看看", "（硬币、换币机、免税），也看看")}${h.a(`${h.H}week.html`, z("本週發售", "本周发售"))}${z("。從關西機場出境的話，請參考", "。从关西机场出境的话，请参考")}${h.a(`${h.H}guide/airport-gachapon.html`, z("機場扭蛋", "机场扭蛋"))}${z("。", "。")}</p>`],
    ],
    faq: [
      [z("大阪最大的扭蛋店是哪一家？", "大阪最大的扭蛋店是哪家？"), `${h.lmName(big)}${big.lm.machines ? z(`，約有${fmt(big.lm.machines)}台。`, `，约有${fmt(big.lm.machines)}台。`) : "。"}`],
      [z("大阪的扭蛋店一天逛得完嗎？", "大阪的扭蛋店一天逛得完吗？"), z(`可以。${S.map(nm).join("、")}都在地鐵御堂筋線上，由北往南（或反過來）逛就好。`, `可以。${S.map(nm).join("、")}都在地铁御堂筋线上，由北往南（或反过来）逛就好。`)],
      ...(nc ? [[z(`${h.lmName(nc)}要關了嗎？`, `${h.lmName(nc)}要关了吗？`), z(`是的。根據萬代官方店鋪清單，最後營業日是${fmtYMD(nc.lm.closing, L)}。`, `是的。根据万代官方店铺清单，最后营业日是${fmtYMD(nc.lm.closing, L)}。`)]] : []),
      ...(S.find((x) => x.st.slug === "shinsaibashi") ? [[z("大阪哪家扭蛋店開到比較晚？", "大阪哪家扭蛋店营业到比较晚？"), (() => { const x = [...S].sort((a, b) => (hClose(b.lm.hours) || 0) - (hClose(a.lm.hours) || 0))[0]; return z(`${h.lmName(x)}營業時間是${x.lm.hours}。`, `${h.lmName(x)}营业时间是${x.lm.hours}。`); })()]] : []),
    ],
  };
};
C["zh-tw"]["osaka-gachapon-shops"] = osakaZh(true);
C["zh-cn"]["osaka-gachapon-shops"] = osakaZh(false);

/* ===== 5. 空港 ===== */
const airNums = (D) => {
  const { air } = D;
  const kx0 = air.kix[0];
  return { kinds: kx0 ? ((kx0.lm.notes_en || "").match(/More than ([\d,]+) kinds/) || [])[1] || "" : "", hn: air.haneda[0] || null, kx: air.kix[0] || null, nr: air.narita.slice(0, 3), ct: air.chitose.slice(0, 3) };
};
const shortNm = (x) => x.lm.name_en.replace(/\s*\(.*\)$/, "");
const floorNoSec = (x) => String(x.lm.floor_en || "").replace(/\s*\(before security\)/i, "");
C.en["airport-gachapon"] = (D, h) => {
  const A = airNums(D); if (!A.hn && !A.kx) return null;
  const both = [A.hn, A.kx].filter(Boolean), allBefore = both.every((x) => D.before(x.lm));
  return {
    title: "Gachapon at Haneda, Kansai & Narita Airports",
    h1: "Airport gachapon: Haneda, Kansai & Narita",
    short: "Airport gachapon",
    desc: `Gacha at Japan's airports: ${[A.hn && `Haneda's ${A.hn.lm.name_en.replace(/\s*\(.*\)$/, "")}${A.hn.lm.machines ? ` (~${fmt(A.hn.lm.machines)} machines)` : ""}`, A.kx && `Kansai's ${A.kx.lm.name_en.replace(/\s*\(.*\)$/, "")}`, A.nr.length && "Narita"].filter(Boolean).join(", ")} — hours, security and leftover ¥100 coins.`,
    intro: "Leftover yen coins are hard to use once you're home — banks and exchange counters generally won't buy coins back. Airport gacha is the perfect last stop: a few ¥100 coins become a souvenir. Here is what's at each major airport, and whether it's before or after security.",
    quick: `${A.hn ? `Haneda: ${shortNm(A.hn)}, ${floorNoSec(A.hn)}, open ${A.hn.lm.hours}.` : ""} ${A.kx ? `Kansai: ${shortNm(A.kx)}, ${floorNoSec(A.kx)}, open ${A.kx.lm.hours}.` : ""}${allBefore ? ` ${both.length > 1 ? "Both are" : "It's"} before security, so go before you check in or right after you land.` : ""}`,
    sections: [
      ...(A.hn ? [["Haneda Airport (Tokyo)", `<p>${h.esc(h.lmShort(A.hn))} is in ${h.esc(floorNoSec(A.hn))}${A.hn.lm.machines ? ` with about ${fmt(A.hn.lm.machines)} machines` : ""}, open ${h.esc(A.hn.lm.hours)}. ${D.before(A.hn.lm) ? "It's landside (before security), so you can visit before check-in or after arrival — but not once you've passed security." : ""}</p>${h.cards([A.hn])}<p>${h.stMore("haneda-airport")}</p>`]] : []),
      ...(A.kx ? [["Kansai Airport (Osaka)", `<p>${h.esc(h.lmShort(A.kx))} is on ${h.esc(floorNoSec(A.kx))}, open ${h.esc(A.kx.lm.hours)}${A.kx.lm.notes_en ? ` — ${h.esc(A.kx.lm.notes_en.replace(/\.$/, "").replace(/^M/, "m"))}` : ""}. ${D.before(A.kx.lm) ? "It's before security, so play before you go through." : ""}</p>${h.cards([A.kx])}<p>${h.stMore("kansai-airport")}</p>`]] : []),
      ...(A.nr.length ? [["Narita Airport (Tokyo)", `<p>Bandai's official shop list includes a Gashapon corner at the JR Narita Airport Terminal 1 station, below Terminal 1. As it's in the train station, it's outside the security area — handy while you wait for your train.</p>${h.rows(A.nr, { noWalk: true })}<p>${h.stMore("narita-airport")}</p>`]] : []),
      ...(A.ct.length ? [["New Chitose Airport (Sapporo)", `<p>Bandai's official shop list includes a Gashapon Bandai Official Shop in the domestic terminal building.</p>${h.rows(A.ct, { noWalk: true })}<p>${h.stMore("new-chitose-airport")}</p>`]] : []),
      ["Spend your leftover coins", `<ul><li>Count your ¥100 coins before you head to the airport — most machines take ¥100 coins only.</li><li>Have ¥10s and ¥50s? Spend them at a convenience store first, and get ¥100 coins in change.</li><li>Gacha isn't tax-free, but at ¥300–¥500 a turn it's one of the cheapest souvenirs in Japan.</li><li>Capsules are bulky: open them and recycle the capsule in the shop's bin before packing.</li></ul>`],
    ],
    faq: [
      ...(A.hn ? [["Is there gachapon at Haneda Airport?", `Yes. ${shortNm(A.hn)} is in ${floorNoSec(A.hn)} (before security)${A.hn.lm.machines ? `, with about ${fmt(A.hn.lm.machines)} machines` : ""}, open ${A.hn.lm.hours}.`]] : []),
      ...(A.kx ? [["Is there gachapon at Kansai Airport?", `Yes. ${shortNm(A.kx)} is on ${floorNoSec(A.kx)} (before security), open ${A.kx.lm.hours}.`]] : []),
      ["Is airport gacha before or after security?", `${[A.hn && D.before(A.hn.lm) && "Haneda's GACHA WORLD", A.kx && D.before(A.kx.lm) && "Kansai's GACHA MATSURI"].filter(Boolean).join(" and ")} ${[A.hn, A.kx].filter(Boolean).length > 1 ? "are" : "is"} before security, so visit before you go through.`],
      ...(A.nr.length ? [["Is there gachapon at Narita Airport?", "Bandai's official shop list includes a Gashapon corner at JR Narita Airport Terminal 1 station, outside the security area."]] : []),
      ["Can I exchange leftover yen coins back home?", "Banks and currency exchange counters generally don't accept coins, so spending ¥100 coins on gacha before you leave is a good idea."],
    ],
  };
};
C.ko["airport-gachapon"] = (D, h) => {
  const A = airNums(D); if (!A.hn && !A.kx) return null;
  return {
    title: "일본 공항 가챠: 하네다·간사이·나리타에서 남은 동전 쓰기",
    h1: "일본 공항 가챠: 하네다·간사이·나리타",
    short: "공항 가챠",
    desc: `일본 공항의 가챠샵: ${[A.hn && `${h.lmShort(A.hn)}${A.hn.lm.machines ? `(약 ${fmt(A.hn.lm.machines)}대)` : ""}`, A.kx && h.lmShort(A.kx)].filter(Boolean).join(", ")}, 나리타까지. 영업시간, 보안검색 전/후, 남은 100엔 동전 쓰는 법.`,
    intro: "남은 엔화 동전은 한국에 돌아가면 쓰기 어려워요. 은행이나 환전소는 보통 동전을 바꿔 주지 않거든요. 그래서 공항 가챠는 여행의 마지막 코스로 딱이에요. 100엔 동전 몇 개가 기념품이 돼요. 공항별 가챠샵과 보안검색 전인지 후인지 정리했어요.",
    quick: `${A.hn ? `하네다: ${h.lmShort(A.hn)}, 제3터미널 5층 TOKYO POPTOWN, ${A.hn.lm.hours}.` : ""} ${A.kx ? `간사이: ${h.lmShort(A.kx)}, 제1터미널 4층, ${A.kx.lm.hours}.` : ""} 둘 다 보안검색 전이라 체크인 전이나 도착 직후에 가야 해요.`,
    sections: [
      ...(A.hn ? [["하네다공항(도쿄)", `<p>${h.esc(h.lmShort(A.hn))}는 제3터미널 5층 TOKYO POPTOWN에 있어요${A.hn.lm.machines ? `(약 ${fmt(A.hn.lm.machines)}대)` : ""}. 영업 ${h.esc(A.hn.lm.hours)}. ${D.before(A.hn.lm) ? "보안검색 전 구역이라 체크인 전이나 도착 후에 들를 수 있지만, 보안검색을 통과한 뒤에는 갈 수 없어요." : ""}</p>${h.cards([A.hn])}<p>${h.stMore("haneda-airport")}</p>`]] : []),
      ...(A.kx ? [["간사이공항(오사카)", `<p>${h.esc(h.lmShort(A.kx))}는 제1터미널 4층에 있어요. 영업 ${h.esc(A.kx.lm.hours)}${A.kinds ? `, ${A.kinds}종 이상의 캡슐토이가 있어요` : ""}. ${D.before(A.kx.lm) ? "보안검색 전이라 출국 수속 전에 하세요." : ""}</p>${h.cards([A.kx])}<p>${h.stMore("kansai-airport")}</p>`]] : []),
      ...(A.nr.length ? [["나리타공항(도쿄)", `<p>반다이 공식 매장 목록에 제1터미널 지하의 JR 나리타공항 제1터미널역 가샤폰 코너가 있어요. 기차역 안이라 보안검색 구역 밖이고, 열차를 기다리는 동안 들르기 좋아요.</p>${h.rows(A.nr, { noWalk: true })}<p>${h.stMore("narita-airport")}</p>`]] : []),
      ...(A.ct.length ? [["신치토세공항(삿포로)", `<p>반다이 공식 매장 목록에 국내선 터미널 빌딩의 가샤폰 반다이 오피셜숍이 있어요.</p>${h.rows(A.ct, { noWalk: true })}<p>${h.stMore("new-chitose-airport")}</p>`]] : []),
      ["남은 동전 다 쓰는 팁", `<ul><li>공항에 가기 전에 100엔 동전이 몇 개 있는지 세어 두세요. 대부분 100엔 동전만 돼요.</li><li>10엔·50엔 동전이 많다면 편의점에서 먼저 쓰고, 거스름돈을 100엔 동전으로 받으세요.</li><li>가챠는 면세가 안 되지만 1회 300~500엔이라 가장 저렴한 기념품 중 하나예요.</li><li>캡슐은 부피가 커요. 가게에서 열고 빈 캡슐은 회수함에 넣은 뒤 짐을 싸세요.</li></ul>`],
    ],
    faq: [
      ...(A.hn ? [["하네다공항에 가챠가 있나요?", `네. ${h.lmShort(A.hn)}가 제3터미널 5층 TOKYO POPTOWN에 있어요${A.hn.lm.machines ? `(약 ${fmt(A.hn.lm.machines)}대)` : ""}. 영업 ${A.hn.lm.hours}.`]] : []),
      ...(A.kx ? [["간사이공항에 가챠가 있나요?", `네. ${h.lmShort(A.kx)}가 제1터미널 4층에 있어요. 영업 ${A.kx.lm.hours}.`]] : []),
      ["공항 가챠는 보안검색 전인가요, 후인가요?", "하네다의 GACHA WORLD와 간사이의 GACHA MATSURI는 보안검색 전이에요. 출국 수속 전에 들르세요."],
      ...(A.nr.length ? [["나리타공항에도 가챠가 있나요?", "반다이 공식 매장 목록에 JR 나리타공항 제1터미널역의 가샤폰 코너가 있어요. 보안검색 구역 밖이에요."]] : []),
      ["남은 엔화 동전은 한국에서 환전할 수 있나요?", "은행이나 환전소는 보통 동전을 받지 않아요. 출국 전에 가챠로 100엔 동전을 쓰는 게 좋아요."],
    ],
  };
};
const airZh = (tw) => (D, h) => {
  const A = airNums(D); if (!A.hn && !A.kx) return null;
  const z = (a, b) => (tw ? a : b);
  return {
    title: z("日本機場扭蛋：羽田、關西、成田，把剩下的硬幣花掉", "日本机场扭蛋：羽田、关西、成田，把剩下的硬币花掉"),
    h1: z("日本機場扭蛋：羽田・關西・成田", "日本机场扭蛋：羽田・关西・成田"),
    short: z("機場扭蛋", "机场扭蛋"),
    desc: z(`日本機場的扭蛋店：${[A.hn && `${h.lmShort(A.hn)}${A.hn.lm.machines ? `（約${fmt(A.hn.lm.machines)}台）` : ""}`, A.kx && h.lmShort(A.kx)].filter(Boolean).join("、")}，還有成田。營業時間、安檢前後，以及剩下的100日圓硬幣怎麼用。`, `日本机场的扭蛋店：${[A.hn && `${h.lmShort(A.hn)}${A.hn.lm.machines ? `（约${fmt(A.hn.lm.machines)}台）` : ""}`, A.kx && h.lmShort(A.kx)].filter(Boolean).join("、")}，还有成田。营业时间、安检前后，以及剩下的100日元硬币怎么用。`),
    intro: z("剩下的日圓硬幣回國後很難用，銀行和外幣兌換處通常不收硬幣。機場扭蛋正好是旅程的最後一站，幾枚100日圓硬幣就能變成紀念品。以下整理各大機場的扭蛋店，以及在安檢前還是安檢後。", "剩下的日元硬币回国后很难用，银行和外币兑换处通常不收硬币。机场扭蛋正好是旅程的最后一站，几枚100日元硬币就能变成纪念品。以下整理各大机场的扭蛋店，以及在安检前还是安检后。"),
    quick: z(`${A.hn ? `羽田：${h.lmShort(A.hn)}，第3航廈5F TOKYO POPTOWN，${A.hn.lm.hours}。` : ""}${A.kx ? `關西：${h.lmShort(A.kx)}，第1航廈4F，${A.kx.lm.hours}。` : ""}兩家都在安檢前，請在報到前或剛抵達時去。`, `${A.hn ? `羽田：${h.lmShort(A.hn)}，第3航站楼5F TOKYO POPTOWN，${A.hn.lm.hours}。` : ""}${A.kx ? `关西：${h.lmShort(A.kx)}，第1航站楼4F，${A.kx.lm.hours}。` : ""}两家都在安检前，请在值机前或刚到达时去。`),
    sections: [
      ...(A.hn ? [[z("羽田機場（東京）", "羽田机场（东京）"), `<p>${h.esc(h.lmShort(A.hn))}${z(`在第3航廈5F的TOKYO POPTOWN${A.hn.lm.machines ? `，約${fmt(A.hn.lm.machines)}台` : ""}，營業${h.esc(A.hn.lm.hours)}。${D.before(A.hn.lm) ? "位於安檢前的區域，報到前或抵達後都能去，但過了安檢就去不了。" : ""}`, `在第3航站楼5F的TOKYO POPTOWN${A.hn.lm.machines ? `，约${fmt(A.hn.lm.machines)}台` : ""}，营业${h.esc(A.hn.lm.hours)}。${D.before(A.hn.lm) ? "位于安检前的区域，值机前或到达后都能去，但过了安检就去不了。" : ""}`)}</p>${h.cards([A.hn])}<p>${h.stMore("haneda-airport")}</p>`]] : []),
      ...(A.kx ? [[z("關西機場（大阪）", "关西机场（大阪）"), `<p>${h.esc(h.lmShort(A.kx))}${z(`在第1航廈4F，營業${h.esc(A.kx.lm.hours)}${A.kinds ? `，有${A.kinds}種以上的扭蛋` : ""}。${D.before(A.kx.lm) ? "在安檢前，請在出境前玩。" : ""}`, `在第1航站楼4F，营业${h.esc(A.kx.lm.hours)}${A.kinds ? `，有${A.kinds}种以上的扭蛋` : ""}。${D.before(A.kx.lm) ? "在安检前，请在出境前玩。" : ""}`)}</p>${h.cards([A.kx])}<p>${h.stMore("kansai-airport")}</p>`]] : []),
      ...(A.nr.length ? [[z("成田機場（東京）", "成田机场（东京）"), `<p>${z("萬代官方店鋪清單中，有位於第1航廈地下的JR成田機場第1航廈站扭蛋區。因為在車站內，所以在安檢區外，等電車時可以順便玩。", "万代官方店铺清单中，有位于第1航站楼地下的JR成田机场第1航站楼站扭蛋区。因为在车站内，所以在安检区外，等电车时可以顺便玩。")}</p>${h.rows(A.nr, { noWalk: true })}<p>${h.stMore("narita-airport")}</p>`]] : []),
      ...(A.ct.length ? [[z("新千歲機場（札幌）", "新千岁机场（札幌）"), `<p>${z("萬代官方店鋪清單中，國內線航廈大樓內有萬代扭蛋官方店。", "万代官方店铺清单中，国内线航站楼内有万代扭蛋官方店。")}</p>${h.rows(A.ct, { noWalk: true })}<p>${h.stMore("new-chitose-airport")}</p>`]] : []),
      [z("把剩下的硬幣花掉", "把剩下的硬币花掉"), z(`<ul><li>去機場前先數一下有幾枚100日圓硬幣，大多數機器只收100日圓硬幣。</li><li>10日圓、50日圓硬幣比較多的話，先在便利商店花掉，找零時拿100日圓硬幣。</li><li>扭蛋不能免稅，但一次300～500日圓，是日本最便宜的紀念品之一。</li><li>扭蛋殼很佔空間，可以在店裡打開，把空殼丟進回收箱再打包。</li></ul>`, `<ul><li>去机场前先数一下有几枚100日元硬币，大多数机器只收100日元硬币。</li><li>10日元、50日元硬币比较多的话，先在便利店花掉，找零时拿100日元硬币。</li><li>扭蛋不能免税，但一次300～500日元，是日本最便宜的纪念品之一。</li><li>扭蛋壳很占空间，可以在店里打开，把空壳放进回收箱再打包。</li></ul>`)],
    ],
    faq: [
      ...(A.hn ? [[z("羽田機場有扭蛋嗎？", "羽田机场有扭蛋吗？"), z(`有。${h.lmShort(A.hn)}在第3航廈5F TOKYO POPTOWN${A.hn.lm.machines ? `，約${fmt(A.hn.lm.machines)}台` : ""}，營業${A.hn.lm.hours}。`, `有。${h.lmShort(A.hn)}在第3航站楼5F TOKYO POPTOWN${A.hn.lm.machines ? `，约${fmt(A.hn.lm.machines)}台` : ""}，营业${A.hn.lm.hours}。`)]] : []),
      ...(A.kx ? [[z("關西機場有扭蛋嗎？", "关西机场有扭蛋吗？"), z(`有。${h.lmShort(A.kx)}在第1航廈4F，營業${A.kx.lm.hours}。`, `有。${h.lmShort(A.kx)}在第1航站楼4F，营业${A.kx.lm.hours}。`)]] : []),
      [z("機場扭蛋在安檢前還是安檢後？", "机场扭蛋在安检前还是安检后？"), z("羽田的GACHA WORLD和關西的GACHA MATSURI都在安檢前，請在出境前去。", "羽田的GACHA WORLD和关西的GACHA MATSURI都在安检前，请在出境前去。")],
      ...(A.nr.length ? [[z("成田機場有扭蛋嗎？", "成田机场有扭蛋吗？"), z("萬代官方店鋪清單中有JR成田機場第1航廈站的扭蛋區，在安檢區外。", "万代官方店铺清单中有JR成田机场第1航站楼站的扭蛋区，在安检区外。")]] : []),
      [z("剩下的日圓硬幣回國可以換嗎？", "剩下的日元硬币回国可以换吗？"), z("銀行和外幣兌換處通常不收硬幣，出境前用扭蛋把100日圓硬幣花掉是好方法。", "银行和外币兑换处通常不收硬币，出境前用扭蛋把100日元硬币花掉是个好办法。")],
    ],
  };
};
C["zh-tw"]["airport-gachapon"] = airZh(true);
C["zh-cn"]["airport-gachapon"] = airZh(false);

/* ===== 6. 福岡 ===== */
const fukNums = (D) => {
  const F = D.fuk, cn = F.canal; if (!cn || !F.hakata) return null;
  const over = ((cn.lm.notes_en || "").match(/over ([\d,]+) machines/) || [])[1] || "";
  return { over, F, cn, wH: D.E.walkMin(cn.d), wT: F.canalFromTenjin != null ? D.E.walkMin(F.canalFromTenjin) : null, busN: F.busTerm.length, nAll: F.hakataRows.length + F.tenjinRows.length + 1 };
};
C.en["fukuoka-gachapon"] = (D, h) => {
  const N = fukNums(D); if (!N) return null; const { F, cn } = N;
  return {
    title: "Fukuoka Gachapon Guide: Canal City Hakata & Shops near Hakata and Tenjin",
    h1: "Gachapon in Fukuoka: Canal City Hakata, Hakata & Tenjin",
    short: "Fukuoka gachapon",
    desc: `Gachapon in Fukuoka: the official shop at Canal City Hakata (~${fmt(cn.lm.machines)} machines, ${cn.lm.hours}) plus ${N.nAll - 1} more gacha shops near Hakata and Tenjin, with walking times.`,
    intro: `Fukuoka packs a lot of gacha into a small area. The headline shop is the Gashapon Bandai Official Shop at Canal City Hakata, between Hakata and Tenjin, and Bandai's official shop list has ${N.nAll - 1} more gacha shops within walking distance of the two stations.`,
    quick: `${cn.lm.name_en}: ${cn.lm.floor_en}, open ${cn.lm.hours}, about ${fmt(cn.lm.machines)} machines — ${cn.lm.notes_en ? cn.lm.notes_en.replace(/^W/, "w").replace(/\.$/, "") : ""}. About ${N.wH} min on foot from Hakata Station${N.wT ? ` or ${N.wT} min from Tenjin` : ""}.`,
    sections: [
      ["Canal City Hakata", `<p>${h.lm(cn)} is on ${h.esc(cn.lm.floor_en)}, open ${h.esc(cn.lm.hours)}, with about ${fmt(cn.lm.machines)} machines. ${cn.lm.notes_en ? h.esc(cn.lm.notes_en) : ""} It's about ${N.wH} min on foot from Hakata Station (${D.E.fmtDist(cn.d)} straight-line)${N.wT ? ` and about ${N.wT} min from Tenjin` : ""}, so it fits nicely between the two.</p>${h.cards([cn])}`],
      ["Gacha shops near Hakata Station", `<p>${N.busN >= 2 ? `Hakata Bus Terminal, right next to the station, has ${N.busN} gacha shops on 7F. ` : ""}From Bandai's official shop list:</p>${h.rows(F.hakataRows)}<p>${h.stMore("hakata")}</p>`],
      ["Gacha shops near Tenjin", `<p>Tenjin is Fukuoka's shopping district; these official gacha shops are within walking distance of Tenjin Station:</p>${h.rows(F.tenjinRows)}<p>${h.stMore("tenjin")}</p>`],
      ["A simple plan", `<ol><li>Start at Hakata Station (${N.busN >= 2 ? "Hakata Bus Terminal 7F" : "the shops around the station"}).</li><li>Walk about ${N.wH} min to Canal City Hakata.</li>${N.wT ? `<li>Continue about ${N.wT} min to Tenjin for the shops around Nishi-dori and PARCO.</li>` : ""}</ol><p>Read ${h.a(`${h.H}guide/how-to-play-gachapon.html`, "how to play gachapon")} and see ${h.a(`${h.H}week.html`, "this week's releases")} before you go.</p>`],
    ],
    faq: [
      ["Where is the gachapon shop in Canal City Hakata?", `${cn.lm.floor_en}. Open ${cn.lm.hours}.`],
      ["How many gacha machines are at Canal City Hakata?", `About ${fmt(cn.lm.machines)} at the Gashapon Bandai Official Shop. ${cn.lm.notes_en || ""}`.trim()],
      ["How far is Canal City from Hakata Station?", `About ${N.wH} min on foot (${D.E.fmtDist(cn.d)} straight-line).`],
      ["Are there gacha shops near Tenjin?", `Yes. Bandai's official shop list has ${F.tenjinRows.length} near Tenjin Station, including the official shop in Fukuoka PARCO.`],
    ],
  };
};
C.ko["fukuoka-gachapon"] = (D, h) => {
  const N = fukNums(D); if (!N) return null; const { F, cn } = N;
  return {
    title: "후쿠오카 가챠 성지: 캐널시티 가샤폰 공식숍 & 하카타·텐진 가챠샵 총정리",
    h1: "후쿠오카 가챠 성지: 캐널시티 가샤폰과 하카타·텐진 가챠샵",
    short: "후쿠오카 가챠 성지",
    desc: `후쿠오카 가챠 여행 필수 코스! 캐널시티 하카타 가샤폰 반다이 오피셜숍(약 ${fmt(cn.lm.machines)}대, ${cn.lm.hours})과 하카타역·텐진역 근처 가챠샵 ${N.nAll - 1}곳을 도보 시간과 함께 정리했어요.`,
    intro: `후쿠오카는 가까워서 주말 여행으로도 많이 가는 곳이죠. 가챠를 좋아한다면 꼭 들러야 할 곳이 캐널시티 하카타의 가샤폰 반다이 오피셜숍이에요. 하카타와 텐진 사이에 있어서 동선 짜기도 편하고, 반다이 공식 매장 목록 기준으로 두 역 근처에 걸어서 갈 수 있는 가챠샵이 ${N.nAll - 1}곳 더 있어요.`,
    quick: `캐널시티 하카타 사우스빌딩(OPA) 지하 1층, 영업 ${cn.lm.hours}, 약 ${fmt(cn.lm.machines)}대.${N.over ? ` 바로 옆 가샤폰 백화점까지 합치면 ${N.over}대가 넘어요.` : ""} 하카타역에서 걸어서 약 ${N.wH}분${N.wT ? `, 텐진에서 약 ${N.wT}분` : ""}이에요.`,
    sections: [
      ["캐널시티 하카타 가샤폰", `<p>${h.lm(cn)}은 캐널시티 하카타 사우스빌딩(OPA) 지하 1층에 있어요. 영업 ${h.esc(cn.lm.hours)}, 약 ${fmt(cn.lm.machines)}대예요.${N.over ? ` 붙어 있는 가샤폰 백화점까지 합치면 ${N.over}대가 넘는 가챠가 한곳에 모여 있어요.` : ""} 하카타역에서 걸어서 약 ${N.wH}분(직선 ${D.E.fmtDist(cn.d)})${N.wT ? `, 텐진에서도 약 ${N.wT}분` : ""}이라 두 지역 사이에 들르기 좋아요.</p>${h.cards([cn])}`],
      ["하카타역 근처 가챠샵", `<p>${N.busN >= 2 ? `역 바로 옆 하카타 버스터미널 7층에는 가챠샵이 ${N.busN}곳이나 있어요. ` : ""}반다이 공식 매장 목록 기준이에요.</p>${h.rows(F.hakataRows)}<p>${h.stMore("hakata")}</p>`],
      ["텐진 근처 가챠샵", `<p>쇼핑하러 많이 가는 텐진에도 걸어서 갈 수 있는 공식 가챠샵이 있어요.</p>${h.rows(F.tenjinRows)}<p>${h.stMore("tenjin")}</p>`],
      ["추천 동선", `<ol><li>하카타역에서 시작(${N.busN >= 2 ? "하카타 버스터미널 7층" : "역 주변 가챠샵"}).</li><li>캐널시티 하카타까지 걸어서 약 ${N.wH}분.</li>${N.wT ? `<li>텐진까지 약 ${N.wT}분 더 걸어서 니시도리·파르코 주변 가챠샵으로.</li>` : ""}</ol><p>가기 전에 ${h.a(`${h.H}guide/how-to-play-gachapon.html`, "일본 가챠 하는 법")}과 ${h.a(`${h.H}week.html`, "이번 주 발매 가챠")}도 확인해 보세요.</p>`],
    ],
    faq: [
      ["캐널시티 하카타 가샤폰은 어디에 있어요?", `캐널시티 하카타 사우스빌딩(OPA) 지하 1층이에요. 영업 ${cn.lm.hours}.`],
      ["캐널시티 가샤폰은 몇 대 있어요?", `가샤폰 반다이 오피셜숍에 약 ${fmt(cn.lm.machines)}대가 있어요.${N.over ? ` 옆의 가샤폰 백화점까지 합치면 ${N.over}대가 넘어요.` : ""}`],
      ["하카타역에서 캐널시티까지 얼마나 걸려요?", `걸어서 약 ${N.wH}분(직선 ${D.E.fmtDist(cn.d)})이에요.`],
      ["텐진에도 가챠샵이 있나요?", `네. 반다이 공식 매장 목록 기준으로 텐진역 근처에 ${F.tenjinRows.length}곳이 있고, 후쿠오카 파르코의 공식숍도 그중 하나예요.`],
      ["후쿠오카 가챠도 면세 되나요?", "안 돼요. 가챠는 무인 기계에서 사는 방식이라 면세 절차가 없어요. 100엔 동전을 넉넉히 챙기세요."],
    ],
  };
};
const fukZh = (tw) => (D, h) => {
  const N = fukNums(D); if (!N) return null; const { F, cn } = N;
  const z = (a, b) => (tw ? a : b);
  return {
    title: z("福岡扭蛋攻略：博多運河城與博多・天神扭蛋店", "福冈扭蛋攻略：博多运河城与博多・天神扭蛋店"),
    h1: z("福岡扭蛋：博多運河城、博多與天神", "福冈扭蛋：博多运河城、博多与天神"),
    short: z("福岡扭蛋攻略", "福冈扭蛋攻略"),
    desc: z(`福岡扭蛋：博多運河城的萬代扭蛋官方店（約${fmt(cn.lm.machines)}台、${cn.lm.hours}），以及博多站、天神站附近${N.nAll - 1}家扭蛋店與步行時間。`, `福冈扭蛋：博多运河城的万代扭蛋官方店（约${fmt(cn.lm.machines)}台、${cn.lm.hours}），以及博多站、天神站附近${N.nAll - 1}家扭蛋店和步行时间。`),
    intro: z(`福岡在不大的範圍裡就有很多扭蛋店。最有名的是位於博多和天神之間的博多運河城萬代扭蛋官方店，根據萬代官方店鋪清單，兩個車站步行範圍內還有${N.nAll - 1}家扭蛋店。`, `福冈在不大的范围里就有很多扭蛋店。最有名的是位于博多和天神之间的博多运河城万代扭蛋官方店，根据万代官方店铺清单，两个车站步行范围内还有${N.nAll - 1}家扭蛋店。`),
    quick: z(`博多運河城南館（OPA）B1F，營業${cn.lm.hours}，約${fmt(cn.lm.machines)}台${N.over ? `；加上旁邊的扭蛋百貨共超過${N.over}台` : ""}。從博多站步行約${N.wH}分鐘${N.wT ? `，從天神約${N.wT}分鐘` : ""}。`, `博多运河城南馆（OPA）B1F，营业${cn.lm.hours}，约${fmt(cn.lm.machines)}台${N.over ? `；加上旁边的扭蛋百货共超过${N.over}台` : ""}。从博多站步行约${N.wH}分钟${N.wT ? `，从天神约${N.wT}分钟` : ""}。`),
    sections: [
      [z("博多運河城", "博多运河城"), `<p>${h.lm(cn)}${z(`在博多運河城南館（OPA）B1F，營業${h.esc(cn.lm.hours)}，約${fmt(cn.lm.machines)}台${N.over ? `，加上相連的扭蛋百貨共超過${N.over}台` : ""}。從博多站步行約${N.wH}分鐘（直線${D.E.fmtDist(cn.d)}）${N.wT ? `，從天神約${N.wT}分鐘` : ""}，剛好在兩地之間。`, `在博多运河城南馆（OPA）B1F，营业${h.esc(cn.lm.hours)}，约${fmt(cn.lm.machines)}台${N.over ? `，加上相连的扭蛋百货共超过${N.over}台` : ""}。从博多站步行约${N.wH}分钟（直线${D.E.fmtDist(cn.d)}）${N.wT ? `，从天神约${N.wT}分钟` : ""}，正好在两地之间。`)}</p>${h.cards([cn])}`],
      [z("博多站附近的扭蛋店", "博多站附近的扭蛋店"), `<p>${N.busN >= 2 ? z(`車站旁的博多巴士總站7F就有${N.busN}家扭蛋店。`, `车站旁的博多巴士总站7F就有${N.busN}家扭蛋店。`) : ""}${z("以下來自萬代官方店鋪清單：", "以下来自万代官方店铺清单：")}</p>${h.rows(F.hakataRows)}<p>${h.stMore("hakata")}</p>`],
      [z("天神附近的扭蛋店", "天神附近的扭蛋店"), `<p>${z("天神是福岡的購物區，步行就能到的官方扭蛋店：", "天神是福冈的购物区，步行就能到的官方扭蛋店：")}</p>${h.rows(F.tenjinRows)}<p>${h.stMore("tenjin")}</p>`],
      [z("簡單路線", "简单路线"), `<ol><li>${z(`從博多站出發（${N.busN >= 2 ? "博多巴士總站7F" : "車站周邊扭蛋店"}）。`, `从博多站出发（${N.busN >= 2 ? "博多巴士总站7F" : "车站周边扭蛋店"}）。`)}</li><li>${z(`步行約${N.wH}分鐘到博多運河城。`, `步行约${N.wH}分钟到博多运河城。`)}</li>${N.wT ? `<li>${z(`再走約${N.wT}分鐘到天神，逛西通、PARCO一帶的扭蛋店。`, `再走约${N.wT}分钟到天神，逛西通、PARCO一带的扭蛋店。`)}</li>` : ""}</ol><p>${z("出發前看看", "出发前看看")}${h.a(`${h.H}guide/how-to-play-gachapon.html`, z("日本扭蛋怎麼玩", "日本扭蛋怎么玩"))}${z("和", "和")}${h.a(`${h.H}week.html`, z("本週發售", "本周发售"))}${z("。", "。")}</p>`],
    ],
    faq: [
      [z("博多運河城的扭蛋店在哪裡？", "博多运河城的扭蛋店在哪里？"), z(`在博多運河城南館（OPA）B1F，營業${cn.lm.hours}。`, `在博多运河城南馆（OPA）B1F，营业${cn.lm.hours}。`)],
      [z("博多運河城有幾台扭蛋機？", "博多运河城有多少台扭蛋机？"), z(`萬代扭蛋官方店約${fmt(cn.lm.machines)}台${N.over ? `，加上旁邊的扭蛋百貨共超過${N.over}台` : ""}。`, `万代扭蛋官方店约${fmt(cn.lm.machines)}台${N.over ? `，加上旁边的扭蛋百货共超过${N.over}台` : ""}。`)],
      [z("從博多站到運河城要多久？", "从博多站到运河城要多久？"), z(`步行約${N.wH}分鐘（直線${D.E.fmtDist(cn.d)}）。`, `步行约${N.wH}分钟（直线${D.E.fmtDist(cn.d)}）。`)],
      [z("天神也有扭蛋店嗎？", "天神也有扭蛋店吗？"), z(`有。萬代官方店鋪清單中天神站附近有${F.tenjinRows.length}家，包括福岡PARCO的官方店。`, `有。万代官方店铺清单中天神站附近有${F.tenjinRows.length}家，包括福冈PARCO的官方店。`)],
    ],
  };
};
C["zh-tw"]["fukuoka-gachapon"] = fukZh(true);
C["zh-cn"]["fukuoka-gachapon"] = fukZh(false);

/* ===== 7. 在庫の調べ方 ===== */
const BANDAI_FINDER = "https://gashapon.jp/shop/";
const TTA_SITE = "https://www.takaratomy-arts.co.jp/";
C.en["check-gachapon-stock"] = (D, h) => {
  const it = D.popular;
  return {
    title: "How to Check Gachapon Stock Before You Go (Official Finders & Shop Lists)",
    h1: "How to check gachapon stock before you go",
    short: "How to check gachapon stock",
    desc: "Find a specific gachapon in Japan: Bandai's official shop finder (Gashapon doko?), Takara Tomy A.R.T.S's site, and our shop lists by item and by station.",
    intro: "Popular gacha series can sell out within days of release, and every shop stocks a different mix. Before you cross Tokyo for one series, spend two minutes checking where it is. Here's how — no Japanese needed.",
    quick: "For Bandai gacha, open the series on Bandai's official site (gashapon.jp) and use its shop finder, \"Gashapon doko?\". On this site, every item page lists shops in Japan that carry it, and every station page lists the gacha shops nearby. Stock changes fast, so treat any list as a guide, not a guarantee.",
    sections: [
      ["1. Bandai's official shop finder (Gashapon doko?)", `<p>Bandai, the maker of Gashapon, runs an official shop finder called ガシャポンどこ？ (\"Where's Gashapon?\"). From a series page on ${h.a("https://gashapon.jp/", "gashapon.jp", true)}, follow the shop search link to see the shops registered to carry that series, sorted by prefecture. You can also search shops directly on ${h.a(BANDAI_FINDER, "the shop finder", true)}. The site is in Japanese, but your browser's translate feature works fine.</p><p>It's a list of shops that carry the series, not a live count of capsules left, so a hit series can still be sold out.</p>`],
      ["2. Takara Tomy A.R.T.S", `<p>Takara Tomy A.R.T.S, the other big gacha maker, has a page for each series on ${h.a(TTA_SITE, "its official site", true)} with the release month, price and designs. Use it to confirm the details of a series; for finding one, large capsule-toy shops that stock many makers are your best bet.</p>`],
      ["3. This site: shops by item", `<p>Every item page here has a <b>\"Where to buy in Japan\"</b> section with shops near major stations, and a list of shops in Japan that carry it, by prefecture. It's built from Bandai's official shop data and updated daily.${it ? ` For example, ${h.a(`${h.H}item/${it.id}.html`, h.nameOf(it))} is listed at ${fmt(D.popularShops)} shops.` : ""}</p>`],
      ["4. This site: shops by station", `<p>If you already know where you'll be, start from the station instead: ${h.a(`${h.H}station.html`, `${D.stationsN} major stations and airports`)} each have a page with nearby gacha shops, a map, walking times and the series releasing this week at those shops.</p>`],
      ["Tips", `<ul><li>New series roll out from release week; shops may get them a few days earlier or later. See ${h.a(`${h.H}week.html`, "this week's releases")}.</li><li>Big shops (thousands of machines) are the safest bet for a specific series — see ${h.a(`${h.H}guide/tokyo-gachapon-shops.html`, "the biggest shops in Tokyo")}.</li><li>Sold out everywhere? Full sets are often sold online after release.</li></ul>`],
    ],
    faq: [
      ["How can I check if a gachapon is in stock?", "For Bandai gacha, use Bandai's official shop finder (Gashapon doko?) from the series page on gashapon.jp. On this site, each item page lists shops in Japan that carry it."],
      ["Does the official finder show live stock?", "No. It lists shops registered to carry the series, not how many capsules are left. Popular series can still be sold out."],
      ["Is the shop finder in English?", "Bandai's finder is in Japanese, but browser translation works well. This site's item and station pages are in English."],
      ["Can I search by station?", `Yes. This site has pages for ${D.stationsN} major stations and airports with nearby gacha shops and walking times.`],
    ],
  };
};
C.ko["check-gachapon-stock"] = (D, h) => {
  const it = D.popular;
  return {
    title: "일본 가챠 재고 확인하는 법: 가기 전에 매장 찾기",
    h1: "일본 가챠 재고 확인하는 법",
    short: "가챠 재고 확인하는 법",
    desc: "원하는 가챠가 어디 있는지 가기 전에 확인하세요. 반다이 공식 매장 검색 '가샤폰 도코?', 타카라토미아츠 공식 상품 페이지, 이 사이트의 상품별·역별 매장 목록 사용법.",
    intro: "인기 가챠는 발매 며칠 만에 품절되기도 하고, 매장마다 들어오는 가챠가 달라요. 한 시리즈 때문에 도쿄를 가로질러 가기 전에 2분만 투자해서 어디 있는지 확인해 보세요. 일본어를 몰라도 괜찮아요.",
    quick: "반다이 가챠는 공식 사이트(gashapon.jp)의 상품 페이지에서 매장 검색 '가샤폰 도코?(ガシャポンどこ？)'를 이용하세요. 이 사이트에서는 각 가챠 페이지에 취급 매장이, 각 역 페이지에 근처 가챠샵이 정리돼 있어요. 재고는 금방 바뀌니 목록은 참고용으로 보세요.",
    sections: [
      ["1. 반다이 공식 매장 검색(가샤폰 도코?)", `<p>가샤폰을 만드는 반다이는 공식 매장 검색 'ガシャポンどこ？(가샤폰 어디?)'를 운영해요. ${h.a("https://gashapon.jp/", "gashapon.jp", true)}의 시리즈 페이지에서 매장 검색 링크를 누르면 그 시리즈를 취급하는 매장을 도도부현별로 볼 수 있어요. ${h.a(BANDAI_FINDER, "매장 검색 페이지", true)}에서 직접 찾을 수도 있어요. 일본어 사이트지만 브라우저 번역 기능으로 충분히 쓸 수 있어요.</p><p>남은 캡슐 수를 실시간으로 보여 주는 게 아니라 취급 매장 목록이라서, 인기 시리즈는 품절일 수도 있어요.</p>`],
      ["2. 타카라토미아츠", `<p>또 하나의 대형 가챠 회사인 타카라토미아츠는 ${h.a(TTA_SITE, "공식 사이트", true)}에 시리즈별 페이지가 있어서 발매월, 가격, 라인업을 확인할 수 있어요. 실제로 찾을 때는 여러 회사 가챠를 함께 두는 대형 가챠샵이 가장 확실해요.</p>`],
      ["3. 이 사이트: 가챠별 매장", `<p>이 사이트의 각 가챠 페이지에는 주요 역 근처 매장과, 일본 전국의 취급 매장 목록(도도부현별)이 있어요. 반다이 공식 매장 데이터를 바탕으로 매일 업데이트해요.${it ? ` 예를 들어 '${h.a(`${h.H}item/${it.id}.html`, h.nameOf(it))}'의 취급 매장은 ${fmt(D.popularShops)}곳이에요.` : ""}</p>`],
      ["4. 이 사이트: 역별 매장", `<p>어디에 갈지 정해졌다면 역에서 찾는 게 편해요. ${h.a(`${h.H}station.html`, `주요 역·공항 ${D.stationsN}곳`)}마다 근처 가챠샵, 지도, 도보 시간, 그 매장들에 들어오는 이번 주 신작을 정리한 페이지가 있어요.</p>`],
      ["팁", `<ul><li>신작은 발매 주부터 매장에 들어오고, 매장에 따라 며칠 빠르거나 늦을 수 있어요. ${h.a(`${h.H}week.html`, "이번 주 발매 가챠")}를 확인하세요.</li><li>특정 시리즈를 찾는다면 기계가 수천 대 있는 대형 가챠샵이 가장 확실해요. ${h.a(`${h.H}guide/tokyo-gachapon-shops.html`, "도쿄 대형 가챠샵 순위")} 참고.</li><li>어디에도 없다면 발매 후 온라인에서 전 종류 세트를 파는 경우가 많아요.</li></ul>`],
    ],
    faq: [
      ["가챠 재고는 어떻게 확인해요?", "반다이 가챠는 gashapon.jp의 시리즈 페이지에서 공식 매장 검색 '가샤폰 도코?'를 이용하세요. 이 사이트의 각 가챠 페이지에도 취급 매장이 정리돼 있어요."],
      ["공식 매장 검색은 실시간 재고인가요?", "아니요. 그 시리즈를 취급하는 매장 목록이고, 남은 캡슐 수는 알 수 없어요. 인기 시리즈는 품절일 수 있어요."],
      ["매장 검색은 한국어로 되나요?", "반다이 사이트는 일본어지만 브라우저 번역으로 쓸 수 있어요. 이 사이트의 가챠·역 페이지는 한국어로 볼 수 있어요."],
      ["역으로 찾을 수 있나요?", `네. 이 사이트에 주요 역·공항 ${D.stationsN}곳의 근처 가챠샵과 도보 시간을 정리한 페이지가 있어요.`],
    ],
  };
};
const stockZh = (tw) => (D, h) => {
  const it = D.popular, z = (a, b) => (tw ? a : b);
  return {
    title: z("日本扭蛋庫存查詢教學：出發前先查哪家店有貨", "日本扭蛋库存查询教程：出发前先查哪家店有货"),
    h1: z("日本扭蛋庫存查詢教學", "日本扭蛋库存查询教程"),
    short: z("日本扭蛋庫存查詢教學", "日本扭蛋库存查询教程"),
    desc: z("想找特定的扭蛋？教你用萬代官方店鋪搜尋「ガシャポンどこ？」、TAKARA TOMY A.R.T.S官方商品頁，以及本站依商品、依車站的店家清單。", "想找特定的扭蛋？教你用万代官方店铺搜索「ガシャポンどこ？」、TAKARA TOMY A.R.T.S官方商品页，以及本站按商品、按车站的店铺清单。"),
    intro: z("熱門扭蛋可能發售幾天就賣完，而且每家店進的款式都不一樣。為了一個系列跑遍東京之前，先花兩分鐘查查哪裡有。不會日文也沒關係。", "热门扭蛋可能发售几天就卖完，而且每家店进的款式都不一样。为了一个系列跑遍东京之前，先花两分钟查查哪里有。不会日语也没关系。"),
    quick: z("萬代的扭蛋，在官方網站（gashapon.jp）的商品頁使用店鋪搜尋「ガシャポンどこ？」。本站每個扭蛋頁面都列出有販售的店家，每個車站頁面都有附近的扭蛋店。庫存變化很快，清單請當作參考。", "万代的扭蛋，在官方网站（gashapon.jp）的商品页使用店铺搜索「ガシャポンどこ？」。本站每个扭蛋页面都列出有售的店铺，每个车站页面都有附近的扭蛋店。库存变化很快，清单仅供参考。"),
    sections: [
      [z("1. 萬代官方店鋪搜尋（ガシャポンどこ？）", "1. 万代官方店铺搜索（ガシャポンどこ？）"), `<p>${z(`推出Gashapon的萬代有官方店鋪搜尋「ガシャポンどこ？」（扭蛋在哪裡？）。在${h.a("https://gashapon.jp/", "gashapon.jp", true)}的系列頁面點店鋪搜尋連結，就能依都道府縣看到有販售該系列的店家；也可以直接在${h.a(BANDAI_FINDER, "店鋪搜尋頁面", true)}找店。網站是日文，但用瀏覽器的翻譯功能就很好用。`, `推出Gashapon的万代有官方店铺搜索「ガシャポンどこ？」（扭蛋在哪里？）。在${h.a("https://gashapon.jp/", "gashapon.jp", true)}的系列页面点店铺搜索链接，就能按都道府县看到有售该系列的店铺；也可以直接在${h.a(BANDAI_FINDER, "店铺搜索页面", true)}找店。网站是日文，但用浏览器的翻译功能就很好用。`)}</p><p>${z("這是有販售該系列的店家清單，不是剩下幾顆的即時庫存，熱門系列還是可能賣完。", "这是有售该系列的店铺清单，不是剩下几个的实时库存，热门系列还是可能卖完。")}</p>`],
      ["2. TAKARA TOMY A.R.T.S", `<p>${z(`另一家大型扭蛋廠商TAKARA TOMY A.R.T.S，在${h.a(TTA_SITE, "官方網站", true)}上每個系列都有頁面，可以確認發售月份、價格和款式。實際要找的話，同時擺放多家廠商扭蛋的大型扭蛋店最有機會。`, `另一家大型扭蛋厂商TAKARA TOMY A.R.T.S，在${h.a(TTA_SITE, "官方网站", true)}上每个系列都有页面，可以确认发售月份、价格和款式。实际要找的话，同时摆放多家厂商扭蛋的大型扭蛋店最有机会。`)}</p>`],
      [z("3. 本站：依商品找店", "3. 本站：按商品找店"), `<p>${z(`本站每個扭蛋頁面都有主要車站附近的店家，以及依都道府縣整理的全日本販售店清單，根據萬代官方店鋪資料每天更新。${it ? `例如${h.a(`${h.H}item/${it.id}.html`, h.nameOf(it))}有${fmt(D.popularShops)}家店販售。` : ""}`, `本站每个扭蛋页面都有主要车站附近的店铺，以及按都道府县整理的全日本有售店铺清单，根据万代官方店铺数据每天更新。${it ? `例如${h.a(`${h.H}item/${it.id}.html`, h.nameOf(it))}有${fmt(D.popularShops)}家店有售。` : ""}`)}</p>`],
      [z("4. 本站：依車站找店", "4. 本站：按车站找店"), `<p>${z(`如果已經知道要去哪裡，從車站找更方便：${h.a(`${h.H}station.html`, `${D.stationsN}個主要車站與機場`)}都有頁面，整理附近的扭蛋店、地圖、步行時間，以及這些店本週會進的新品。`, `如果已经知道要去哪里，从车站找更方便：${h.a(`${h.H}station.html`, `${D.stationsN}个主要车站和机场`)}都有页面，整理附近的扭蛋店、地图、步行时间，以及这些店本周会进的新品。`)}</p>`],
      [z("小技巧", "小技巧"), z(`<ul><li>新品從發售週開始上架，各店可能早幾天或晚幾天，請看${h.a(`${h.H}week.html`, "本週發售")}。</li><li>要找特定系列，有數千台機器的大型扭蛋店最保險，參考${h.a(`${h.H}guide/tokyo-gachapon-shops.html`, "東京大型扭蛋店排行")}。</li><li>到處都賣完的話，發售後網路上常有整套販售。</li></ul>`, `<ul><li>新品从发售周开始上架，各店可能早几天或晚几天，请看${h.a(`${h.H}week.html`, "本周发售")}。</li><li>要找特定系列，有几千台机器的大型扭蛋店最保险，参考${h.a(`${h.H}guide/tokyo-gachapon-shops.html`, "东京大型扭蛋店排行")}。</li><li>到处都卖完的话，发售后网上常有整套出售。</li></ul>`)],
    ],
    faq: [
      [z("怎麼查扭蛋有沒有庫存？", "怎么查扭蛋有没有库存？"), z("萬代的扭蛋可以在gashapon.jp的系列頁面使用官方店鋪搜尋「ガシャポンどこ？」。本站每個扭蛋頁面也列出有販售的店家。", "万代的扭蛋可以在gashapon.jp的系列页面使用官方店铺搜索「ガシャポンどこ？」。本站每个扭蛋页面也列出有售的店铺。")],
      [z("官方店鋪搜尋是即時庫存嗎？", "官方店铺搜索是实时库存吗？"), z("不是。它是有販售該系列的店家清單，看不到剩下幾顆，熱門系列可能已經賣完。", "不是。它是有售该系列的店铺清单，看不到剩下几个，热门系列可能已经卖完。")],
      [z("店鋪搜尋有中文嗎？", "店铺搜索有中文吗？"), z("萬代的網站是日文，但可以用瀏覽器翻譯。本站的扭蛋頁面和車站頁面都有繁體中文。", "万代的网站是日文，但可以用浏览器翻译。本站的扭蛋页面和车站页面都有简体中文。")],
      [z("可以依車站找嗎？", "可以按车站找吗？"), z(`可以。本站有${D.stationsN}個主要車站與機場的頁面，整理附近扭蛋店和步行時間。`, `可以。本站有${D.stationsN}个主要车站和机场的页面，整理附近扭蛋店和步行时间。`)],
    ],
  };
};
C["zh-tw"]["check-gachapon-stock"] = stockZh(true);
C["zh-cn"]["check-gachapon-stock"] = stockZh(false);

/* ---------- ページを作る ---------- */
// E：build.js から渡すもの（lang・t・layout・ctx・card・lmCardAt・rowAt・esc・canonical・LANG_META・STATIONS・items・WEEK・SHOP_OFFICIAL・OFFICIAL_BY_ITEM・
//    distM・walkMin・fmtDist・compDraws・today・nowJST・LANDMARKS_CHECKED・SITE_URL・site・nameOf・lmName・OG_IMAGE）
const build = (E) => {
  const { lang, t, layout, ctx, card, lmCardAt, rowAt, canonical, LANG_META, today, SITE_URL, nameOf, lmName } = E;
  if (!GUIDE_LANGS.includes(lang)) return [];
  const U = UI[lang];
  const D = prepareData(E); D.E = E;
  const stName = (st) => st[lang] || st.en;
  const helpers = (c) => ({
    H: c.H, R: c.R, esc,
    a: (href, text, ext) => `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(text)}</a>`,
    st: (slug) => (D.ST[slug] ? `<a href="${c.H}station/${slug}.html">${esc(stName(D.ST[slug]))}</a>` : ""),
    // 駅ページへの目立つリンク（チップ。お店の数つき）
    stMore: (slug) => (D.ST[slug] ? `<a class="chara-chip" href="${c.H}station/${slug}.html">🚉 ${esc(stName(D.ST[slug]))}<small>${D.ST[slug].count}</small></a>` : ""),
    lmName: (x) => lmName(x.lm),
    lmShort: (x) => lmName(x.lm).replace(/\s*[（(][^（(]*[)）]$/, ""), // 「GACHA WORLD (羽田…)」→「GACHA WORLD」
    lm: (x) => esc(lmName(x.lm)),
    lmLink: (x) => (x.sh ? `<a href="${c.R}shop/${x.sh.id}.html">${esc(lmName(x.lm))}</a>` : esc(lmName(x.lm))),
    cards: (list) => (list.length ? `<div class="lm-list">${list.map(lmCardAt(c)).join("")}</div>` : ""),
    rows: (list, o) => (list.length ? `<div class="shop-list">${list.map(rowAt(c, o)).join("")}</div>` : ""),
    grid: (list) => (list.length ? `<div class="grid row-scroll">${list.map((it, i) => card(it, c, i)).join("")}</div>` : ""),
    nameOf: (it) => nameOf(it, lang),
  });
  const publisher = { "@type": "Organization", name: "ガチャプラネット", alternateName: "GACHA PLANET", url: `${SITE_URL}/`, logo: { "@type": "ImageObject", url: `${SITE_URL}/images/og/site.png` } };
  const inLanguage = LANG_META[lang].hreflang;
  const crumbs = (c, last) => `<nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${esc(t.home)}</a><span>/</span>${last ? `<a href="${c.H}guide/index.html">${esc(U.crumb)}</a><span>/</span><span>${esc(last)}</span>` : `<span>${esc(U.crumb)}</span>`}</nav>`;
  const crumbLd = (list) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: list.map(([name, rel], i) => ({ "@type": "ListItem", position: i + 1, name, ...(rel ? { item: canonical(lang, rel) } : {}) })) });

  // まず全部の中身を作る（目次と「ほかのガイド」に使う）
  const made = [];
  for (const slug of SLUGS) {
    const rel = `guide/${slug}.html`, c = ctx(rel), h = helpers(c);
    const g = C[lang][slug] && C[lang][slug](D, h);
    if (g) { g.short = SHORT[lang][SLUGS.indexOf(slug)] || g.short; made.push({ slug, rel, c, g }); }
  }
  for (const { slug, rel, c, g } of made) {
    const others = made.filter((x) => x.slug !== slug);
    const body = `<div class="wrap guide">
  ${crumbs(c, g.short)}
  <header class="page-head"><h1>${esc(g.h1)}</h1><p class="lead">${esc(g.intro)}</p><p class="fine">${esc(U.updated(today))}</p></header>
  ${g.quick ? `<section class="section section-tight"><div class="guide-quick"><b>${esc(U.quick)}</b><p>${esc(g.quick)}</p></div></section>` : ""}
  ${g.sections.map(([hd, html]) => `<section class="section section-tight"><div class="section-head"><h2>${esc(hd)}</h2></div><div class="guide-body">${html}</div></section>`).join("\n  ")}
  ${E.travelBlock ? E.travelBlock(lang, slug === "airport-gachapon" ? ["wifi-sim-cards", "transport"] : null) : ""}
  <section class="section section-tight" id="faq"><div class="section-head"><h2>${esc(U.faqH)}</h2></div>
    <dl class="prose stn-faq">${g.faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl></section>
  <section class="section section-tight"><div class="section-head"><h2>${esc(U.more)}</h2></div>
    <div class="chara-list">${others.map((x) => `<a class="chara-chip" href="${c.H}${x.rel}">${esc(x.g.short)}</a>`).join("")}<a class="chara-chip chara-more" href="${c.H}guide/index.html">${esc(U.all)}</a></div></section>
</div>`;
    const jsonld = [
      { "@context": "https://schema.org", "@type": "Article", headline: g.h1.slice(0, 110), description: g.desc, inLanguage, datePublished: PUBLISHED, dateModified: today,
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical(lang, rel) }, image: [E.OG_IMAGE], author: { "@type": "Organization", name: E.site.name, url: `${SITE_URL}/` }, publisher },
      { "@context": "https://schema.org", "@type": "FAQPage", inLanguage, mainEntity: g.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      crumbLd([[t.home, "index.html"], [U.crumb, "guide/index.html"], [g.short]]),
    ];
    layout({ rel, title: g.title, description: g.desc, body, jsonld, ogType: "article", alts: GUIDE_LANGS, only: GUIDE_LANGS, lastmod: today });
  }
  // ガイドの目次
  {
    const rel = "guide/index.html", c = ctx(rel);
    const body = `<div class="wrap guide">
  ${crumbs(c, "")}
  <header class="page-head"><h1>${esc(U.idxH1)}</h1><p class="lead">${esc(U.idxLead)}</p></header>
  <section class="section section-tight"><div class="guide-list">${made.map((x) => `<a class="guide-item" href="${c.H}${x.rel}"><b>${esc(x.g.h1)}</b><span>${esc(x.g.desc)}</span><em>${esc(U.read)}</em></a>`).join("")}</div></section>
</div>`;
    layout({ rel, title: U.idxTitle, description: U.idxDesc, body, alts: GUIDE_LANGS, only: GUIDE_LANGS, lastmod: today, jsonld: [
      { "@context": "https://schema.org", "@type": "ItemList", name: U.idxTitle, inLanguage, numberOfItems: made.length, itemListElement: made.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: canonical(lang, x.rel), name: x.g.h1 })) },
      crumbLd([[t.home, "index.html"], [U.crumb]]),
    ] });
  }
  return made.map((x) => ({ slug: x.slug, short: x.g.short }));
};

// トップページ（外国語）の「旅行者向けガイド」の帯。list は build() が返したもの
const homeSection = (lang, c, esc) => { const list = SLUGS.map((slug, i) => ({ slug, short: SHORT[lang] && SHORT[lang][i] })); return (GUIDE_LANGS.includes(lang) ? `<section class="section section-tight" id="guides">
    <div class="section-head"><h2>${esc(UI[lang].homeH)}</h2></div>
    <div class="chara-list">${list.map((x) => `<a class="chara-chip" href="${c.H}guide/${x.slug}.html">${esc(x.short)}</a>`).join("")}<a class="chara-chip chara-more" href="${c.H}guide/index.html">${esc(UI[lang].all)}</a></div>
  </section>` : ""); };

module.exports = { GUIDE_LANGS, NAV, SLUGS, SHORT, build, homeSection };
