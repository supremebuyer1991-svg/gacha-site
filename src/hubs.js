/*
 * 検索の受け皿になる一覧ページ（build.js から呼ぶ）
 *   - 週ごとの固定ページ   /calendar/2026-11/w3   （全言語）
 *   - シリーズ（定番の型）の歴代ページ /collection/めじるし… （日本語・英語）
 *   - 再販・復刻の一覧     /saihan               （日本語・英語）
 *   - 値段ごとの一覧       /price/300            （日本語だけ）
 * 文言：日本語はここに直接、英語は T.en.hub（中国語・韓国語は src/i18n/<lang>.js の hub）
 */

// シリーズ（定番の型）。商品名にこの言葉が入っていれば、そのシリーズの1作として数える
// 3作以上あるものだけページにする。キャラクター・作品の名前は /chara/ にあるので、ここは「型」の名前だけ
const LINES = [
  ["mejirushi-accessory", "めじるしアクセサリー", "Mejirushi Accessory", /めじるしアクセサリー/],
  ["mejirushi-gacha-mascot", "めじるしガチャマスコット", "Mejirushi Gacha Mascot", /めじるしガチャマスコット/],
  ["mejirushi-friends", "めじるしフレンズ", "Mejirushi Friends", /めじるしフレンズ/],
  ["machiboke", "まちぼうけ", "Machiboke", /まちぼうけ/],
  ["colorful-multi-charm", "カラフルマルチチャーム", "Colorful Multi Charm", /カラフルマルチチャーム/],
  ["katazun-fig", "肩ズンFig.", "Katazun Fig.", /肩ズン/],
  ["tsumande-tsunagete", "つまんでつなげてますこっと", "Tsumande Tsunagete Mascot", /つまんでつなげて(?:ますこっと|マスコット)/],
  ["miniature-package-charm", "ミニチュアパッケージチャーム", "Miniature Package Charm", /ミニチュアパッケージチャーム/],
  ["miniature-package-collection", "ミニチュアパッケージコレクション", "Miniature Package Collection", /ミニチュアパッケージコレクション/],
  ["mofumofu-pochette", "もふもふポーシェット", "Mofumofu Pochette", /もふもふポーシェット/],
  ["capsule-rubber-mascot", "カプセルラバーマスコット", "Capsule Rubber Mascot", /カプセルラバーマスコット/],
  ["hide-and-seek", "Hide&Seek かくれんぼフィギュア", "Hide & Seek Figure", /かくれんぼフィギュア|Hide&Seek/i],
  ["tsunagaring-charm", "つながリングチャーム", "Tsunagaring Charm", /つながリングチャーム/],
  ["defo-rubber", "でふぉラバ", "Defo Rubber", /でふぉラバ/],
  ["yurayura-tsunagaru-mascot", "ゆらゆらつながるマスコット", "Yurayura Tsunagaru Mascot", /ゆらゆらつながるマスコット/],
  ["mame-gasha-hon", "豆ガシャ本", "Mame Gasha Hon (mini books)", /豆ガシャ本/],
  ["mini-cd-collection", "ミニCDコレクション", "Mini CD Collection", /ミニCDコレクション/],
  ["nemurasetai", "ねむらせ隊", "Nemurasetai", /ねむらせ隊/],
  ["suwarasetai", "すわらせ隊", "Suwarasetai", /すわらせ隊/],
  ["narabundesu", "ならぶんです。", "Narabundesu", /ならぶんです/],
  ["comics-charm-collection", "Comics Charm Collection", "Comics Charm Collection", /Comics Charm Collection/i],
  ["blister-charm-collection", "ブリスターチャームコレクション", "Blister Charm Collection", /ブリスターチャーム/],
  ["clear-rubber-coaster", "クリアラバーコースター", "Clear Rubber Coaster", /クリアラバーコースター/],
  ["mascot-ball-chain", "マスコットボールチェーン", "Mascot Ball Chain", /マスコットボールチェーン/],
  ["gyukotto", "ぎゅーこっと", "Gyukotto", /ぎゅーこっと/],
  ["pukutto-ring", "ぷくっとリング", "Pukutto Ring", /ぷくっとリング/],
  ["photo-frame-mascot", "フォトフレームマスコット", "Photo Frame Mascot", /フォトフレームマスコット/],
  ["capsule-plarail", "カプセルプラレール", "Capsule Plarail", /カプセルプラレール/],
  ["kapukyara", "カプキャラ", "Capchara", /カプキャラ/],
  ["face-plush", "フェイスぬいぐるみ", "Face Plush", /フェイスぬいぐるみ/],
  ["capsule-figure-collection", "カプセルフィギュアコレクション", "Capsule Figure Collection", /カプセルフィギュアコレクション/],
  ["metal-charm-mascot", "メタルチャームマスコット", "Metal Charm Mascot", /メタルチャームマスコット/],
  ["wanpi-no-mi", "ワンピの実", "Wanpi no Mi (ONE PIECE)", /ワンピの実/],
  ["mobile-suit-ensemble", "MOBILE SUIT ENSEMBLE", "MOBILE SUIT ENSEMBLE", /MOBILE SUIT ENSEMBLE/i],
  ["hg", "HGシリーズ（ガシャポンHG）", "HG series (Gashapon HG)", /^HG(?:D\+)?[\s぀-ヿ一-鿿]/],
];
const MIN_LINE = 3;

const isReissue = (it) => /再販|再生産|復刻|reissue/i.test(it.name) || /再発売/.test(it.release_note || "");
const isBox = (it) => /箱売/.test(it.name);
const KAN = "〇一二三四五六七八九";
const DAIJI = { 壱: "一", 弐: "二", 参: "三", 肆: "四", 伍: "五", 陸: "六", 漆: "七", 捌: "八", 玖: "九", 拾: "十" };
const kanNum = (s) => {
  if (/^\d+$/.test(s)) return Number(s);
  s = String(s).replace(/[壱弐参肆伍陸漆捌玖拾]/g, (ch) => DAIJI[ch]);
  const m = s.match(/^(?:([一二三四五六七八九])?(十))?([一二三四五六七八九])?$/);
  if (!m || (!m[2] && !m[3])) return null;
  return (m[2] ? (m[1] ? KAN.indexOf(m[1]) : 1) * 10 : 0) + (m[3] ? KAN.indexOf(m[3]) : 0);
};
// 商品名から「何弾目か」を取る（めじるしアクセサリー2 → base「めじるしアクセサリー」, vol 2）
const volOf = (name) => {
  let n = String(name || "").normalize("NFKC").replace(/【[^】]*】/g, " ").replace(/[（(][^）)]*(?:再販|再生産|復刻)[^）)]*[）)]/g, " ")
    .replace(/^From TV animation\s+/i, "").replace(/\s*[～〜~][^～〜~]*[～〜~]?\s*$/, "").replace(/\s+/g, " ").trim();
  // 「第4弾 ふたば幼稚園大集合シリーズ」のように、番号のあとに副題がつくものは副題を外して数える
  n = n.replace(/(第[0-9一二三四五六七八九十壱弐参肆伍陸漆捌玖拾]+(?:弾|海戦|章))\s+(?!.*(?:BOX|ボックス|セット)).+$/i, "$1");
  const m = n.match(/^(.*?)\s*(?:第([0-9一二三四五六七八九十壱弐参肆伍陸漆捌玖拾]+)(?:弾|海戦|章)|vol\.?\s*(\d+)|part\.?\s*(\d+)|(?<!\d)(\d{1,2}))$/i);
  if (!m || m[1].replace(/[\s!！]/g, "").length < 3) return { base: n, vol: null };
  const v = kanNum(m[2] || m[3] || m[4] || m[5]);
  return v ? { base: m[1].replace(/[\s:：・-]+$/, "").trim(), vol: v } : { base: n, vol: null };
};
const slugify = (s) => String(s || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------- 言語に関係ない下ごしらえ（1回だけ） ---------- */
const prepare = (E) => {
  const { items, weekStartOf, weekInfo, mondayOf, nowJST, thisMonth, hashSlug } = E;
  const wsKey = (it) => { const s = weekStartOf(it); return s ? s.toISOString().slice(0, 10) : `${it.release}-99`; };
  const order = (a, b) => (wsKey(a) < wsKey(b) ? -1 : wsKey(a) > wsKey(b) ? 1 : a.id < b.id ? -1 : 1);
  const THIS_MON = mondayOf(nowJST).toISOString().slice(0, 10);
  const isUpcoming = (it) => { const s = weekStartOf(it); return s ? s.toISOString().slice(0, 10) > THIS_MON : it.release > thisMonth; };

  // 1) 定番の型（めじるしアクセサリーなど）
  const lines = LINES.map(([slug, label, en, rx]) => ({ slug, label, en, kind: "line", list: items.filter((it) => rx.test(it.name.normalize("NFKC"))).sort(order) }))
    .filter((l) => l.list.length >= MIN_LINE);
  // 2) 番号つきの続きもの（同じ名前で番号だけちがう）。再販・箱売は数えない
  const byBase = new Map();
  for (const it of items) {
    if (isReissue(it) || isBox(it)) continue;
    const { base, vol } = volOf(it.name);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push({ it, vol });
  }
  const seqs = [];
  for (const [base, arr] of byBase) {
    const numbered = arr.filter((x) => x.vol);
    const vols = new Set(numbered.map((x) => x.vol));
    if (vols.size < 2) continue;
    // 番号なしの1作目（番号つきより前に出たもの）は第1弾とみなす
    const first = numbered.map((x) => x.it).sort(order)[0];
    const plain = arr.filter((x) => !x.vol && !vols.has(1) && order(x.it, first) < 0).sort((a, b) => order(a.it, b.it)).slice(0, 1).map((x) => ({ it: x.it, vol: 1 }));
    const seen = new Set();
    const list = [...plain, ...numbered].sort((a, b) => a.vol - b.vol || order(a.it, b.it)).filter((x) => !seen.has(x.vol) && seen.add(x.vol));
    seqs.push({ base, list });
  }
  const seqOf = new Map();
  for (const s of seqs) s.list.forEach((x, i) => seqOf.set(x.it, { label: s.base, prev: s.list[i - 1] && s.list[i - 1].it, next: s.list[i + 1] && s.list[i + 1].it, vol: x.vol }));
  // 3作以上の続きものもページにする（型のページと中身が同じなら作らない）
  const used = new Set(lines.map((l) => l.slug));
  for (const s of seqs.filter((x) => x.list.length >= 3)) {
    const ids = s.list.map((x) => x.it.id).sort().join();
    if (lines.some((l) => l.list.filter((it) => !isReissue(it) && !isBox(it)).map((it) => it.id).sort().join() === ids)) continue;
    const latest = s.list[s.list.length - 1].it;
    let slug = slugify(latest.name_en ? volOf(latest.name_en).base : "") || hashSlug(s.base);
    while (used.has(slug)) slug += "-x";
    used.add(slug);
    lines.push({ slug, label: s.base, en: latest.name_en ? volOf(latest.name_en).base : s.base, kind: "vol", list: s.list.map((x) => x.it).sort(order), vols: new Map(s.list.map((x) => [x.it, x.vol])) });
  }
  // 商品 → 入っている型（いちばん小さいまとまりを優先）
  const lineOf = new Map();
  for (const l of [...lines].sort((a, b) => a.list.length - b.list.length)) for (const it of l.list) if (!lineOf.has(it)) lineOf.set(it, l);
  // 型の中の前後（続きものがないときに使う）。再販・箱売はとばす
  const lineSeq = new Map();
  for (const l of lines) {
    if (l.kind !== "line") continue;
    const L = l.list.filter((it) => !isReissue(it) && !isBox(it));
    L.forEach((it, i) => { if (!lineSeq.has(it)) lineSeq.set(it, { label: l.label, en: l.en, line: l, prev: L[i - 1], next: L[i + 1] }); });
  }

  // 週ごと
  const weeks = new Map();
  for (const it of items) {
    const s = weekStartOf(it);
    if (!s) continue;
    const w = weekInfo(s);
    if (!weeks.has(w.key)) weeks.set(w.key, { w, list: [] });
    weeks.get(w.key).list.push(it);
  }
  const weekList = [...weeks.values()].sort((a, b) => (a.w.key < b.w.key ? -1 : 1));
  const reissues = items.filter(isReissue).sort((a, b) => -order(a, b));
  return { lines, lineOf, seqOf, lineSeq, weekList, weeks, reissues, isReissue, isBox, isUpcoming, order, wsKey, volOf };
};

const ymOf = (w) => `${w.y}-${String(w.m).padStart(2, "0")}`;
const weekRel = (w) => `calendar/${ymOf(w)}/w${w.no}.html`;
// 週へのリンク先：今週・来週は（検索に出している）/week・/next-week へ。ほかの週は週ごとの固定ページへ
const weekHref = (w, { WEEK, NEXT_WEEK } = {}) => (WEEK && w.key === WEEK.key ? "week.html" : NEXT_WEEK && w.key === NEXT_WEEK.key ? "next-week.html" : weekRel(w));

/* ---------- 一覧ページの「最終更新」と CollectionPage（週・月のページで使う） ---------- */
// 商品がサイトに載った日（added）から：いちばん古い日＝公開日、いちばん新しい日＝更新日、その日に載った件数＝新着
const addedSpan = (list) => {
  const ds = list.map((it) => it.added).filter(Boolean).sort();
  const last = ds[ds.length - 1] || "";
  return { first: ds[0] || "", last, fresh: ds.filter((d) => d === last).length };
};
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const UPD = {
  ja: (y, m, d, k) => `最終更新：${y}年${m}月${d}日（新着${k}件）`,
  en: (y, m, d, k) => `Last updated: ${MON_EN[m - 1]} ${d}, ${y} (${k} new)`,
  "zh-cn": (y, m, d, k) => `最后更新：${y}年${m}月${d}日（新增${k}件）`,
  "zh-tw": (y, m, d, k) => `最後更新：${y}年${m}月${d}日（新增${k}件）`,
  ko: (y, m, d, k) => `최종 업데이트: ${y}년 ${m}월 ${d}일 (신규 ${k}건)`,
};
const updatedLine = (list, lang) => {
  const { last, fresh } = addedSpan(list);
  if (!last) return "";
  const [y, m, d] = last.split("-").map(Number);
  return `<p class="hub-updated"><time datetime="${last}">${(UPD[lang] || UPD.en)(y, m, d, fresh)}</time></p>`;
};
const collectionLd = ({ name, url, list, inLanguage, siteUrl }) => {
  const { first, last } = addedSpan(list);
  return { "@context": "https://schema.org", "@type": "CollectionPage", name, url, inLanguage,
    ...(first ? { datePublished: first } : {}), ...(last ? { dateModified: last } : {}),
    publisher: { "@type": "Organization", name: "ガチャプラネット", alternateName: "GACHA PLANET", url: `${siteUrl}/` } };
};

/* ---------- 言語ごとのページ ---------- */
const build = (P, E) => {
  const { lang, t, layout, card, ctx, esc, canonical, nameOf, hasName, CHARAS, charaLabel, WEEK, NEXT_WEEK, byPopular, byNewest, thisMonth, MONTH_EN, thumbOf, listPage, items, genreLabel, genreOf, makerSlug, makerOf, enRange, SITE_URL } = E;
  const ja = lang === "ja", h = t.hub;
  // 商品 → いちばん先に当てはまるキャラクター・作品（めじるしは「型」なので除く）
  const charaOf = (it) => CHARAS.find((ch) => ch.slug !== "mejirushi" && ch.list.includes(it));
  const maxAdded = (list) => list.reduce((m, it) => (it.added > m ? it.added : m), "");
  const crumbs = (arr) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: arr.map(([name, rel], i) => ({ "@type": "ListItem", position: i + 1, name, ...(rel ? { item: canonical(lang, rel) } : {}) })) });
  const itemList = (list) => ({ "@context": "https://schema.org", "@type": "ItemList", numberOfItems: list.length, itemListElement: list.slice(0, 30).map((it, i) => ({ "@type": "ListItem", position: i + 1, url: canonical(lang, `item/${it.id}.html`), name: nameOf(it, lang) })) });
  const monthLabel = (ym) => { const [y, mo] = ym.split("-").map(Number); return ja ? `${y}年${mo}月` : t.month(ym); };
  const weekLabel = (w) => (ja ? `${w.m}月第${w.no}週` : h.weekLabel(w.m, w.no));

  /* ===== 週ごとの固定ページ ===== */
  const WL = P.weekList;
  WL.forEach((g, i) => {
    const { w } = g, rel = weekRel(w), c = ctx(rel), n = g.list.length;
    const list = [...g.list].sort(byPopular);
    const ym = ymOf(w), lab = weekLabel(w);
    const past = w.key < WEEK.key;
    const badge = w.key === WEEK.key ? `<span class="wk-now">${ja ? "今週" : h.badgeNow}</span>` : w.key === NEXT_WEEK.key ? `<span class="wk-next">${ja ? "来週" : h.badgeNext}</span>` : past ? `<span class="wk-past">${ja ? "発売済み" : h.badgePast}</span>` : "";
    const title = ja ? `${lab}（${w.range}）発売のガチャガチャ新作${n}シリーズ｜発売日・値段` : h.weekTitle(lab, w.range, n);
    const h1 = ja ? `${lab}（${w.range}）発売のガチャ` : h.weekH1(lab, w.range);
    const lead = ja ? `${w.y}年${lab}（${w.range}）に発売${past ? "された" : "される"}ガチャガチャ${n}シリーズを、人気の順に並べています。「第◯週」はその週から順次発売という意味で、お店や地域によって前後します。` : h.weekLead(lab, w.range, n);
    const top = list.slice(0, 3).map((it) => nameOf(it, lang));
    const desc = ja ? `${lead.split("。")[0]}。${top.join("、")}など。` : `${lead} ${h.including(top)}`;
    const prev = WL[i - 1], next = WL[i + 1];
    const pager = `<nav class="month-pager" aria-label="${ja ? "前後の週" : h.weekNavAria}">${prev ? `<a href="${c.H}${weekHref(prev.w, E)}">${ja ? `← ${weekLabel(prev.w)}` : `← ${weekLabel(prev.w)}`}</a>` : "<span></span>"}<a href="${c.H}calendar/${ym}.html">${ja ? `${monthLabel(ym)}の一覧` : h.toMonth(monthLabel(ym))}</a>${next ? `<a href="${c.H}${weekHref(next.w, E)}">${weekLabel(next.w)} →</a>` : "<span></span>"}</nav>`;
    const sec = (inner, extra = "") => `<section class="section section-tight"${extra}>${inner}</section>`;
    const secH = (txt) => `<div class="section-head"><h2>${txt}</h2></div>`;
    // 日本語：注目5選（ひとことつき）→ 全部 → メーカー別 → 再販
    const jaBlocks = !ja ? "" : (() => {
      const picks = list.slice(0, Math.min(5, n));
      const pickHtml = picks.map((it, i) => {
        const ch = charaOf(it);
        const subj = ch ? charaLabel(ch, lang) : genreLabel(genreOf(it.genre), lang);
        const spec = [Number(it.price) > 0 ? `1回${it.price}円` : "", it.lineup ? `全${it.lineup}種` : ""].filter(Boolean).join("・");
        const cap = [subj ? `${subj}のガチャ` : "", spec, it.maker || ""].filter(Boolean).join("。");
        // 5枚とも遅延読み込みしない（1枚目は先に読む）
        const cd = card(it, c, i).replace('loading="lazy"', 'loading="eager"');
        return `<div class="wk-pick">${cd}<p class="wk-cap" style="margin:6px 2px 0;font-size:.85em;line-height:1.5;color:var(--muted)">${esc(cap)}</p></div>`;
      }).join("");
      const makers = new Map();
      for (const it of list) { if (!makers.has(it.maker)) makers.set(it.maker, []); makers.get(it.maker).push(it); }
      const mk = [...makers].sort((a, b) => b[1].length - a[1].length);
      const mkNav = `<p class="hub-links">${mk.map(([m, l], i) => `<a href="#mk${i + 1}">${esc(m)}<small>${l.length}件</small></a>`).join("")}</p>`;
      const mkList = mk.map(([m, l], i) => `<div id="mk${i + 1}" style="margin-top:18px"><h3 style="font-size:1.05em;margin:0 0 6px">${esc(m)}（${l.length}件）<a class="more" style="font-size:.8em;margin-left:8px" href="${c.H}maker/${makerSlug(m)}.html">${esc(m)}のガチャ一覧 →</a></h3><ul style="margin:0;padding-left:1.2em;line-height:1.8">${l.map((it) => `<li><a href="${c.H}item/${it.id}.html">${esc(nameOf(it, lang))}</a>（${Number(it.price) > 0 ? `${it.price}円` : "価格未定"}）</li>`).join("")}</ul></div>`).join("");
      const re = list.filter((it) => P.isReissue(it));
      return [
        sec(`${secH(w.key === WEEK.key ? "今週の注目5選" : "この週の注目5選")}<div class="grid">${pickHtml}</div>`, ' style="padding-top:28px"'),
        sec(`${secH(`この週に発売のガチャ（${n}件）`)}<div class="grid">${list.map((it) => card(it, c)).join("")}</div>`),
        sec(`${secH("メーカー別")}${mkNav}${mkList}`),
        re.length ? sec(`${secH("この週の再販")}<div class="grid">${re.map((it) => card(it, c)).join("")}</div><p class="hub-links"><a href="${c.H}saihan.html">再販・復刻の一覧 →</a></p>`) : "",
      ].join("\n  ");
    })();
    // 日本語以外：同じ組み立て（注目5選 → 全部 → メーカー別 → 再販）。その言語の名前がある商品だけ
    const wk = t.wk || {};
    const named = ja ? list : list.filter((it) => hasName(it, lang));
    const xBlocks = ja ? "" : (() => {
      const nn = named.length;
      if (!nn) return "";
      const picks = named.slice(0, Math.min(5, nn));
      const pickHtml = picks.map((it, i) => {
        const ch = charaOf(it);
        const subj = ch ? charaLabel(ch, lang) : genreLabel(genreOf(it.genre), lang);
        const cap = [subj ? wk.capSubj(subj) : "", Number(it.price) > 0 ? wk.price(it.price) : "", it.lineup ? t.lineup(it.lineup) : "", makerOf(it, lang)].filter(Boolean).join(wk.sep);
        const cd = card(it, c, i).replace('loading="lazy"', 'loading="eager"');
        return `<div class="wk-pick">${cd}<p class="wk-cap" style="margin:6px 2px 0;font-size:.85em;line-height:1.5;color:var(--muted)">${esc(cap)}</p></div>`;
      }).join("");
      const makers = new Map();
      for (const it of named) { if (!makers.has(it.maker)) makers.set(it.maker, []); makers.get(it.maker).push(it); }
      const mk = [...makers].sort((a, b) => b[1].length - a[1].length).map(([m, l]) => [m, makerOf(l[0], lang), l]);
      const mkNav = `<p class="hub-links">${mk.map(([, ml, l], i) => `<a href="#mk${i + 1}">${esc(ml)}<small>${esc(wk.count(l.length))}</small></a>`).join("")}</p>`;
      const pr = (it) => (Number(it.price) > 0 ? `¥${it.price}` : (t.u && t.u.priceTba) || "TBA");
      const mkList = mk.map(([m, ml, l], i) => `<div id="mk${i + 1}" style="margin-top:18px"><h3 style="font-size:1.05em;margin:0 0 6px">${esc(wk.makerH(ml, l.length))}<a class="more" style="font-size:.8em;margin-left:8px" href="${c.H}maker/${makerSlug(m)}.html">${esc(wk.makerMore(ml))}</a></h3><ul style="margin:0;padding-left:1.2em;line-height:1.8">${l.map((it) => `<li><a href="${c.H}item/${it.id}.html">${esc(nameOf(it, lang))}</a>${esc(wk.priceIn(pr(it)))}</li>`).join("")}</ul></div>`).join("");
      const re = named.filter((it) => P.isReissue(it));
      return [
        sec(`${secH(esc(w.key === WEEK.key ? wk.top5Now : wk.top5))}<div class="grid">${pickHtml}</div>`, ' style="padding-top:28px"'),
        sec(`${secH(esc(wk.allH(nn)))}<div class="grid">${named.map((it) => card(it, c)).join("")}</div>`),
        sec(`${secH(esc(wk.makersH))}${mkNav}${mkList}`),
        re.length ? sec(`${secH(esc(wk.reH))}<div class="grid">${re.map((it) => card(it, c)).join("")}</div>${lang === "en" ? `<p class="hub-links"><a href="${c.H}saihan.html">${esc(wk.reMore)}</a></p>` : ""}`) : "",
      ].join("\n  ");
    })();
    // 日本語以外：旅行者向けのひとこと（駅からさがすへのリンクつき）
    const intro = ja || !wk.intro ? "" : (() => {
      const [a, b, z] = wk.intro(lang === "en" ? enRange(w.range) : w.range, named.length);
      return `<p class="lead">${esc(a)}<a href="${c.H}station.html">${esc(b)}</a>${esc(z)}</p>`;
    })();
    const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.H}calendar.html">${t.calH1}</a><span>/</span><a href="${c.H}calendar/${ym}.html">${esc(monthLabel(ym))}</a><span>/</span><span>${esc(lab)}</span></nav>
  <header class="page-head"><h1>${esc(h1)}</h1><p class="hub-sub">${ja ? `${n}シリーズ` : h.weekSub(n)}${badge}</p><p class="lead">${esc(lead)}</p>${intro}${updatedLine(list, lang)}</header>
  ${pager}
  ${ja ? jaBlocks : xBlocks || `<section class="section" style="padding-top:28px"><div class="grid">${list.map((it, i) => card(it, c, i)).join("")}</div></section>`}
  ${pager}
</div>`;
    // 今週・来週の週ページは /week・/next-week と中身が同じになるので、その間は検索に出さない（Google が重複と判断していたため。週が過ぎたら自動で戻る）
    layout({ rel, title, description: desc, body, current: "calendar", lastmod: maxAdded(list), noindex: w.key === WEEK.key || w.key === NEXT_WEEK.key || n < 2 /* 1件しか載っていない週は検索に出さない */,
      jsonld: [crumbs([[t.home, "index.html"], [t.calH1, "calendar.html"], [monthLabel(ym), `calendar/${ym}.html`], [lab]]), itemList(list),
        collectionLd({ name: h1, url: canonical(lang, rel), list, inLanguage: t.htmlLang, siteUrl: SITE_URL })] });
  });

  /* ===== シリーズ（日本語・英語） ===== */
  if (lang === "ja" || lang === "en") {
    const alts = ["ja", "en"];
    const L = (l) => (ja ? l.label : l.en);
    const relOf = (it) => { const s = E.weekStartOf(it); if (!s) return t.month(it.release); const w = E.weekInfo(s); return ja ? `${w.y}年${w.m}月第${w.no}週` : `${t.month(it.release)} (wk ${w.no})`; };
    const thumbImg = (it, c) => it.image ? `<img src="${esc(/^https?:/.test(it.image) ? it.image : c.R + thumbOf(it.image))}" alt="" width="48" height="48" loading="lazy" decoding="async">` : `<span class="ct-noimg" aria-hidden="true"></span>`;
    const table = (l, rows, c, latest) => `<div class="ct-wrap"><table class="ct">
      <thead><tr>${l.kind === "vol" ? `<th>${ja ? "弾" : "#"}</th>` : ""}<th>${ja ? "商品名" : "Name"}</th><th>${ja ? "発売" : "Release"}</th><th>${ja ? "値段" : "Price"}</th><th>${ja ? "種類" : "Designs"}</th></tr></thead>
      <tbody>${rows.map((it) => { const up = P.isUpcoming(it), re = P.isReissue(it); return `<tr${it === latest ? ' class="is-latest"' : up ? ' class="is-next"' : ""}>${l.kind === "vol" ? `<td class="ct-vol">${l.vols.get(it) || "–"}</td>` : ""}<td class="ct-name"><a href="${c.H}item/${it.id}.html">${thumbImg(it, c)}<span>${esc(nameOf(it, lang))}${it === latest ? `<em class="ct-tag">${ja ? "最新作" : h.latest}</em>` : up ? `<em class="ct-tag ct-up">${ja ? "次回作" : h.upcoming}</em>` : ""}${re ? `<em class="ct-tag ct-re">${ja ? "再販" : h.reissue}</em>` : ""}</span></a></td><td class="ct-rel">${esc(relOf(it))}</td><td class="ct-p">¥${it.price}</td><td class="ct-n">${it.lineup ? (ja ? `全${it.lineup}種` : t.lineup(it.lineup)) : "–"}</td></tr>`; }).join("")}</tbody></table></div>`;
    for (const l of P.lines) {
      const rel = `collection/${l.slug}.html`, c = ctx(rel), n = l.list.length;
      // 新しい順（続きものは番号の大きい順）
      const desc = l.kind === "vol" ? [...l.list].sort((a, b) => l.vols.get(b) - l.vols.get(a)) : [...l.list].reverse();
      const upcoming = desc.filter((it) => P.isUpcoming(it));
      const latest = desc.find((it) => !P.isUpcoming(it));
      const from = monthLabel(l.list[0].release), newest = latest || desc[0];
      const title = ja ? `${l.label} 歴代シリーズ一覧（全${n}作）｜第1弾から最新作まで` : h.colTitle(l.en, n);
      const lead = ja
        ? `${l.label}のガチャガチャを発売の新しい順にまとめました（当サイトに載っている${from}以降の${n}作）。${latest ? `最新作は「${latest.name}」（${relOf(latest)}・1回${latest.price}円）。` : ""}${upcoming.length ? `次回作は${upcoming.length}作が発売予定です。` : ""}`
        : h.colLead(l.en, n, from, latest ? nameOf(latest, lang) : "", upcoming.length);
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.H}collection.html">${ja ? "シリーズ一覧" : h.colIdxH1}</a><span>/</span><span>${esc(L(l))}</span></nav>
  <header class="page-head"><h1>${esc(ja ? `${l.label} 歴代シリーズ` : h.colH1(l.en))}</h1><p class="hub-sub">${ja ? `全${n}作・最新は${t.month(newest.release)}` : h.colSub(n, t.month(newest.release))}</p><p class="lead">${esc(lead)}</p></header>
  ${upcoming.length ? `<section class="section section-tight"><div class="section-head"><h2>${ja ? "次回作（発売予定）" : h.upcomingH}</h2></div><div class="grid">${[...upcoming].reverse().slice(0, 6).map((it, i) => card(it, c, i)).join("")}</div></section>` : ""}
  ${latest ? `<section class="section section-tight"><div class="section-head"><h2>${ja ? "最新作" : h.latest}</h2></div><div class="grid">${card(latest, c, Math.min(upcoming.length, 6))}</div></section>` : ""}
  <section class="section section-tight"><div class="section-head"><h2>${ja ? `歴代の${l.label}（新しい順）` : h.allH(l.en)}</h2></div>${table(l, desc, c, latest)}</section>
</div>`;
      // 英語版は英語名が3作未満だと noindex。そのときは日本語版からも hreflang を出さない（noindex のページを hreflang の先にしない）
      const enOk = l.list.filter((it) => hasName(it, "en")).length >= MIN_LINE;
      layout({ rel, title, description: lead, body, current: "genre", alts: enOk ? alts : ["ja"], only: alts, lastmod: maxAdded(l.list), noindex: !ja && !enOk,
        jsonld: [crumbs([[t.home, "index.html"], [ja ? "シリーズ一覧" : h.colIdxH1, "collection.html"], [L(l)]]), itemList(desc)] });
    }
    {
      const rel = "collection.html", c = ctx(rel);
      const list = [...P.lines].sort((a, b) => b.list.length - a.list.length);
      const title = ja ? "ガチャガチャのシリーズ一覧（めじるしアクセサリー・まちぼうけなど）｜歴代作品・最新作" : h.colIdxTitle;
      const lead = ja ? `めじるしアクセサリー・まちぼうけ・肩ズンFig.など、作品をこえて続いている定番のガチャ${list.length}シリーズ。歴代の作品と最新作・次回作を発売順にまとめています。` : h.colIdxLead(list.length);
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>${ja ? "シリーズ一覧" : h.colIdxH1}</span></nav>
  <header class="page-head"><h1>${ja ? "シリーズから探す" : h.colIdxH1}</h1><p class="lead">${esc(lead)}</p></header>
  <section class="section" style="padding-top:28px"><div class="col-list">${list.map((l) => { const lt = [...l.list].reverse().find((it) => !P.isUpcoming(it)) || l.list[l.list.length - 1]; return `<a class="col-tile" href="${c.H}collection/${l.slug}.html"><b>${esc(L(l))}</b><small>${ja ? `全${l.list.length}作` : h.works(l.list.length)}</small><span>${ja ? "最新：" : h.latestShort}${esc(nameOf(lt, lang))}</span></a>`; }).join("")}</div></section>
</div>`;
      layout({ rel, title, description: lead, body, current: "genre", alts, only: alts, lastmod: maxAdded(P.lines.flatMap((l) => l.list)), jsonld: [crumbs([[t.home, "index.html"], [ja ? "シリーズ一覧" : h.colIdxH1]])] });
    }

    /* ===== 再販・復刻 ===== */
    {
      const rel = "saihan.html", c = ctx(rel);
      const RE = P.reissues;
      const baseName = (s) => String(s).normalize("NFKC").replace(/【[^】]*】/g, " ").replace(/[（(][^）)]*(?:再販|再生産|復刻)[^）)]*[）)]/g, " ").replace(/\s+/g, " ").trim();
      const origIndex = new Map();
      for (const it of items) if (!P.isReissue(it)) { const b = baseName(it.name); if (!origIndex.has(b)) origIndex.set(b, it); }
      const prevOf = (it) => {
        const o = origIndex.get(baseName(it.name));
        if (o && o !== it) return { it: o };
        const parts = String(it.release_note || "").split("・");
        return parts.length > 1 && /再発売/.test(parts[parts.length - 1]) ? { txt: parts.slice(0, -1).join("・").replace(/発売$/, "") } : null;
      };
      const calM = (it) => { const s = E.weekStartOf(it); return s ? s.toISOString().slice(0, 7) : it.release; };
      const months = [...new Set(RE.map(calM))].sort().reverse();
      const relOf = (it) => { const s = E.weekStartOf(it); if (!s) return t.month(it.release); const w = E.weekInfo(s); return ja ? `${w.m}月第${w.no}週（${w.range}）` : `${h.weekLabel(w.m, w.no)} (${w.range})`; };
      const [ty, tm] = thisMonth.split("-").map(Number);
      const title = ja ? `【${ty}年${tm}月】再販・復刻されるガチャガチャ一覧｜前回発売・値段` : h.saihanTitle(t.month(thisMonth));
      const lead = ja ? `再販・再生産・復刻・再発売のガチャガチャ${RE.length}シリーズを、発売月ごとにまとめました。前回の発売がわかるものは、もとの商品へのリンクか前回の発売時期を載せています。「オフィシャルショップ限定再販」は、ガシャポンバンダイオフィシャルショップなど一部のお店だけでの再販です。` : h.saihanLead(RE.length);
      const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><span>${ja ? "再販・復刻" : h.saihanH1}</span></nav>
  <header class="page-head"><h1>${ja ? "再販・復刻ガチャ" : h.saihanH1}</h1><p class="hub-sub">${ja ? `${RE.length}シリーズ` : h.weekSub(RE.length)}</p><p class="lead">${esc(lead)}</p></header>
  ${months.map((m) => { const rows = RE.filter((it) => calM(it) === m); return `<section class="section section-tight" id="m${m}"><div class="section-head"><h2>${esc(monthLabel(m))}${ja ? "の再販" : ""}<small class="hub-n">${ja ? `${rows.length}件` : rows.length}</small></h2><a class="more" href="${c.H}calendar/${m}.html">${ja ? "この月のカレンダー" : h.toMonth(monthLabel(m))}</a></div>
    <div class="ct-wrap"><table class="ct"><thead><tr><th>${ja ? "商品名" : "Name"}</th><th>${ja ? "再販の発売" : "Reissue"}</th><th>${ja ? "値段" : "Price"}</th><th>${ja ? "前回の発売" : "Original"}</th></tr></thead><tbody>${rows.map((it) => { const pv = prevOf(it); return `<tr${P.isUpcoming(it) ? ' class="is-next"' : ""}><td class="ct-name"><a href="${c.H}item/${it.id}.html">${thumbImg(it, c)}<span>${esc(nameOf(it, lang))}</span></a></td><td class="ct-rel">${esc(relOf(it))}</td><td class="ct-p">¥${it.price}</td><td class="ct-orig">${pv ? (pv.it ? `<a href="${c.H}item/${pv.it.id}.html">${esc(t.month(pv.it.release))}${ja ? "の商品" : ""} →</a>` : esc(pv.txt)) : "–"}</td></tr>`; }).join("")}</tbody></table></div></section>`; }).join("")}
</div>`;
      layout({ rel, title, description: lead.split("。").slice(0, 2).join("。") + (ja ? "。" : ""), body, current: "calendar", alts, only: alts, lastmod: maxAdded(RE), jsonld: [crumbs([[t.home, "index.html"], [ja ? "再販・復刻" : h.saihanH1]]), itemList(RE)] });
    }
  }

  /* ===== 値段ごと（日本語だけ） ===== */
  if (ja) {
    for (const p of PRICES(items)) {
      const all = items.filter((it) => it.price === p).sort(byNewest);
      const c = ctx(`price/${p}.html`);
      listPage(`price/${p}.html`, {
        title: `${p}円のガチャガチャ新作一覧（${all.length}シリーズ）`, h1: `${p}円のガチャ`, sub: `${all.length}シリーズ・新しい順`,
        lead: `1回${p}円のガチャガチャ${all.length}シリーズのうち、新しい${Math.min(150, all.length)}件をサイトに載った順に並べています。それより前のものは発売カレンダーの月ごとのページで見られます。`,
        list: all.slice(0, 150), current: "calendar", jaOnly: true,
        extra: `<p class="hub-links">${PRICES(items).map((q) => q === p ? `<span class="cur">${q}円</span>` : `<a href="${c.H}price/${q}.html">${q}円</a>`).join("")}<a href="${c.H}calendar.html">発売カレンダー →</a></p>`,
      });
    }
  }
};
// 20シリーズ以上ある値段
const PRICES = (items) => { const n = {}; for (const it of items) n[it.price] = (n[it.price] || 0) + 1; return Object.keys(n).map(Number).filter((p) => p > 0 && n[p] >= 20).sort((a, b) => a - b); };

/* ---------- ほかのページに足す小さな部品 ---------- */
// 商品ページ：シリーズの前作・次作
const seriesNav = (P, it, { lang, c, t, nameOf, esc }) => {
  const s = P.seqOf.get(it) || P.lineSeq.get(it);
  const line = P.lineOf.get(it);
  if (!s && !line) return "";
  const ja = lang === "ja", h = t.hub;
  const showLine = line && (lang === "ja" || lang === "en");
  const label = !s ? "" : ja ? s.label : s.line ? s.en : P.volOf(nameOf(it, lang)).base;
  // 中国語・韓国語では、型の名前（英語）を出さずに「同じシリーズの」とだけ書く
  const head = ja ? `シリーズの前作・次作（${esc(label)}）` : s && s.line && !showLine ? esc(h.seqH0) : esc(h.seqH(label));
  const a = (x, k) => x ? `<a class="sn-${k}" href="${c.H}item/${x.id}.html"><small>${k === "prev" ? (ja ? "← 前作" : `← ${h.prevItem}`) : (ja ? "次作 →" : `${h.nextItem} →`)}</small><span>${esc(nameOf(x, lang))}</span></a>` : `<span class="sn-${k} sn-none"></span>`;
  return `<nav class="series-nav" aria-label="${ja ? "シリーズの前作・次作" : head}">
    ${s && (s.prev || s.next) ? `<p class="sn-h">${head}</p><div class="sn-pair">${a(s.prev, "prev")}${a(s.next, "next")}</div>` : ""}
    ${showLine ? `<a class="sn-all" href="${c.H}collection/${line.slug}.html">${ja ? `${esc(line.label)}の歴代シリーズ一覧（全${line.list.length}作）→` : esc(h.colLink(line.en, line.list.length))}</a>` : ""}
  </nav>`;
};
// 月のページ：週ごとのページへの目次
const weekIndex = (P, ym, { lang, c, t, WEEK, NEXT_WEEK }) => {
  const ws = P.weekList.filter((g) => ymOf(g.w) === ym);
  if (!ws.length) return "";
  const ja = lang === "ja", h = t.hub;
  return `<nav class="hub-links week-idx" aria-label="${ja ? "週ごとのページ" : h.weekIdx}"><b>${ja ? "週ごとのページ" : h.weekIdx}</b>${ws.map((g) => `<a href="${c.H}${weekHref(g.w, { WEEK, NEXT_WEEK })}"${g.w.key === WEEK.key ? ' class="on"' : ""}>${ja ? `第${g.w.no}週` : h.weekShort(g.w.no)}<small>${g.w.range}・${g.list.length}${ja ? "件" : ""}</small></a>`).join("")}</nav>`;
};
// 月のページ：その月に多いキャラクター・作品（上位5つ）
const monthTops = (list, { CHARAS }) => CHARAS.filter((ch) => ch.slug !== "mejirushi").map((ch) => [ch, list.filter((it) => ch.list.includes(it)).length]).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);

module.exports = { prepare, build, seriesNav, weekIndex, weekRel, weekHref, monthTops, PRICES, isReissue, updatedLine, collectionLd };
