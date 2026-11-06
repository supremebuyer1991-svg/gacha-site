const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch();
  for (const [f, w, h, sc] of [["en-icon", 800, 800, 1], ["en-header", 1500, 500, 2]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: sc });
    await p.goto("file://" + path.resolve(__dirname, f + ".html"), { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.resolve(__dirname, f + ".png") });
  }
  await b.close();
})();
