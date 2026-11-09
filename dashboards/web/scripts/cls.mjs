import { chromium } from "playwright";
const hash = process.argv[2] ?? "#/advisors";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, deviceScaleFactor: 1.75 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.enable");

await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__shifts.push({ v: e.value, t: Math.round(e.startTime), src: e.sources.map((s) => (s.node && (s.node.nodeName + "." + String(s.node.className).slice(0, 40))) + " " + JSON.stringify(s.previousRect) + "->" + JSON.stringify(s.currentRect)) });
    }
  }).observe({ type: "layout-shift", buffered: true });
});
if (process.env.DELAY_FONT) await page.route("**/*.woff2", async (route) => { await new Promise((r) => setTimeout(r, Number(process.env.DELAY_FONT))); await route.continue(); });
await page.goto("http://localhost:4173/wm-client-analytics/" + hash, { waitUntil: "load" });
await page.waitForTimeout(3500);
console.log(JSON.stringify(await page.evaluate(() => window.__shifts), null, 1));
await b.close();
