// Measures real page-load numbers from the running app in headless Chromium.
// Emulates a mid-range phone: 4x CPU slowdown and a "slow 4G" connection.
// Usage: node scripts/measure.mjs <baseUrl> [path ...]
//
// These are lab measurements from one machine, not Lighthouse scores and not field data.
import { chromium, devices } from "@playwright/test";

const [baseUrl = "http://localhost:3211", ...paths] = process.argv.slice(2);
const targets = paths.length ? paths : ["/en", "/en/menu", "/es/catering", "/en/visit"];

const browser = await chromium.launch();
const rows = [];
for (const target of targets) {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  // Keep the test honest: never load the real third-party destinations.
  await context.route(/toasttab\.com|toast\.app|google\.com/, (route) => route.abort());
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  let transferred = 0;
  let script = 0;
  let requests = 0;
  const types = new Map();
  cdp.on("Network.responseReceived", (event) => types.set(event.requestId, event.type));
  cdp.on("Network.loadingFinished", (event) => {
    requests += 1;
    transferred += event.encodedDataLength;
    if (types.get(event.requestId) === "Script") script += event.encodedDataLength;
  });

  await page.addInitScript(() => {
    window.__lcp = 0;
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto(`${baseUrl}${target}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      ttfb: Math.round(nav.responseStart),
      fcp: Math.round(fcp?.startTime ?? 0),
      lcp: Math.round(window.__lcp),
      cls: Number(window.__cls.toFixed(3)),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
    };
  });
  rows.push({ page: target, ...metrics, requests, "transfer kB": Math.round(transferred / 1024), "script kB": Math.round(script / 1024) });
  await context.close();
}
await browser.close();
console.table(rows);
console.log("Lab conditions: Pixel 7 viewport, 4x CPU slowdown, 1.6 Mbps down / 150 ms latency, cold cache, headless Chromium.");
