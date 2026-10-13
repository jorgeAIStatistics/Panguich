// Takes real screenshots of the running app at phone and desktop sizes.
// Usage: node scripts/screenshots.mjs <baseUrl> <outDir> [--owner] [--lang=en|es] [path ...]
import { chromium, devices } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const [baseUrl = "http://localhost:3210", outDir = "docs/screenshots", ...rest] = process.argv.slice(2);
const asOwner = rest.includes("--owner");
// Workspace language. Without it each demo person sees their own saved language.
const lang = rest.find((arg) => arg.startsWith("--lang="))?.slice(7);
const paths = rest.filter((arg) => !arg.startsWith("--"));
const targets = paths.length ? paths : ["/en", "/es", "/en/menu", "/en/catering", "/en/visit"];

const sizes = [
  { name: "mobile", context: { ...devices["Pixel 7"], deviceScaleFactor: 1.5 } },
  { name: "desktop", context: { viewport: { width: 1440, height: 900 } } },
];

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
for (const size of sizes) {
  const context = await browser.newContext(size.context);
  if (lang) await context.addCookies([{ name: "pg_locale", value: lang, url: baseUrl }]);
  const page = await context.newPage();
  if (asOwner) {
    await page.goto(`${baseUrl}/owner/sign-in`);
    await page.locator('form:has(input[value="demo-owner"]) button[type="submit"]').click();
    await page.waitForURL("**/owner");
  }
  for (const target of targets) {
    await page.goto(`${baseUrl}${target}`, { waitUntil: "networkidle" });
    // Record ids are replaced by "detail" so file names stay the same from run to run.
    const slug = target.replace(/^\//, "").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "detail").replace(/[^a-z0-9]+/gi, "-") || "root";
    const name = `${slug}${asOwner && lang ? `-${lang}` : ""}-${size.name}.jpg`;
    await page.screenshot({ path: path.join(outDir, name), fullPage: true, type: "jpeg", quality: 68 });
    console.log(`${size.name} ${target} -> ${name}`);
  }
  await context.close();
}
await browser.close();
