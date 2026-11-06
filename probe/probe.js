const urls = ["https://kitan.jp/","https://kitan.jp/products/","https://epoch.jp/ct/","https://www.epoch.jp/ct/","https://capsule.epoch.jp/","https://kenelephant.co.jp/","https://kenelephant.co.jp/capsule/","https://www.toysspirits.co.jp/","https://toysspirits.co.jp/","https://so-ta.jp/","https://www.so-ta.jp/","https://qualia-45.jp/","https://bushiroad-creative.com/","https://www.j-dream.co.jp/","https://www.yell-japan.co.jp/","https://tarlin.co.jp/","https://www.kaiyodo.co.jp/"];
const UA = "Mozilla/5.0 (compatible; GachaSiteBot/1.0; +https://gachapla.com)";
(async () => {
  const out = [];
  const robotsSeen = new Set();
  for (const u of urls) {
    const o = { u };
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA }, redirect: "follow" });
      o.status = r.status; o.final = r.url;
      const h = await r.text();
      o.title = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim().slice(0, 80);
      const links = [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      o.nlinks = links.length;
      o.sample = [...new Set(links.filter((l) => /item|product|lineup|capsule|gacha|detail|new|schedule|calendar|release/i.test(l)))].slice(0, 25);
      const host = new URL(r.url).origin;
      if (!robotsSeen.has(host)) { robotsSeen.add(host); try { const rr = await fetch(host + "/robots.txt", { headers: { "User-Agent": UA } }); o.robots = rr.status + " " + (await rr.text()).slice(0, 400); } catch (e) { o.robots = "ERR " + e.message; } }
    } catch (e) { o.err = e.message; }
    out.push(o);
    await new Promise((r) => setTimeout(r, 1500));
  }
  require("fs").writeFileSync("probe/result.json", JSON.stringify(out, null, 1));
})();
