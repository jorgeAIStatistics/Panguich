import { expect, test } from "@playwright/test";

const TOAST_ORDER_URL = "https://www.toasttab.com/local/order/panguich";

test.beforeEach(async ({ context }) => {
  // The tests check that links point at the real destinations without ever loading them.
  await context.route(/toasttab\.com|toast\.app|google\.com|instagram\.com|facebook\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>external stub</title>" }),
  );
});

test.describe("public website", () => {
  test("home says what Panguich serves, where it is, and how to order", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Peruvian sánguches");
    await expect(page.getByText("10215 Stirling Road, Cooper City, FL 33328").first()).toBeVisible();

    const order = page.getByRole("link", { name: /Order pickup/ }).first();
    await expect(order).toBeVisible();
    await expect(order).toHaveAttribute("href", TOAST_ORDER_URL);
    await expect(page.getByText(/Ordering opens on Toast/).first()).toBeVisible();

    const directions = page.getByRole("link", { name: /Directions/ }).first();
    await expect(directions).toHaveAttribute("href", /google\.com\/maps\/dir\/\?api=1&destination=Panguich/);
    await expect(page.locator('a[href="tel:+19548839366"]').first()).toBeAttached();
  });

  test("labels itself as a preview and every photo space as a placeholder", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByText("Owner preview. This is not the live Panguich website.")).toBeVisible();
    const placeholders = page.getByRole("img", { name: /Photo placeholder/ });
    expect(await placeholders.count()).toBeGreaterThanOrEqual(4);
    expect(await page.locator("main img").count()).toBe(0); // no real or stock photographs
  });

  test("order handoff is a plain link, is explained, and the tap is counted", async ({ page }) => {
    await page.goto("/en/menu?c=LUNCH-E2E");
    const tracked = page.waitForRequest((request) => request.url().endsWith("/api/events") && (request.postData() ?? "").includes("order_handoff"));
    const popupPromise = page.waitForEvent("popup");
    await page.locator("main").getByRole("link", { name: /Order pickup/ }).first().click();
    const popup = await popupPromise;
    const request = await tracked;
    const body = JSON.parse(request.postData() ?? "{}");
    expect(body).toMatchObject({ type: "order_handoff", locale: "en", path: "/en/menu", campaignCode: "LUNCH-E2E" });
    expect(popup.url()).toContain("toasttab.com/local/order/panguich");
    expect((await request.response())?.status()).toBe(204);
  });

  test("Spanish is a full version, and the choice is remembered", async ({ page }) => {
    await page.goto("/en/menu");
    await page.getByRole("link", { name: "Ver esta página en español" }).click();
    await expect(page).toHaveURL(/\/es\/menu$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("heading", { level: 1, name: "Carta" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Pedir para recoger/ }).first()).toHaveAttribute("href", TOAST_ORDER_URL);
    // An un-prefixed link (as used by campaigns) now lands on the Spanish page and keeps its code.
    await page.goto("/catering?c=CATER-E2E");
    await expect(page).toHaveURL(/\/es\/catering\?c=CATER-E2E$/);
  });

  test("menu lists every dish with a price and can be searched", async ({ page }) => {
    await page.goto("/en/menu");
    const items = page.getByTestId("menu-item");
    await expect(items).toHaveCount(113);
    await expect(page.getByRole("status")).toHaveText("113 dishes");

    const search = page.getByRole("searchbox", { name: "Search the menu" });
    await search.fill("chicharron"); // no accent typed
    await expect(page.locator("#pan-con-chicharron")).toBeVisible();
    await expect(page.locator("#pan-con-chicharron")).toContainText("$13.99");
    await expect(page.locator("#pan-con-chicharron")).toContainText("Fried pork, sweet potatoes and criolla sauce.");
    expect(await items.count()).toBeLessThan(10);

    await search.fill("zzzz");
    await expect(page.getByText("Nothing matches “zzzz”.")).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(items).toHaveCount(113);

    await expect(page.locator("#desayuno-lurin")).toContainText("Ask in store");
    await expect(page.getByText(/Prices are as listed by Panguich on October 13, 2026/)).toBeVisible();
    await expect(page.getByText(/Food allergies or dietary needs/).first()).toBeVisible();
  });

  test("menu and ordering work with JavaScript turned off", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/es/menu");
    await expect(page.getByTestId("menu-item")).toHaveCount(113);
    await expect(page.locator("#butifarra")).toContainText("$12.99");
    await expect(page.getByRole("link", { name: /Pedir para recoger/ }).first()).toHaveAttribute("href", TOAST_ORDER_URL);
    await context.close();
  });

  test("pages fit the screen without sideways scrolling", async ({ page }) => {
    for (const path of ["/en", "/en/menu", "/es/catering", "/en/visit"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("keyboard users get a skip link and visible focus", async ({ page }) => {
    await page.goto("/en");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("visit page shows verified hours and structured data without ratings", async ({ page }) => {
    await page.goto("/en/visit");
    await expect(page.getByRole("row", { name: /Sunday/ })).toContainText("8:00 AM – 5:00 PM");
    await expect(page.getByRole("row", { name: /Monday/ })).toContainText("8:00 AM – 7:00 PM");
    const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
    expect(jsonLd["@type"]).toBe("Restaurant");
    expect(jsonLd.telephone).toBe("+19548839366");
    expect(JSON.stringify(jsonLd)).not.toMatch(/aggregateRating|review/i);
  });

  test("search engines are blocked until launch is approved", async ({ page, request }) => {
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toMatch(/Disallow: \/\s*$/m);
    await page.goto("/en");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en$/);
    await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute("href", /\/es$/);
    const sitemap = await request.get("/sitemap.xml");
    expect(await sitemap.text()).toContain("/es/menu");
  });

  test("unknown public routes return a real 404", async ({ request }) => {
    expect((await request.get("/en/does-not-exist")).status()).toBe(404);
    expect((await request.get("/fr")).status()).toBe(404);
  });

  test("the event endpoint rejects junk", async ({ request }) => {
    expect((await request.post("/api/events", { data: { type: "purchase", clientEventId: "evt-12345678" } })).status()).toBe(400);
    expect((await request.post("/api/events", { data: "not json", headers: { "content-type": "application/json" } })).status()).toBe(400);
    expect((await request.post("/api/events", { data: { type: "menu_view", clientEventId: "evt-e2e-0000001", path: "/en/menu" } })).status()).toBe(204);
  });
});
