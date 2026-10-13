import type { BrowserContext, Page } from "@playwright/test";

export type DemoRole = "owner" | "manager" | "staff";

/** Signs in through the real demo sign-in screen. */
export async function signInAs(page: Page, role: DemoRole): Promise<void> {
  await page.goto("/owner/sign-in");
  await page.locator(`form:has(input[name="userId"][value="demo-${role}"]) button[type="submit"]`).click();
  await page.waitForURL(/\/owner$/);
}

/** Forces the workspace language so assertions do not depend on a role's default. */
export async function useLanguage(context: BrowserContext, baseURL: string, locale: "en" | "es"): Promise<void> {
  await context.addCookies([{ name: "pg_locale", value: locale, url: baseURL }]);
}

/** External destinations are checked by URL only and never actually loaded. */
export async function stubExternalSites(context: BrowserContext): Promise<void> {
  await context.route(/toasttab\.com|toast\.app|google\.com|instagram\.com|facebook\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>external stub</title>" }),
  );
}
