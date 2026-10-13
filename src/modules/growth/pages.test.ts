import { eq } from "drizzle-orm";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { auditLog, campaigns } from "@/db/schema";
import { createTestDb, TEST_MANAGER, TEST_OWNER } from "@/db/testing";
import { can, type Permission, type Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";
import { recordSiteEvent } from "@/modules/tracking/service";
import { seedGrowth } from "./seed";
import { approveCampaign, createCampaignFromUseCase, getCampaignView, updateCampaign, updateCreatives } from "./service";

/**
 * Renders the real Grow pages and the export download against a test database, with only the
 * session swapped for a chosen role. Checks what a person would actually read on the screen.
 */

const session: { db: Db | null; role: Role | null; locale: Locale } = { db: null, role: "owner", locale: "en" };

vi.mock("@/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/client")>()),
  getDb: async () => session.db,
}));

vi.mock("@/lib/owner/locale", () => ({ getOwnerLocale: async () => session.locale }));

vi.mock("@/lib/auth/session", () => {
  const user = () => (session.role ? { id: `demo-${session.role}`, name: `Demo ${session.role}`, role: session.role, locale: session.locale, isDemo: true } : null);
  return {
    getSessionUser: async () => user(),
    requireUser: async () => {
      const current = user();
      if (!current) throw new Error("REDIRECT /owner/sign-in");
      return current;
    },
    // Same rule as the real one: no permission, no page.
    requirePagePermission: async (permission: Permission) => {
      const current = user();
      if (!current) throw new Error("REDIRECT /owner/sign-in");
      if (!can(current.role, permission)) throw new Error(`REDIRECT /owner/not-allowed?need=${permission}`);
      return current;
    },
    toActor: (current: { id: string; role: Role }) => ({ id: current.id, role: current.role }),
  };
});

const { default: GrowPage } = await import("@/app/(owner)/owner/(workspace)/grow/page");
const { default: CampaignPage } = await import("@/app/(owner)/owner/(workspace)/grow/[id]/page");
const { GET: exportRoute } = await import("@/app/(owner)/owner/(workspace)/grow/[id]/export/route");

// The pages read the real clock (to tell whether a campaign has already ended), so these
// campaigns are created "now" and the test does not go stale as the calendar moves on.
const NOW = new Date();

async function render(page: Promise<ReactElement>): Promise<string> {
  return renderToStaticMarkup(await page);
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const indexPage = (query: { notice?: string; error?: string } = {}) => render(GrowPage({ searchParams: Promise.resolve(query) }));
const campaignPage = (id: string, query: { notice?: string; error?: string } = {}) =>
  render(CampaignPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(query) }));
const download = (id: string) => exportRoute(new Request(`http://localhost:3210/owner/grow/${id}/export`), { params: Promise.resolve({ id }) });

let db: Db;
let sampleId: string;
beforeEach(async () => {
  db = await createTestDb();
  await seedGrowth(db, NOW);
  sampleId = (await db.select().from(campaigns))[0].id;
  Object.assign(session, { db, role: "owner", locale: "en" });
});

describe("Grow index page", () => {
  it("offers the three use cases, lists the sample campaign as sample data, and is honest about activity", async () => {
    const html = await indexPage();
    const page = text(html);

    for (const useCase of ["weekday_lunch", "weekend_breakfast", "catering"]) expect(html).toContain(`data-testid="grow-start-${useCase}"`);
    expect(page).toContain("Nothing is published, sent or spent from here.");
    expect(page).toContain("No AI writes them.");

    expect(html).toContain('data-testid="campaign-card"');
    expect(html).toContain('data-status="pending_approval"');
    expect(page).toContain("Sample draft · Weekday lunch");
    expect(page).toContain("Sample data");
    expect(page).toContain("Waiting for the owner");
    expect(html).toContain("o-card--synthetic");

    expect(page).toContain("Taps recorded by this website in this environment.");
    expect(page).toContain("A tap is not an order, a sale or a visit.");
    expect(page).toContain("Orders and revenue: not available — needs a verified Toast report or export.");
    expect(page).toContain("No taps recorded yet.");
    // Nothing on the page is labeled as connected, published, sent or paid.
    expect(html).not.toMatch(/>\s*(Connected|Published|Sent|Paid|Live)\s*</);
  });

  it("shows taps as taps, per campaign code, and says when there are too few to mean anything", async () => {
    for (let i = 0; i < 3; i += 1) {
      await recordSiteEvent(db, { clientEventId: `page-test-${i}`, type: i === 0 ? "order_handoff" : "menu_view", campaignCode: "LUNCH-SAMPLE" });
    }
    const html = await indexPage();
    const page = text(html);
    expect(page).toContain("Too few to draw conclusions.");
    expect(page).toContain("Taps on “Order pickup”");
    expect(html).toContain('data-testid="activity-by-campaign"');
    expect(page).toContain("LUNCH-SAMPLE");
    expect(html).toMatch(/data-event="order_handoff">1</);
    expect(html).toMatch(/data-event="menu_view">2</);
    // The table of taps has no column or row called orders, sales, revenue or visits.
    const table = text(html.slice(html.indexOf('data-testid="activity-overall"'), html.indexOf('data-testid="orders-missing"')));
    expect(table).not.toMatch(/\b(orders|sales|revenue|visits)\b/i);
  });

  it("reads in Spanish, and shows a notice only for codes it knows", async () => {
    session.locale = "es";
    const spanish = text(await indexPage({ notice: "archived" }));
    expect(spanish).toContain("Borradores de campaña");
    expect(spanish).toContain("Empezar este borrador");
    expect(spanish).toContain("Datos de muestra");
    expect(spanish).toContain("Campaña archivada.");
    expect(spanish).toContain("Pedidos e ingresos: no disponibles; hace falta un reporte o exportación verificada de Toast.");

    session.locale = "en";
    const injected = await indexPage({ error: "<script>alert(1)</script>", notice: "made up" });
    expect(injected).not.toContain("alert(1)");
    expect(injected).not.toContain('data-testid="grow-error"');
    expect(injected).not.toContain('data-testid="grow-notice"');
  });

  it("lets a manager read and start drafts, and keeps staff out", async () => {
    session.role = "manager";
    expect(text(await indexPage())).toContain("Start this draft");
    session.role = "staff";
    await expect(indexPage()).rejects.toThrow("REDIRECT /owner/not-allowed?need=growth.view");
    await expect(campaignPage(sampleId)).rejects.toThrow("REDIRECT /owner/not-allowed?need=growth.view");
    session.role = null;
    await expect(indexPage()).rejects.toThrow("REDIRECT /owner/sign-in");
  });
});

describe("campaign page", () => {
  it("shows the owner exactly what would be approved, with every text in both languages", async () => {
    const html = await campaignPage(sampleId);
    const page = text(html);
    const view = (await getCampaignView(db, TEST_OWNER, sampleId, { locale: "en" }))!;

    expect(page).toContain("This is exactly what you are approving");
    expect(page).toContain("This is a sample campaign made for the demonstration.");
    expect(page).toContain("Waiting for the owner's approval.");
    const preview = text(html.slice(html.indexOf('data-testid="approval-preview"'), html.indexOf('id="decision"')));
    for (const creative of view.creatives) {
      expect(preview).toContain(creative.body.replace(/\s+/g, " "));
    }
    expect(preview).toContain("Pan con Chicharrón · $13.99 · listed for online ordering");
    expect(preview).toContain("Names and prices as listed on October 13, 2026.");
    expect(preview).toContain("/en/menu?c=LUNCH-SAMPLE");
    expect(preview).toContain("/es/menu?c=LUNCH-SAMPLE");
    expect(preview).toContain("$0 — no paid advertising.");
    expect(preview).toContain("No discount or special offer.");
    expect(preview).toContain("A tap is not an order.");
    expect(preview).toContain("Template draft");
    expect(preview).not.toMatch(/payload|hash|JSON/i);
    // Every channel: not connected, export only.
    expect(html.match(/data-testid="channel-state" data-state="not_connected_export_only"/g)).toHaveLength(4);
    expect(preview.match(/Not connected — export only/g)).toHaveLength(4);
    expect(html).not.toMatch(/>\s*(Connected|Published|Sent|Paid|Live)\s*</);

    // The owner can decide; the fingerprint of this exact page travels with the approval.
    expect(html).toContain('data-testid="approve-button"');
    expect(html).toContain('data-testid="request-changes-button"');
    expect(html).toContain(`name="expectedHash" value="${view.payloadHash}"`);
    expect(page).toContain("It does not publish, send or spend anything.");
    expect(page).toContain("The automatic checks found no problems.");
    expect(page).toContain("No decision has been recorded yet.");
    expect(html).toContain(`href="/owner/grow/${sampleId}/export"`);
    expect(page).toContain("DRAFT – NOT APPROVED");
  });

  it("tells a manager that only the owner can approve, and offers no approve button", async () => {
    session.role = "manager";
    const html = await campaignPage(sampleId);
    expect(text(html)).toContain("Only the owner can approve content and spend.");
    expect(html).not.toContain('data-testid="approve-button"');
    expect(html).not.toContain('data-testid="request-changes-button"');
    expect(html).not.toContain('name="expectedHash"');
    // A manager can still edit the plan and the texts.
    expect(html).toContain('data-testid="plan-form"');
    expect(html).toContain('data-testid="save-caption"');

    // On a draft the manager is offered "send for approval", not "approve".
    const draft = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "catering", locale: "en" }, { now: NOW });
    const draftHtml = await campaignPage(draft.id, { notice: "created" });
    expect(draftHtml).toContain('data-testid="submit-button"');
    expect(draftHtml).not.toContain('data-testid="approve-button"');
    expect(text(draftHtml)).toContain("Draft created from the template.");
  });

  it("shows checks in words, blocks approval on a blocking one, and warns about breakfast dishes not online", async () => {
    const breakfast = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "weekend_breakfast", locale: "en" }, { now: NOW });
    let html = await campaignPage(breakfast.id);
    expect(html).toContain('data-testid="check-not_online" data-level="warn"');
    expect(text(html)).toContain("Check before approving. The goal is pickup orders, but these dishes were not listed for online ordering when checked on October 13, 2026");
    expect(text(html)).toContain("not listed for online ordering when checked");
    expect(html).toContain('data-testid="approve-button"');

    await updateCampaign(
      db,
      TEST_MANAGER,
      {
        campaignId: breakfast.id,
        name: breakfast.name,
        audience: breakfast.audience,
        objective: breakfast.objective,
        landingPath: "/menu",
        schedule: { ...breakfast.schedule, startTime: "06:00" },
        featuredItemIds: breakfast.featuredItemIds,
        offer: { type: "limited_test", description: "", eligibleItemIds: [], exclusions: "", quantityLimit: null, redemptionControl: "", contributionMarginNote: null },
        budgetCents: 4000,
      },
      NOW,
    );
    html = await campaignPage(breakfast.id);
    const page = text(html);
    expect(html).toContain('data-testid="check-outside_hours" data-level="block"');
    expect(html).toContain('data-testid="check-offer_incomplete" data-level="block"');
    expect(html).toContain('data-testid="check-margin_unknown" data-level="warn"');
    expect(html).toContain('data-testid="check-budget_set" data-level="warn"');
    expect(page).toContain("Must fix before approval.");
    expect(page).toContain("Approval is blocked until the items marked “Must fix” are corrected.");
    expect(html).not.toContain('data-testid="approve-button"');
    // Missing data is shown as missing, never filled in.
    expect(page).toContain("Unknown — missing data, not guessed");
    expect(page).toContain("Not stated — missing");
    expect(page).toContain("$40.00 planned. No advertising account is connected, so nothing can be spent from here.");
  });

  it("shows approved, then “changed since approval” after an edit, with the history of decisions", async () => {
    const before = (await getCampaignView(db, TEST_OWNER, sampleId, { locale: "en" }))!;
    await approveCampaign(db, TEST_OWNER, { campaignId: sampleId, expectedHash: before.payloadHash, note: "Looks good" }, NOW);

    let html = await campaignPage(sampleId);
    let page = text(html);
    expect(html).toContain('data-testid="state-approved"');
    expect(page).toContain("Approved by Demo Owner on");
    expect(page).toContain("Nothing was published: export the drafts and post them yourself.");
    expect(html).toContain('data-testid="revoke-button"');
    expect(html).not.toContain('data-testid="approve-button"');
    expect(page).toContain("This exact content is approved.");
    expect(html).toContain('data-decision="approved"');
    expect(page).toContain("This exact version");
    expect(page).toContain("“Looks good”");

    await updateCreatives(db, TEST_MANAGER, { campaignId: sampleId, texts: [{ kind: "caption", locale: "en", body: "Lunch at Panguich. [campaign link]" }] }, NOW);
    html = await campaignPage(sampleId, { notice: "texts_saved_needs_approval" });
    page = text(html);
    expect(html).toContain('data-testid="changed-since-approval"');
    expect(page).toContain("Changed since approval — needs approval again.");
    expect(page).toContain("so it needs approval again.");
    expect(html).toContain('data-status="draft"');
    expect(html).toContain('data-testid="origin-caption-en">Edited<');
    expect(page).toContain("An earlier version");
    expect(html).toContain('data-testid="approve-button"');
    expect(page).toContain("The file is marked “DRAFT – NOT APPROVED”");
    expect(text(await indexPage())).toContain("Changed since approval");
  });

  it("escapes whatever a person typed, reads in Spanish, and handles a campaign that does not exist", async () => {
    await updateCreatives(db, TEST_OWNER, { campaignId: sampleId, texts: [{ kind: "caption", locale: "es", body: '<img src=x onerror="alert(1)"> ¡Hola!' }] }, NOW);
    session.locale = "es";
    const html = await campaignPage(sampleId);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    const page = text(html);
    expect(page).toContain("Esto es exactamente lo que estás aprobando");
    expect(page).toContain("No conectado: solo exportar");
    expect(page).toContain("Aprobar este contenido exacto");
    expect(page).toContain("Datos de muestra");
    expect(page).toContain("Los textos, palabra por palabra");

    expect(text(await campaignPage("00000000-0000-4000-8000-000000000000"))).toContain("No se encontró esa campaña.");
  });
});

describe("export download", () => {
  it("is refused without a session and for staff, and the staff refusal is recorded", async () => {
    session.role = null;
    expect((await download(sampleId)).status).toBe(401);

    session.role = "staff";
    const refused = await download(sampleId);
    expect(refused.status).toBe(403);
    expect(await refused.text()).toBe("");
    const denied = await db.select().from(auditLog).where(eq(auditLog.outcome, "denied"));
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ actorId: "demo-staff", permission: "growth.view", entityType: "campaign", entityId: sampleId });
  });

  it("downloads a draft as an attachment, then an approved file once the owner approves", async () => {
    session.role = "manager";
    const draft = await download(sampleId);
    expect(draft.status).toBe(200);
    expect(draft.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(draft.headers.get("content-disposition")).toBe('attachment; filename="panguich-lunch-sample-draft.md"');
    expect(draft.headers.get("cache-control")).toBe("no-store");
    const draftBody = await draft.text();
    expect(draftBody.split("\n")[0]).toBe("# DRAFT – NOT APPROVED");
    expect(draftBody).toContain("SAMPLE DATA");
    expect(draftBody).toContain("http://localhost:3210/en/menu?c=LUNCH-SAMPLE");
    expect(draftBody).toContain("This address is where the demonstration is running.");

    const view = (await getCampaignView(db, TEST_OWNER, sampleId, { locale: "en" }))!;
    await approveCampaign(db, TEST_OWNER, { campaignId: sampleId, expectedHash: view.payloadHash }, NOW);
    session.role = "owner";
    const approved = await download(sampleId);
    expect(approved.headers.get("content-disposition")).toBe('attachment; filename="panguich-lunch-sample-approved.md"');
    expect((await approved.text()).split("\n")[0]).toBe("# APPROVED BY THE OWNER");

    expect((await download("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});
