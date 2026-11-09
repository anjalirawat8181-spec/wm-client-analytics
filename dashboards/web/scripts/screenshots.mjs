// Screenshots all 5 pages in dark, light and a 390px mobile viewport, and fails on console errors or horizontal overflow.
// Usage: BASE_URL=http://localhost:4173/wm-client-analytics/ OUT=../../docs/screenshots node scripts/screenshots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:4173/wm-client-analytics/";
const OUT = resolve(process.env.OUT ?? "../../docs/screenshots");
const PREFIX = process.env.PREFIX ?? "";
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ["executive", "#/"],
  ["client-health", "#/client-health"],
  ["advisors", "#/advisors"],
  ["data-quality", "#/data-quality"],
  ["methodology", "#/methodology"],
];
const MODES = [
  { name: "dark", scheme: "dark", viewport: { width: 1440, height: 900 } },
  { name: "light", scheme: "light", viewport: { width: 1440, height: 900 } },
  { name: "mobile", scheme: "dark", viewport: { width: 390, height: 844 }, mobile: true },
];

const browser = await chromium.launch();
let problems = 0;
for (const mode of MODES) {
  const ctx = await browser.newContext({
    viewport: mode.viewport, colorScheme: mode.scheme, isMobile: !!mode.mobile, deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
  for (const [name, hash] of PAGES) {
    errors.length = 0;
    await page.goto(BASE + hash, { waitUntil: "networkidle" });
    await page.waitForSelector("main h1", { timeout: 20000 });
    // Charts mount lazily as they scroll into view, so show the whole page first, then wait for the charts.
    const full = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: mode.viewport.width, height: Math.min(full, 6000) });
    if (["executive", "client-health"].includes(name)) await page.waitForSelector(".recharts-surface", { timeout: 20000 });
    await page.waitForTimeout(3000); // let mount animations finish
    const charts = await page.locator(".recharts-surface").count();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    // A fullPage screenshot resizes the viewport, which restarts chart mount animations mid-capture. Resize first, wait, then capture.
    await page.screenshot({ path: `${OUT}/${PREFIX}${name}-${mode.name}.png` });
    await page.setViewportSize(mode.viewport);
    const bad = errors.length > 0 || overflow > 1;
    if (bad) problems++;
    console.log(`${bad ? "PROBLEM" : "ok     "} ${mode.name.padEnd(6)} ${name.padEnd(14)} charts=${charts} overflowPx=${overflow} errors=${errors.length}`);
    for (const e of errors) console.log("   console:", e.slice(0, 200));
  }
  await ctx.close();
}
await browser.close();
process.exit(problems ? 1 : 0);
