const fs = require("fs");
const UA = "Mozilla/5.0 (compatible; GachaSiteBot/1.0; +https://gachapla.com)";
const get = async (u) => { const r = await fetch(u, { headers: { "User-Agent": UA } }); return await r.text(); };
(async () => {
  fs.mkdirSync("probe/html", { recursive: true });
  const save = (n, h) => fs.writeFileSync("probe/html/" + n, h);
  const k = await get("https://kitan.jp/products/"); save("kitan-list.html", k);
  const kl = [...new Set([...k.matchAll(/href="(https:\/\/kitan\.jp\/products\/[^"\/?#]+\/)"/g)].map((m) => m[1]))].filter((u) => !/page|feed/.test(u));
  if (kl[0]) { await new Promise((r) => setTimeout(r, 1500)); save("kitan-item.html", await get(kl[0])); }
  await new Promise((r) => setTimeout(r, 1500));
  const q = await get("https://www.qualia-45.jp/"); save("qualia-top.html", q);
  await new Promise((r) => setTimeout(r, 1500));
  save("qualia-list.html", await get("https://www.qualia-45.jp/product/"));
  await new Promise((r) => setTimeout(r, 1500));
  save("qualia-item.html", await get("https://www.qualia-45.jp/product/view/2146"));
  await new Promise((r) => setTimeout(r, 1500));
  save("kene-new.html", await get("https://kenelestore.jp/collections/newsed"));
  await new Promise((r) => setTimeout(r, 1500));
  save("kene-item.html", await get("https://kenelestore.jp/products/gc0780c"));
  await new Promise((r) => setTimeout(r, 1500));
  save("epoch-products.html", await get("https://epoch.jp/products/"));
})();
