import { expect, test } from "@playwright/test";
import { signInAs, useLanguage } from "./helpers";

test.beforeEach(async ({ context, baseURL }) => {
  await useLanguage(context, baseURL!, "en");
});

test.describe("owner workspace access", () => {
  test("nothing in the workspace is reachable without signing in", async ({ page, request }) => {
    for (const path of ["/owner", "/owner/catering", "/owner/grow", "/owner/operations", "/owner/settings"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/owner\/sign-in$/);
    }
    expect((await request.get("/owner/settings/export")).status()).toBe(401);
  });

  test("sign-in is clearly a demo and the workspace is kept out of search engines", async ({ page }) => {
    await page.goto("/owner/sign-in");
    await expect(page.getByText(/Demo sign-in/)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("button", { name: "Continue as Owner" })).toBeVisible();
  });

  test("the owner sees every section and at most three Today cards, each with its evidence", async ({ page }) => {
    await signInAs(page, "owner");
    await expect(page.getByRole("note")).toContainText("Demo environment");
    const nav = page.getByRole("navigation", { name: "Owner workspace" });
    for (const name of ["Today", "Grow", "Catering", "Operations", "Settings"]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
    const cards = page.getByTestId("today-card");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3);
    for (let i = 0; i < count; i += 1) {
      const card = cards.nth(i);
      await expect(card.getByText("Source", { exact: true })).toBeVisible();
      await expect(card.getByText("As of", { exact: true })).toBeVisible();
      await expect(card.getByRole("link")).toBeVisible();
    }
    await expect(page.getByText(/Sales, orders and guest counts are not shown/)).toBeVisible();
  });

  test("staff see only what they need and are refused elsewhere, on the server", async ({ page, request }) => {
    await signInAs(page, "staff");
    const nav = page.getByRole("navigation", { name: "Owner workspace" });
    await expect(nav.getByRole("link", { name: "Catering" })).toBeVisible();
    for (const hidden of ["Grow", "Operations", "Settings"]) {
      await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
    }
    for (const path of ["/owner/operations", "/owner/grow", "/owner/settings"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/owner\/not-allowed/);
      await expect(page.getByRole("alert").filter({ hasText: "Not available for your role" })).toBeVisible();
    }
    // The session cookie is shared with the page; the download must still be refused.
    expect((await page.request.get("/owner/settings/export")).status()).toBe(403);
    expect((await request.get("/owner/settings/export")).status()).toBe(401);
  });

  test("language choice is remembered and covers the workspace", async ({ page }) => {
    await signInAs(page, "owner");
    await page.getByRole("button", { name: /Language: Español/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Hoy" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Hoy" })).toBeVisible();
    await page.goto("/owner/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toBeVisible();
    await expect(page.getByText("No conectado").first()).toBeVisible();
  });
});

test.describe("settings", () => {
  test("no connection is shown as connected", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/owner/settings");
    const integrations = page.getByTestId("integration");
    expect(await integrations.count()).toBeGreaterThanOrEqual(6);
    for (const item of await integrations.all()) {
      await expect(item).toHaveAttribute("data-state", "not_configured");
      await expect(item).toContainText("Not connected");
    }
    await expect(page.getByText(/Connected and verified|Connected, read-only/)).toHaveCount(0);
  });

  test("the owner can answer a public-page conflict; a manager cannot", async ({ browser, baseURL }) => {
    const managerContext = await browser.newContext();
    await useLanguage(managerContext, baseURL!, "en");
    const manager = await managerContext.newPage();
    await signInAs(manager, "manager");
    await manager.goto("/owner/settings");
    const managerCard = manager.locator("#sunday-close");
    await expect(managerCard).toContainText("8:00 AM – 4:00 PM");
    await expect(managerCard).toContainText("Only the owner can answer this.");
    await expect(managerCard.getByRole("textbox")).toHaveCount(0);
    await managerContext.close();

    const ownerContext = await browser.newContext();
    await useLanguage(ownerContext, baseURL!, "en");
    const owner = await ownerContext.newPage();
    await signInAs(owner, "owner");
    await owner.goto("/owner/settings");
    const card = owner.locator("#sunday-close");
    await card.getByLabel("Which Sunday closing time is correct?").fill("5:00 PM is correct");
    await card.getByRole("button", { name: "Save my answer" }).click();
    await expect(owner.getByRole("status")).toContainText("Saved.");
    await expect(owner.locator("#sunday-close")).toContainText("Answered");
    await owner.reload();
    await expect(owner.locator("#sunday-close")).toContainText("5:00 PM is correct");
    await ownerContext.close();
  });

  test("the owner can download a copy of the data", async ({ page }) => {
    await signInAs(page, "owner");
    const response = await page.request.get("/owner/settings/export");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toMatch(/attachment; filename="panguich-export-\d{4}-\d{2}-\d{2}\.json"/);
    const data = await response.json();
    expect(data).toHaveProperty("catering.inquiries");
    expect(data).toHaveProperty("audit");
  });
});
