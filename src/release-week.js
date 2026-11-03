// 発売週の数え方（サイト全体で共通）
// 週は月曜はじまり。その月の最初の月曜日から始まる週を「第1週」とする（例：2026年11月の第1週＝11/2〜11/8）。
// バンダイの「11月第2週」、タカラトミーアーツの「11月9日週」を、どちらも「その週の月曜日」にそろえる。
const DAY = 86400e3;
const mondayOf = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
const weekStartOf = (it) => {
  let n = it.release_note || "";
  // 再発売は再発売の週を使う（例「7月28日週発売・2026年11月9日週再発売」）
  const re = n.match(/(\d{4})年(\d+)月(\d+)日週再発売/);
  if (re) return mondayOf(new Date(Date.UTC(Number(re[1]), Number(re[2]) - 1, Number(re[3]))));
  const [ry, rm] = String(it.release || "").split("-").map(Number);
  if (!ry) return null;
  const yearFor = (mo) => (mo < rm - 6 ? ry + 1 : mo > rm + 6 ? ry - 1 : ry);
  let r = n.match(/(\d+)月第(\d)週/);
  if (r) {
    const mo = Number(r[1]), y = yearFor(mo);
    const first = new Date(Date.UTC(y, mo - 1, 1));
    const firstMon = 1 + ((8 - first.getUTCDay()) % 7);
    return new Date(Date.UTC(y, mo - 1, firstMon + 7 * (Number(r[2]) - 1)));
  }
  r = n.match(/(\d+)月(\d+)日週/);
  if (r) { const mo = Number(r[1]); return mondayOf(new Date(Date.UTC(yearFor(mo), mo - 1, Number(r[2])))); }
  return null;
};
const weekInfo = (mon) => {
  const sun = new Date(mon.getTime() + 6 * DAY);
  const md = (x) => `${x.getUTCMonth() + 1}/${x.getUTCDate()}`;
  return { key: mon.toISOString().slice(0, 10), y: mon.getUTCFullYear(), m: mon.getUTCMonth() + 1, no: Math.ceil(mon.getUTCDate() / 7), range: `${md(mon)}〜${md(sun)}` };
};
module.exports = { mondayOf, weekStartOf, weekInfo };
