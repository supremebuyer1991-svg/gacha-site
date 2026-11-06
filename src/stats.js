/*
 * ガチャガチャ新作の統計ページ /stats（日本語・英語。build.js から呼ぶ）
 * items.json だけから、ビルドのたびに計算する：月ごとのシリーズ数・平均価格・価格帯の割合・500円以上の割合・
 * メーカーの割合・多いキャラクター（今月・先月）・全◯種の平均・再販の数。グラフはCSSだけ（外部ライブラリなし）、下に表
 * 英語の文言もここに直接書く（このページは日本語・英語だけ）
 */
const BUCKETS = [
  ["le200", (p) => p < 300, "200円以下", "¥200 or less"],
  ["p300", (p) => p >= 300 && p < 400, "300円", "¥300"],
  ["p400", (p) => p >= 400 && p < 500, "400円", "¥400"],
  ["p500", (p) => p >= 500 && p < 600, "500円", "¥500"],
  ["ge600", (p) => p >= 600, "600円以上", "¥600+"],
];
const MAX_MONTHS = 12;
const MIN_SERIES = 100; // これより少ない月（データの集め始めでメーカーがそろっていない月など）は出さない

// 言語に関係ない集計（1回だけ）
const compute = ({ items, weekStartOf, isReissue, CHARAS, thisMonth }) => {
  const calM = (it) => { const s = weekStartOf(it); return s ? s.toISOString().slice(0, 7) : it.release; };
  const by = new Map();
  for (const it of items) { const m = calM(it); if (!by.has(m)) by.set(m, []); by.get(m).push(it); }
  const months = [...by.keys()].filter((m) => m <= thisMonth && by.get(m).length >= MIN_SERIES).sort().slice(-MAX_MONTHS);
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const row = (m) => {
    const list = by.get(m) || [], priced = list.filter((it) => it.price > 0), lu = list.filter((it) => Number(it.lineup) > 0);
    const makers = {};
    for (const it of list) makers[it.maker] = (makers[it.maker] || 0) + 1;
    return {
      month: m, n: list.length,
      avg: priced.length ? Math.round(priced.reduce((s, it) => s + it.price, 0) / priced.length) : 0,
      buckets: BUCKETS.map(([k, f]) => ({ k, n: priced.filter((it) => f(it.price)).length, pct: pct(priced.filter((it) => f(it.price)).length, priced.length) })),
      over500: pct(priced.filter((it) => it.price >= 500).length, priced.length),
      lineupAvg: lu.length ? Math.round((lu.reduce((s, it) => s + Number(it.lineup), 0) / lu.length) * 10) / 10 : 0,
      reissue: list.filter(isReissue).length,
      makers: Object.entries(makers).sort((a, b) => b[1] - a[1]).map(([name, k]) => ({ name, n: k, pct: pct(k, list.length) })),
      tops: CHARAS.filter((ch) => ch.slug !== "mejirushi").map((ch) => [ch, list.filter((it) => ch.list.includes(it)).length]).filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  };
  const rows = months.map(row);
  const all = (() => {
    const priced = items.filter((it) => it.price > 0), makers = {};
    for (const it of items) makers[it.maker] = (makers[it.maker] || 0) + 1;
    return { n: items.length, makers: Object.entries(makers).sort((a, b) => b[1] - a[1]).map(([name, k]) => ({ name, n: k, pct: pct(k, items.length) })),
      buckets: BUCKETS.map(([k, f]) => ({ k, n: priced.filter((it) => f(it.price)).length, pct: pct(priced.filter((it) => f(it.price)).length, priced.length) })) };
  })();
  const ci = rows.length - 1; // 今月（今月の行がなければいちばん新しい月）
  return { rows, all, cur: rows[ci], prev: ci > 0 ? rows[ci - 1] : null };
};

const build = (S, E) => {
  const { lang, layout, ctx, esc, canonical, t, today, MONTH_EN, charaLabel, makerOf, write, SITE_URL, site } = E;
  const ja = lang === "ja", rel = "stats.html", c = ctx(rel);
  const { rows, cur, prev, all } = S;
  if (!cur) return;
  const mLab = (ym) => { const [y, m] = ym.split("-").map(Number); return ja ? `${y}年${m}月` : `${MONTH_EN[m - 1]} ${y}`; };
  const mShort = (ym) => { const [y, m] = ym.split("-").map(Number); return ja ? `${m}月` : MONTH_EN[m - 1]; };
  const [ty, tm, td] = today.split("-").map(Number);
  const asOf = ja ? `${ty}年${tm}月${td}日時点` : `as of ${MONTH_EN[tm - 1]} ${td}, ${ty}`;
  const bl = (k) => { const b = BUCKETS.find((x) => x[0] === k); return ja ? b[2] : b[3]; };
  const yen = (n) => (ja ? `${n.toLocaleString("ja-JP")}円` : `¥${n.toLocaleString("en-US")}`);
  const mk = (name) => makerOf(name); // 呼ぶ側の言語のメーカー名（エスケープは使うところで）
  const topB = [...cur.buckets].sort((a, b) => b.n - a.n)[0];
  const curLab = mLab(cur.month), prevLab = prev ? mLab(prev.month) : "";

  // 見出しの数字（要約）
  const summary = ja
    ? `${curLab}の新作は${cur.n}シリーズ（${asOf}、当サイトに載っている発売予定もふくむ）。平均価格は${cur.avg}円で、500円以上が${cur.over500}%。いちばん多い価格帯は${bl(topB.k)}（${topB.pct}%）です。${prev ? `先月（${prevLab}）は${prev.n}シリーズ・平均${prev.avg}円・500円以上${prev.over500}%でした。` : ""}メーカー別では${cur.makers[0] ? `${mk(cur.makers[0].name)}が${cur.makers[0].pct}%` : ""}、全◯種の平均は${cur.lineupAvg}種、再販・復刻は${cur.reissue}シリーズです。`
    : `${cur.n} new gacha series are listed for ${curLab} (${asOf}, including scheduled releases). The average price is ¥${cur.avg} per play, and ${cur.over500}% cost ¥500 or more. The most common price is ${bl(topB.k)} (${topB.pct}%).${prev ? ` Last month (${prevLab}) had ${prev.n} series, averaging ¥${prev.avg} with ${prev.over500}% at ¥500+.` : ""}${cur.makers[0] ? ` ${mk(cur.makers[0].name)} made ${cur.makers[0].pct}% of them;` : ""} the average set has ${cur.lineupAvg} designs, and ${cur.reissue} series are reissues.`;

  // 横棒グラフ（1つの量：1色）。title で値が出る（ホバー）
  const bars = (data, max, fmt, aria) => `<div class="st-bars" role="img" aria-label="${esc(aria)}">${data.map(([lab, v]) => `<div class="st-bar" title="${esc(`${lab}: ${fmt(v)}`)}"><span class="st-bl">${esc(lab)}</span><span class="st-bt"><i style="width:${max ? Math.max(1.5, (v / max) * 100).toFixed(1) : 0}%"></i></span><b>${esc(fmt(v))}</b></div>`).join("")}</div>`;
  // 積み上げ横棒（価格帯：安い→高いを薄い→濃いの1色相で）
  const stack = (bk, lab) => `<div class="st-stack" title="${esc(lab)}">${bk.filter((b) => b.pct > 0).map((b) => `<i class="sb-${b.k}" style="width:${b.pct}%" title="${esc(`${lab} ${bl(b.k)}: ${b.pct}%`)}"></i>`).join("")}</div>`;
  const legend = `<ul class="st-legend">${BUCKETS.map(([k]) => `<li><i class="sb-${k}"></i>${esc(bl(k))}</li>`).join("")}</ul>`;
  const table = (cap, head, body) => `<div class="ct-wrap st-tw"><table class="ct st-t"><caption>${esc(cap)}</caption><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((x, i) => (i ? `<td>${esc(x)}</td>` : `<th scope="row">${esc(x)}</th>`)).join("")}</tr>`).join("")}</tbody></table></div>`;
  const maxN = Math.max(...rows.map((r) => r.n)), maxAvg = Math.max(...rows.map((r) => r.avg));
  const charaList = (r) => r && r.tops.length ? `<ol class="st-tops">${r.tops.map(([ch, k]) => `<li><a href="${c.H}chara/${ch.slug}.html">${esc(charaLabel(ch, lang))}</a><b>${k}${ja ? "シリーズ" : ""}</b></li>`).join("")}</ol>` : `<p class="fine">${ja ? "2シリーズ以上ある作品はまだありません。" : "No franchise has 2+ series yet."}</p>`;
  const sec = (h, inner) => `<section class="section section-tight st-sec"><h2>${esc(h)}</h2>${inner}</section>`;

  const L = ja ? {
    h1: "ガチャガチャ新作の統計（毎月更新）", series: "月ごとの新作シリーズ数", avg: "月ごとの平均価格（1回）", dist: "価格帯の割合（月ごと）", over: "500円以上の割合",
    maker: `メーカーの割合（${curLab}）`, makerAll: "メーカーの割合（当サイト全体）", tops: `多いキャラクター・作品（${curLab}）`, topsPrev: `多いキャラクター・作品（${prevLab}）`, lu: "全◯種の平均と再販の数",
    mo: "月", n: "シリーズ数", avgC: "平均価格", o500: "500円以上", luC: "全◯種の平均", reC: "再販・復刻", mkC: "メーカー", shareC: "割合", cntC: "シリーズ数",
    note: `集計のしかた：当サイトに載っているガチャガチャ${all.n}シリーズ（${asOf}）を、発売週（わからないものは発売月）で月ごとに数えています。値段は1回の価格、500円以上の割合は値段がわかるものの中での割合です。発売予定のものもふくむので、今月・来月の数は増えることがあります。シリーズ数が${MIN_SERIES}未満の月（集め始めの月）はのぞいています。`,
    links: "関連ページ",
  } : {
    h1: "Gacha new release stats (updated monthly)", series: "New series per month", avg: "Average price per play by month", dist: "Price mix by month", over: "Share of ¥500+ gacha",
    maker: `Makers (${curLab})`, makerAll: "Makers (all series on this site)", tops: `Top characters & franchises (${curLab})`, topsPrev: `Top characters & franchises (${prevLab})`, lu: "Average set size & reissues",
    mo: "Month", n: "Series", avgC: "Avg. price", o500: "¥500+", luC: "Avg. designs", reC: "Reissues", mkC: "Maker", shareC: "Share", cntC: "Series",
    note: `How we count: all ${all.n} gacha series listed on this site (${asOf}), grouped by release week (or release month when the week is unknown). Prices are per play; the ¥500+ share is among series with a known price. Scheduled releases are included, so this month's and next month's counts can still grow. Months with fewer than ${MIN_SERIES} series (when we started collecting) are left out.`,
    links: "Related pages",
  };
  const title = ja ? `ガチャガチャの値段と新作数の統計【${ty}年${tm}月】平均価格・500円以上の割合` : `Gacha prices & new releases in Japan: stats (${MONTH_EN[tm - 1]} ${ty}) – average price, ¥500+ share`;
  const desc = summary.split(ja ? "。" : ". ").slice(0, 2).join(ja ? "。" : ". ") + (ja ? "。" : ".");

  const body = `<div class="wrap">
  <nav class="breadcrumb" aria-label="breadcrumb"><a href="${c.H}index.html">${t.home}</a><span>/</span><a href="${c.H}calendar.html">${t.calH1}</a><span>/</span><span>${esc(ja ? "統計" : "Stats")}</span></nav>
  <header class="page-head"><h1>${esc(L.h1)}</h1><p class="hub-sub">${esc(asOf)}</p></header>
  <div class="st-kpis">
    <div><small>${esc(ja ? `${curLab}の新作` : `New in ${curLab}`)}</small><b>${cur.n}</b><span>${esc(ja ? "シリーズ" : "series")}</span></div>
    <div><small>${esc(ja ? "平均価格" : "Avg. price")}</small><b>${esc(yen(cur.avg))}</b><span>${esc(prev ? (ja ? `先月 ${prev.avg}円` : `last month ¥${prev.avg}`) : "")}</span></div>
    <div><small>${esc(ja ? "500円以上" : "¥500 or more")}</small><b>${cur.over500}%</b><span>${esc(prev ? (ja ? `先月 ${prev.over500}%` : `last month ${prev.over500}%`) : "")}</span></div>
  </div>
  <p class="st-summary">${esc(summary)}</p>
  ${sec(L.series, bars(rows.map((r) => [mShort(r.month), r.n]), maxN, (v) => (ja ? `${v}シリーズ` : `${v}`), L.series))}
  ${sec(L.avg, bars(rows.map((r) => [mShort(r.month), r.avg]), maxAvg, yen, L.avg))}
  ${sec(L.dist, `${legend}<div class="st-stacks">${rows.map((r) => `<div class="st-srow"><span class="st-bl">${esc(mShort(r.month))}</span>${stack(r.buckets, mLab(r.month))}</div>`).join("")}</div>
    ${table(L.dist, [L.mo, ...BUCKETS.map(([k]) => bl(k))], rows.map((r) => [mLab(r.month), ...r.buckets.map((b) => `${b.pct}%`)]))}`)}
  ${sec(L.over, `${bars(rows.map((r) => [mShort(r.month), r.over500]), 100, (v) => `${v}%`, L.over)}
    ${table(L.series, [L.mo, L.n, L.avgC, L.o500, L.luC, L.reC], rows.map((r) => [mLab(r.month), String(r.n), yen(r.avg), `${r.over500}%`, ja ? `${r.lineupAvg}種` : String(r.lineupAvg), String(r.reissue)]))}`)}
  ${sec(L.lu, bars(rows.map((r) => [mShort(r.month), r.lineupAvg]), Math.max(...rows.map((r) => r.lineupAvg)), (v) => (ja ? `${v}種` : `${v}`), L.lu) + bars(rows.map((r) => [mShort(r.month), r.reissue]), Math.max(1, ...rows.map((r) => r.reissue)), (v) => (ja ? `再販${v}` : `${v} reissues`), L.reC))}
  ${sec(L.maker, `${bars(cur.makers.map((x) => [mk(x.name), x.pct]), 100, (v) => `${v}%`, L.maker)}
    ${table(L.makerAll, [L.mkC, L.cntC, L.shareC], all.makers.map((x) => [mk(x.name), String(x.n), `${x.pct}%`]))}`)}
  <div class="st-two">${sec(L.tops, charaList(cur))}${prev ? sec(L.topsPrev, charaList(prev)) : ""}</div>
  <p class="fine st-note">${esc(L.note)}</p>
  <p class="hub-links"><b>${esc(L.links)}</b><a href="${c.H}calendar.html">${esc(t.calH1)}</a><a href="${c.H}calendar/${cur.month}.html">${esc(curLab)}</a><a href="${c.H}saihan.html">${esc(ja ? "再販・復刻" : t.hub.saihanH1)}</a>${ja ? `<a href="${c.H}price/500.html">500円のガチャ</a>` : ""}<a href="${c.R}data/stats.json">JSON</a></p>
</div>`;

  const dataset = {
    "@context": "https://schema.org", "@type": "Dataset", name: L.h1, description: summary, url: canonical(lang, rel), inLanguage: ja ? "ja" : "en",
    creator: { "@type": "Organization", name: site.name, url: SITE_URL + "/" }, dateModified: today, isAccessibleForFree: true,
    temporalCoverage: `${rows[0].month}/${rows[rows.length - 1].month}`, spatialCoverage: { "@type": "Place", name: "Japan" },
    keywords: ja ? ["ガチャガチャ", "カプセルトイ", "値段", "平均価格", "新作数", "統計"] : ["gacha", "capsule toys", "Japan", "price", "statistics"],
    variableMeasured: ja ? ["新作シリーズ数", "平均価格（円）", "価格帯の割合", "500円以上の割合", "メーカーの割合", "全◯種の平均", "再販の数"] : ["New series", "Average price (JPY)", "Price mix", "Share of ¥500+", "Maker share", "Average designs per set", "Reissues"],
    distribution: [{ "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${SITE_URL}/data/stats.json` }],
  };
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: t.home, item: canonical(lang, "index.html") },
    { "@type": "ListItem", position: 2, name: t.calH1, item: canonical(lang, "calendar.html") },
    { "@type": "ListItem", position: 3, name: ja ? "統計" : "Stats" }] };
  layout({ rel, title, description: desc, body, current: "calendar", alts: ["ja", "en"], only: ["ja", "en"], lastmod: today, jsonld: [dataset, crumbs] });
  if (ja) write("data/stats.json", JSON.stringify({ generated: today, months: rows.map((r) => ({ month: r.month, series: r.n, avg_price: r.avg, over500_pct: r.over500, price_mix_pct: Object.fromEntries(r.buckets.map((b) => [b.k, b.pct])), lineup_avg: r.lineupAvg, reissues: r.reissue, makers: r.makers.map((x) => ({ name: x.name, series: x.n, pct: x.pct })), top_titles: r.tops.map(([ch, k]) => ({ name: ch.label, en: ch.en, series: k })) })) }));
};

module.exports = { compute, build };
