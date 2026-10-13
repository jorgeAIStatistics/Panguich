// Review helper: captures a page as a series of fixed-height segments at 1x scale.
// Usage: node scripts/review-shots.mjs <url> <outPrefix> <width> [segmentHeight] [--owner|--manager|--staff]
import { chromium } from "@playwright/test";

const [url, outPrefix, widthArg = "390", segArg = "1500", ...flags] = process.argv.slice(2);
const width = Number(widthArg);
const seg = Number(segArg);
const role = flags.find((f) => ["--owner", "--manager", "--staff"].includes(f))?.slice(2);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height: 844 },
  deviceScaleFactor: 1,
  isMobile: width < 700,
  hasTouch: width < 700,
});
const page = await context.newPage();
if (role) {
  const origin = new URL(url).origin;
  await page.goto(`${origin}/owner/sign-in`);
  await page.locator(`form:has(input[value="demo-${role}"]) button[type="submit"]`).click();
  await page.waitForURL("**/owner");
}
await page.goto(url, { waitUntil: "networkidle" });
const height = await page.evaluate(() => document.documentElement.scrollHeight);
let index = 0;
for (let y = 0; y < height; y += seg) {
  const file = `${outPrefix}.${index}.png`;
  await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y, width, height: Math.min(seg, height - y) } });
  console.log(file);
  index += 1;
}
await browser.close();
