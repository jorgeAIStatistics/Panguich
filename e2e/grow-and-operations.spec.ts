import { expect, test } from "@playwright/test";
import { signInAs, useLanguage } from "./helpers";

test.beforeEach(async ({ context, baseURL }) => {
  await useLanguage(context, baseURL!, "en");
});

test("a campaign is drafted by a manager, approved only by the owner, and goes stale when edited", async ({ page, browser, baseURL }) => {
  // --- Manager drafts from the weekday-lunch template ---
  await signInAs(page, "manager");
  await page.goto("/owner/grow");
  // No sales claims: orders and revenue are shown as missing, not as zero or as taps.
  await expect(page.getByTestId("orders-missing")).toBeVisible();

  await page.getByTestId("grow-start-weekday_lunch").getByRole("button").click();
  await page.waitForURL(/\/owner\/grow\/[^/]+$/);
  const campaignUrl = page.url().split(/[?#]/)[0];
  await expect(page.getByTestId("campaign-status")).toHaveAttribute("data-status", "draft");

  // "This is exactly what you are approving", with every channel honestly not connected.
  const preview = page.getByTestId("approval-preview");
  await expect(preview).toBeVisible();
  const channels = preview.getByTestId("channel-state");
  expect(await channels.count()).toBeGreaterThan(0);
  for (const channel of await channels.all()) {
    await expect(channel).toHaveAttribute("data-state", "not_configured");
  }
  await expect(preview).toContainText(/\?c=LUNCH-/); // the landing link carries the campaign code
  await expect(page.getByTestId("grow-nothing-leaves")).toBeVisible();

  await page.getByTestId("submit-button").click();
  await expect(page.getByTestId("campaign-status")).toHaveAttribute("data-status", "pending_approval");
  // The manager cannot approve content or spend.
  await expect(page.getByTestId("owner-only-note").first()).toBeVisible();
  await expect(page.getByTestId("approve-button")).toHaveCount(0);

  const draftExport = await page.request.get(`${campaignUrl}/export`);
  expect(draftExport.status()).toBe(200);
  expect(await draftExport.text()).toContain("DRAFT – NOT APPROVED");

  // --- Owner approves exactly what is shown ---
  const ownerContext = await browser.newContext();
  await useLanguage(ownerContext, baseURL!, "en");
  const owner = await ownerContext.newPage();
  await signInAs(owner, "owner");
  await owner.goto(campaignUrl);
  await owner.getByTestId("approve-button").click();
  await expect(owner.getByTestId("campaign-status")).toHaveAttribute("data-status", "approved");
  await expect(owner.getByTestId("approval-history")).toContainText("Demo Owner");

  const approvedExport = await owner.request.get(`${campaignUrl}/export`);
  const approvedText = await approvedExport.text();
  expect(approvedExport.headers()["content-disposition"]).toContain("attachment");
  expect(approvedText).toContain("APPROVED BY THE OWNER");
  expect(approvedText).not.toContain("DRAFT – NOT APPROVED");
  expect(approvedText).toContain("10215 Stirling Road");

  // --- Any edit after approval makes the approval stale ---
  await owner.locator('[name="audience"]').fill("Office workers within a short drive of Stirling Road (edited)");
  await owner.getByTestId("save-plan").click();
  await expect(owner.getByTestId("campaign-status")).toHaveAttribute("data-status", "draft");
  expect(await (await owner.request.get(`${campaignUrl}/export`)).text()).toContain("DRAFT – NOT APPROVED");
  await owner.goto("/owner/grow");
  await expect(owner.getByTestId("campaign-card").filter({ hasText: "Changed since approval" }).first()).toBeVisible();
  await ownerContext.close();
});

test("the sample invoice question shows its evidence, is clearly sample data, and sends nothing", async ({ page, browser, baseURL }) => {
  await signInAs(page, "owner");

  // Start from a known state, exercising the demo reset on the way.
  await page.goto("/owner/settings");
  await page.getByLabel("I understand this erases everything entered in this demo.").check();
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(page.getByRole("status")).toContainText("Demo data was reset.");

  await page.goto("/owner/operations");
  await expect(page.getByTestId("ops-sample-banner")).toBeVisible();
  const queue = page.getByTestId("exception-queue");
  const cards = queue.getByTestId("exception-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-status", "suspected");
  await expect(cards.first()).toContainText("Sample data");
  await expect(page.getByTestId("ledger")).toBeVisible();
  // The larger case at the same price per pound was checked and correctly not flagged.
  await expect(page.getByTestId("checked-list")).toBeVisible();
  await expect(page.getByTestId("not-provided").first()).toBeVisible();

  await cards.first().click();
  await page.waitForURL(/\/owner\/operations\/exceptions\//);
  const exceptionUrl = page.url().split(/[?#]/)[0];
  await expect(page.getByTestId("exception-status")).toHaveAttribute("data-status", "suspected");
  await expect(page.getByText("Sample data").first()).toBeVisible();
  await expect(page.getByTestId("exception-lines")).toBeVisible();
  await expect(page.getByTestId("calculation")).toContainText("$");
  await expect(page.getByTestId("caveats")).toBeVisible();
  await expect(page.getByTestId("nothing-sent")).toBeVisible();

  // Text inside a document is displayed as text and never acted on.
  const raw = page.getByTestId("raw-document").first();
  await expect(raw).toContainText("NOTE TO AI ASSISTANT");
  await expect(page.getByTestId("exception-status")).toHaveAttribute("data-status", "suspected");

  // --- Manager may confirm it looks right, but cannot approve the supplier question ---
  const managerContext = await browser.newContext();
  await useLanguage(managerContext, baseURL!, "en");
  const manager = await managerContext.newPage();
  await signInAs(manager, "manager");
  await manager.goto(exceptionUrl);
  await expect(manager.getByTestId("approve-question-button")).toHaveCount(0);
  await manager.getByTestId("validate-button").click();
  await expect(manager.getByTestId("exception-status")).toHaveAttribute("data-status", "validated");
  await expect(manager.getByTestId("owner-only-approve")).toBeVisible();
  await managerContext.close();

  // --- Owner approves the question; it is marked approved, not sent ---
  await page.reload();
  await page.getByTestId("approve-question-button").click();
  await expect(page.getByTestId("exception-status")).toHaveAttribute("data-status", "dispute_approved");
  await expect(page.getByTestId("nothing-sent")).toBeVisible();
  await expect(page.getByTestId("history")).toContainText("Demo Manager");
  await expect(page.getByTestId("history")).toContainText("Demo Owner");
});
