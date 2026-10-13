// Takes real screenshots of the running app at phone and desktop sizes.
// Usage: node scripts/screenshots.mjs <baseUrl> <outDir> [--owner] [path ...]
import { chromium, devices } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const [baseUrl = "http://localhost:3210", outDir = "docs/screenshots", ...rest] = process.argv.slice(2);
const asOwner = rest.includes("--owner");
const paths = rest.filter((arg) => !arg.startsWith("--"));
const targets = paths.length ? paths : ["/en", "/es", "/en/menu", "/en/catering", "/en/visit"];

const sizes = [
  { name: "mobile", context: { ...devices["Pixel 7"] } },
  { name: "desktop", context: { viewport: { width: 1440, height: 900 } } },
];

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
for (const size of sizes) {
  const context = await browser.newContext(size.context);
  const page = await context.newPage();
  if (asOwner) {
    await page.goto(`${baseUrl}/owner/sign-in`);
    await page.locator('form:has(input[value="demo-owner"]) button[type="submit"]').click();
    await page.waitForURL("**/owner");
  }
  for (const target of targets) {
    await page.goto(`${baseUrl}${target}`, { waitUntil: "networkidle" });
    const name = `${target.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "root"}-${size.name}.png`;
    await page.screenshot({ path: path.join(outDir, name), fullPage: true });
    console.log(`${size.name} ${target} -> ${name}`);
  }
  await context.close();
}
await browser.close();
