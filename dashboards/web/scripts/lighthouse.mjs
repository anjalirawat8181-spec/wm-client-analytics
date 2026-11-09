// Runs Lighthouse (desktop and mobile) against each page of the preview server, REPEAT times, and reports the median of each score.
// Mobile uses Lighthouse's default 4x CPU slowdown and slow-4G throttling. This machine has run-to-run noise, hence the median.
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:4173/wm-client-analytics/";
const OUT = resolve(process.env.OUT ?? "../../docs/lighthouse_scores.json");
const REPEAT = Number(process.env.REPEAT ?? 3);
const allPages = [["executive", "#/"], ["client-health", "#/client-health"], ["advisors", "#/advisors"], ["data-quality", "#/data-quality"], ["methodology", "#/methodology"]];
const pages = process.env.ONLY ? allPages.filter(([n]) => n === process.env.ONLY) : allPages;
const candidates = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", chromium.executablePath()];
const chromePath = candidates.find((p) => p && existsSync(p));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const cfgFor = (form) => form === "desktop" ? { extends: "lighthouse:default", settings: { formFactor: "desktop", screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 } } } : undefined;
const results = [];
for (const form of (process.env.FORMS ?? "desktop,mobile").split(",")) {
  for (const [name, hash] of pages) {
    const runs = [];
    const failing = new Set();
    for (let i = 0; i < REPEAT; i++) {
      // A fresh browser per run, with one retry: headless Edge on Windows occasionally dies between runs.
      let r;
      for (let attempt = 0; attempt < 3 && !r; attempt++) {
        const chrome = await launch({ chromePath, chromeFlags: ["--headless=new", "--no-sandbox"] });
        try { r = await lighthouse(BASE + hash, { port: chrome.port, output: "json", onlyCategories: ["performance", "accessibility", "best-practices", "seo"], logLevel: "error" }, cfgFor(form)); }
        catch (e) { console.log("   retry after:", String(e).slice(0, 80)); }
        try { await chrome.kill(); } catch { /* EBUSY on the temp profile */ }
      }
      if (!r) throw new Error("Lighthouse failed 3 times");
      const c = r.lhr.categories;
      runs.push({ performance: Math.round(c.performance.score * 100), accessibility: Math.round(c.accessibility.score * 100), bestPractices: Math.round(c["best-practices"].score * 100), seo: Math.round(c.seo.score * 100),
        lcp: r.lhr.audits["largest-contentful-paint"].numericValue, tbt: r.lhr.audits["total-blocking-time"].numericValue });
      for (const a of Object.values(r.lhr.audits)) if (a.score !== null && a.score < 0.9 && a.scoreDisplayMode === "binary") failing.add(a.id);
    }
    const row = { form, page: name, runs: REPEAT, performance: median(runs.map((x) => x.performance)), performanceAllRuns: runs.map((x) => x.performance),
      accessibility: median(runs.map((x) => x.accessibility)), bestPractices: median(runs.map((x) => x.bestPractices)), seo: median(runs.map((x) => x.seo)),
      lcpMs: Math.round(median(runs.map((x) => x.lcp))), tbtMs: Math.round(median(runs.map((x) => x.tbt))), failingAudits: [...failing] };
    results.push(row);
    console.log(form.padEnd(8), name.padEnd(14), `perf ${row.performance} (${row.performanceAllRuns.join("/")}) a11y ${row.accessibility} bp ${row.bestPractices} seo ${row.seo} lcp ${row.lcpMs}ms tbt ${row.tbtMs}ms`, row.failingAudits.length ? `failing: ${row.failingAudits.join(",")}` : "");
  }
}
writeFileSync(OUT, JSON.stringify(results, null, 2));
