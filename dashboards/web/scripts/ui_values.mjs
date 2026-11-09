// Dumps the visible text of each page (default filters) as JSON, so numbers shown in the UI can be compared with SQL.
// Usage: BASE_URL=... node scripts/ui_values.mjs > ui_values.json
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:4173/wm-client-analytics/";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 3000 }, colorScheme: "dark" })).newPage();
const out = {};
for (const [name, hash] of [["executive", "#/"], ["client-health", "#/client-health"], ["advisors", "#/advisors"], ["data-quality", "#/data-quality"]]) {
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.waitForSelector("main h1");
  await page.waitForTimeout(1500);
  out[name] = {
    takeaway: await page.locator("[data-testid=takeaway]").innerText(),
    tiles: await page.locator("[data-testid=kpi-tile]").allInnerTexts(),
    main: await page.locator("main").innerText(),
  };
}
console.log(JSON.stringify(out));
await browser.close();
