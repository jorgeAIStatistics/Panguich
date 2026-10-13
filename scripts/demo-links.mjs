// Prints the detail-page paths of the first catering request, campaign and invoice question,
// so screenshots can be taken of them. Usage: node scripts/demo-links.mjs <baseUrl>
import { chromium } from "@playwright/test";

const [baseUrl = "http://localhost:3210"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${baseUrl}/owner/sign-in`);
await page.locator('form:has(input[value="demo-owner"]) button[type="submit"]').click();
await page.waitForURL("**/owner");
const first = async (path, testId) => {
  await page.goto(`${baseUrl}${path}`);
  return page.getByTestId(testId).first().getAttribute("href");
};
console.log(
  [await first("/owner/catering?stage=confirmed", "catering-card"), await first("/owner/grow", "campaign-card"), await first("/owner/operations", "exception-card")].join(" "),
);
await browser.close();
