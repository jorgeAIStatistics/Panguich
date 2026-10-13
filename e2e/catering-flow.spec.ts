import { expect, test, type Page } from "@playwright/test";
import { signInAs, stubExternalSites, useLanguage } from "./helpers";

/** A calendar date three weeks from now, as YYYY-MM-DD. */
function futureDate(days = 21): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function fillRequest(page: Page, name: string): Promise<void> {
  await page.locator('[name="eventDate"]').fill(futureDate());
  await page.locator('[name="headcount"]').fill("40");
  await page.locator('[name="name"]').fill(name);
  await page.locator('[name="email"]').fill("guest@example.com");
  await page.locator('[name="message"]').fill("Office lunch. Sánguches and juices for the team.");
}

test.beforeEach(async ({ context, baseURL }) => {
  await useLanguage(context, baseURL!, "en");
  await stubExternalSites(context);
});

test("a website catering request is saved and worked through to a confirmed event", async ({ page, browser, baseURL }, testInfo) => {
  const name = `E2E Guest ${testInfo.project.name} ${Date.now()}`;

  // --- Customer: the public form ---
  await page.goto("/en/catering?c=CATER-E2E");
  await page.getByTestId("catering-submit").click();
  await expect(page.getByTestId("catering-errors")).toBeVisible();

  await fillRequest(page, name);
  // Without permission to be contacted, the request is refused and nothing is saved.
  await page.getByTestId("catering-submit").click();
  await expect(page.getByTestId("catering-errors")).toContainText("Tick this box so Panguich can reply to you");
  await expect(page.getByTestId("catering-success")).toHaveCount(0);

  await page.locator('[name="consentContact"]').check();
  await expect(page.locator('[name="consentNews"]')).not.toBeChecked(); // marketing is opt-in, never pre-ticked
  await page.getByTestId("catering-submit").click();

  const success = page.getByTestId("catering-success");
  await expect(success).toBeVisible();
  await expect(success).toContainText("This is a request, not a confirmed booking.");
  await expect(page.getByTestId("catering-demo-note")).toBeVisible();
  const reference = ((await page.getByTestId("catering-reference").textContent()) ?? "").trim();
  expect(reference).toMatch(/^CAT-[A-Z0-9]{6}$/);

  // --- Owner: it is the first thing on Today ---
  await signInAs(page, "owner");
  const top = page.getByTestId("today-card").first();
  await expect(top).toHaveAttribute("data-card-id", "catering:new-inquiries");
  await expect(top.getByText("Sample data")).toHaveCount(0); // a real request, not a sample

  await page.goto("/owner/catering");
  const card = page.getByTestId("catering-card").filter({ hasText: reference });
  await expect(card).toHaveAttribute("data-status", "new");
  await card.click();
  await expect(page.getByTestId("current-stage")).toContainText("New");
  await expect(page.getByText(name).first()).toBeVisible();

  // Consent evidence: contact permission granted, no marketing permission.
  await expect(page.locator('[data-testid="consent-record"][data-channel="transactional_contact"]')).toBeVisible();
  await expect(page.locator('[data-testid="consent-record"][data-channel="sms_marketing"]')).toHaveCount(0);

  // "Quoted" is blocked until there is an approved quote.
  await expect(page.getByTestId("stage-to-quoted")).toHaveCount(0);
  await expect(page.getByTestId("stage-blocked").first()).toBeVisible();

  // --- Quote: draft, then owner approval ---
  const detailUrl = page.url().split(/[?#]/)[0];
  await page.getByTestId("new-quote-version").click();
  await page.locator('[name="description_0"]').fill("Pan con chicharrón tray");
  await page.locator('[name="quantity_0"]').fill("4");
  await page.locator('[name="price_0"]').fill("85.50");
  await page.locator('[name="description_1"]').fill("Chicha morada, gallon");
  await page.locator('[name="quantity_1"]').fill("2");
  await page.locator('[name="price_1"]').fill("24");
  await page.getByTestId("quote-form").locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === new URL(detailUrl).pathname);

  const quote = page.getByTestId("current-quote");
  await expect(quote).toHaveAttribute("data-quote-status", "draft");
  // 4 × $85.50 + 2 × $24.00 = $390.00, calculated on the server in whole cents.
  await expect(page.getByTestId("quote-subtotal").first()).toContainText("$390.00");

  // A manager can see the quote but cannot approve it.
  const managerContext = await browser.newContext();
  await useLanguage(managerContext, baseURL!, "en");
  const manager = await managerContext.newPage();
  await signInAs(manager, "manager");
  await manager.goto(detailUrl);
  await expect(manager.getByTestId("approve-owner-only")).toBeVisible();
  await expect(manager.getByTestId("approve-quote")).toHaveCount(0);
  await managerContext.close();

  await page.getByTestId("approve-quote").click();
  await expect(page.getByTestId("current-quote")).toHaveAttribute("data-quote-status", "approved");

  // --- Stages: quoted -> accepted; confirming needs the deposit settled first ---
  await page.getByTestId("stage-to-quoted").click();
  await expect(page.getByTestId("current-stage")).toContainText("Quoted");
  await page.getByTestId("stage-to-accepted").click();
  await expect(page.getByTestId("current-stage")).toContainText("Accepted");
  await expect(page.getByTestId("stage-to-confirmed")).toHaveCount(0);

  await page.getByTestId("deposit-to-requested").click();
  await page.locator("#deposit-note-received").fill("$100 cash, taken by the owner at the counter");
  await page.getByTestId("deposit-to-recorded_unverified").click();
  // Honest wording: recorded by a person, not verified by a payment provider.
  await expect(page.getByTestId("deposit-unverified")).toBeVisible();
  await expect(page.getByTestId("deposit-to-verified")).toHaveCount(0);

  await page.getByTestId("stage-to-confirmed").click();
  await expect(page.getByTestId("current-stage")).toContainText("Confirmed");

  // The kitchen pack exists and was built from the quote lines.
  await expect(page.getByTestId("checklist-production")).toContainText("Pan con chicharrón tray");
  await expect(page.getByTestId("checklist-packing")).toBeVisible();

  // --- Persistence: a fresh browser session still sees the confirmed event ---
  const later = await browser.newContext();
  await useLanguage(later, baseURL!, "en");
  const laterPage = await later.newPage();
  await signInAs(laterPage, "staff");
  await laterPage.goto("/owner/catering");
  await expect(laterPage.getByTestId("catering-card").filter({ hasText: reference })).toHaveAttribute("data-status", "confirmed");
  await laterPage.goto(detailUrl);
  await expect(laterPage.getByTestId("current-stage")).toContainText("Confirmed");
  // Staff help fulfill; they cannot change the stage or add requests.
  await expect(laterPage.locator('[data-testid^="stage-to-"]')).toHaveCount(0);
  await laterPage.goto("/owner/catering/new");
  await expect(laterPage).toHaveURL(/\/owner\/not-allowed/);
  await later.close();
});

test("the catering form works in Spanish and without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await useLanguage(context, baseURL!, "es");
  const page = await context.newPage();
  await page.goto("/es/catering");
  await fillRequest(page, `E2E Sin JS ${Date.now()}`);
  await page.locator('[name="consentContact"]').check();
  await page.getByTestId("catering-submit").click();
  await expect(page.getByTestId("catering-success")).toContainText("Esto es una solicitud, no una reserva confirmada.");
  await expect(page.getByTestId("catering-reference")).toHaveText(/CAT-[A-Z0-9]{6}/);
  await context.close();
});

test("sample catering records are always labeled", async ({ page }) => {
  await signInAs(page, "owner");
  await page.goto("/owner/catering");
  const samples = page.getByTestId("catering-card").filter({ hasText: "Sample customer" });
  expect(await samples.count()).toBe(2);
  for (const sample of await samples.all()) {
    await expect(sample).toContainText("Sample data");
  }
});
