import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditLog, campaignApprovals, campaignCreatives, campaigns, CREATIVE_KINDS } from "@/db/schema";
import { createTestDb, TEST_MANAGER, TEST_OWNER, TEST_STAFF } from "@/db/testing";
import { PermissionError } from "@/lib/auth/permissions";
import { recordSiteEvent } from "@/modules/tracking/service";
import { hashPayload } from "./approval";
import { EXPORT_APPROVED_HEADER, EXPORT_DRAFT_HEADER } from "./export";
import { SAMPLE_CAMPAIGN_CODE, seedGrowth } from "./seed";
import {
  approveCampaign,
  archiveCampaign,
  createCampaignFromUseCase,
  exportCampaign,
  getCampaignView,
  getGrowthActivity,
  listCampaigns,
  regenerateCreatives,
  requestChanges,
  revokeApproval,
  submitForApproval,
  updateCampaign,
  updateCreatives,
  type CampaignEditInput,
} from "./service";
import { getGrowthTodayCards } from "./today";
import type { Campaign } from "./types";

const NOW = new Date("2026-10-13T15:00:00Z");
const MID = new Date("2026-10-13T16:00:00Z");
const LATER = new Date("2026-10-13T18:30:00Z");
const EXPORT_TO = { locale: "en" as const, siteOrigin: "http://localhost:3210", siteOriginIsProvisional: true };

async function audits(db: Db, action: string, outcome: "ok" | "denied" | "invalid") {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, action), eq(auditLog.outcome, outcome)));
}

function editInput(campaign: Campaign, overrides: Partial<CampaignEditInput> = {}): CampaignEditInput {
  return {
    campaignId: campaign.id,
    name: campaign.name,
    audience: campaign.audience,
    objective: campaign.objective,
    landingPath: campaign.landingPath as CampaignEditInput["landingPath"],
    schedule: campaign.schedule,
    featuredItemIds: campaign.featuredItemIds,
    offer: campaign.offer,
    budgetCents: campaign.budgetCents,
    ...overrides,
  };
}

async function view(db: Db, campaignId: string) {
  const result = await getCampaignView(db, TEST_OWNER, campaignId, { locale: "en", now: NOW });
  if (!result) throw new Error("campaign not found");
  return result;
}

/** A lunch draft created by the manager, sent for approval, and approved by the owner. */
async function approvedCampaign(db: Db) {
  const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "weekday_lunch", locale: "en" }, { now: NOW });
  await submitForApproval(db, TEST_MANAGER, { campaignId: campaign.id }, NOW);
  const { payloadHash } = await view(db, campaign.id);
  await approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: payloadHash }, NOW);
  return campaign;
}

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("creating a draft", () => {
  it("creates each use case with all four texts in both languages", async () => {
    for (const useCase of ["weekday_lunch", "weekend_breakfast", "catering"] as const) {
      const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase, locale: "es" }, { now: NOW });
      expect(campaign).toMatchObject({ useCase, status: "draft", createdBy: TEST_MANAGER.id, isSynthetic: false, budgetCents: 0, offer: { type: "none" } });
      expect(campaign.code).toMatch(/^(LUNCH|BFAST|CATER)-[2-9A-Z]{4}$/);

      const creatives = await db.select().from(campaignCreatives).where(eq(campaignCreatives.campaignId, campaign.id));
      expect(creatives).toHaveLength(8);
      for (const kind of CREATIVE_KINDS) {
        for (const locale of ["en", "es"] as const) {
          const creative = creatives.find((c) => c.kind === kind && c.locale === locale);
          expect(creative?.body.length).toBeGreaterThan(40);
          expect(creative?.origin).toBe("template");
        }
      }
    }
    expect((await listCampaigns(db, TEST_MANAGER)).map((item) => item.campaign.useCase).sort()).toEqual(["catering", "weekday_lunch", "weekend_breakfast"]);
    expect(await audits(db, "growth.campaign.create", "ok")).toHaveLength(3);
  });

  it("gives every campaign its own code and refuses an unknown use case", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      codes.add((await createCampaignFromUseCase(db, TEST_OWNER, { useCase: "weekday_lunch", locale: "en" }, { now: NOW })).code);
    }
    expect(codes.size).toBe(5);
    await expect(createCampaignFromUseCase(db, TEST_OWNER, { useCase: "happy_hour", locale: "en" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createCampaignFromUseCase(db, TEST_OWNER, { useCase: "catering", locale: "en" }, { code: "not a code" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("keeps staff out of Grow entirely and records the refusals", async () => {
    const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "catering", locale: "en" }, { now: NOW });
    await expect(createCampaignFromUseCase(db, TEST_STAFF, { useCase: "catering", locale: "en" })).rejects.toBeInstanceOf(PermissionError);
    await expect(listCampaigns(db, TEST_STAFF)).rejects.toBeInstanceOf(PermissionError);
    await expect(getCampaignView(db, TEST_STAFF, campaign.id, { locale: "en" })).rejects.toBeInstanceOf(PermissionError);
    await expect(getGrowthActivity(db, TEST_STAFF)).rejects.toBeInstanceOf(PermissionError);
    await expect(exportCampaign(db, TEST_STAFF, { campaignId: campaign.id, ...EXPORT_TO })).rejects.toBeInstanceOf(PermissionError);
    await expect(updateCreatives(db, TEST_STAFF, { campaignId: campaign.id, texts: [{ kind: "caption", locale: "en", body: "x" }] })).rejects.toBeInstanceOf(
      PermissionError,
    );
    await expect(listCampaigns(db, null)).rejects.toBeInstanceOf(PermissionError);
    const denied = (await db.select().from(auditLog).where(eq(auditLog.outcome, "denied"))).filter((row) => row.actorId === TEST_STAFF.id);
    expect(denied).toHaveLength(6);
    expect(await db.select().from(campaigns)).toHaveLength(1);
  });
});

describe("approval", () => {
  it("lets the manager submit but not approve; the refusal is recorded; the owner can approve", async () => {
    const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "weekday_lunch", locale: "en" }, { now: NOW });
    const submitted = await submitForApproval(db, TEST_MANAGER, { campaignId: campaign.id }, NOW);
    expect(submitted.status).toBe("pending_approval");
    const before = await view(db, campaign.id);
    expect(before.approvalCurrent).toBe(false);

    // Manager: denied, audited, nothing changes.
    await expect(approveCampaign(db, TEST_MANAGER, { campaignId: campaign.id, expectedHash: before.payloadHash })).rejects.toBeInstanceOf(PermissionError);
    await expect(requestChanges(db, TEST_MANAGER, { campaignId: campaign.id, note: "shorter" })).rejects.toBeInstanceOf(PermissionError);
    const denied = await audits(db, "growth.campaign.approve", "denied");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ actorId: TEST_MANAGER.id, actorRole: "manager", permission: "growth.approve", entityType: "campaign", entityId: campaign.id });
    expect(await audits(db, "growth.campaign.request_changes", "denied")).toHaveLength(1);
    expect(await db.select().from(campaignApprovals)).toHaveLength(0);
    expect((await view(db, campaign.id)).campaign.status).toBe("pending_approval");

    // Owner: approved, with the exact content stored beside the decision.
    const approval = await approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: before.payloadHash, note: "Good to go" }, LATER);
    expect(approval).toMatchObject({
      campaignId: campaign.id,
      actorId: TEST_OWNER.id,
      actorRole: "owner",
      decision: "approved",
      payloadHash: before.payloadHash,
      note: "Good to go",
    });
    expect(approval.decidedAt).toEqual(LATER);
    // What was stored is exactly what was shown: it hashes back to the same fingerprint.
    expect(hashPayload(approval.payload)).toBe(before.payloadHash);
    expect(approval.payload).toMatchObject({ name: "Weekday lunch", budgetCents: 0, code: campaign.code });

    const after = await view(db, campaign.id);
    expect(after.campaign.status).toBe("approved");
    expect(after.approvalCurrent).toBe(true);
    expect(after.changedSinceApproval).toBe(false);
    expect(after.latestApproval).toMatchObject({ decision: "approved", actorName: "Demo Owner" });
    const [ok] = await audits(db, "growth.campaign.approve", "ok");
    expect(ok.detail).toMatchObject({ decision: "approved", from: "pending_approval", to: "approved", payloadHash: before.payloadHash, published: false });
  });

  it("refuses approval while a blocking check exists, and refuses to submit it too", async () => {
    const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "weekday_lunch", locale: "en" }, { now: NOW });
    await submitForApproval(db, TEST_MANAGER, { campaignId: campaign.id }, NOW);
    // Edited while waiting: the window now runs past closing time.
    const edited = await updateCampaign(db, TEST_MANAGER, editInput(campaign, { schedule: { ...campaign.schedule, startTime: "18:00", endTime: "21:00" } }), NOW);
    expect(edited.campaign.status).toBe("pending_approval");

    const blocked = await view(db, campaign.id);
    expect(blocked.blocked).toBe(true);
    expect(blocked.checks.filter((check) => check.level === "block").map((check) => check.code)).toEqual(["outside_hours"]);
    await expect(approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: blocked.payloadHash }, NOW)).rejects.toMatchObject({
      name: "GrowthError",
      code: "blocked_by_checks",
    });
    expect(await db.select().from(campaignApprovals)).toHaveLength(0);
    expect((await view(db, campaign.id)).campaign.status).toBe("pending_approval");
    const [refused] = await audits(db, "growth.campaign.approve", "invalid");
    expect(refused.detail).toMatchObject({ reason: "blocked_by_checks", checks: ["outside_hours"] });

    // A draft with a blocking check cannot be sent for approval either.
    const other = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "catering", locale: "en" }, { now: NOW });
    await updateCreatives(db, TEST_MANAGER, { campaignId: other.id, texts: [{ kind: "email", locale: "es", body: "" }] }, NOW);
    await expect(submitForApproval(db, TEST_MANAGER, { campaignId: other.id }, NOW)).rejects.toMatchObject({ code: "blocked_by_checks" });

    // Fixed: now it can be approved.
    await updateCampaign(db, TEST_MANAGER, editInput(campaign), NOW);
    const fixed = await view(db, campaign.id);
    expect(fixed.blocked).toBe(false);
    await approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: fixed.payloadHash }, NOW);
    expect((await view(db, campaign.id)).approvalCurrent).toBe(true);
  });

  it("refuses to approve content that changed after the owner opened the page", async () => {
    const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "weekday_lunch", locale: "en" }, { now: NOW });
    await submitForApproval(db, TEST_MANAGER, { campaignId: campaign.id }, NOW);
    const seenByOwner = (await view(db, campaign.id)).payloadHash;

    await updateCreatives(db, TEST_MANAGER, { campaignId: campaign.id, texts: [{ kind: "caption", locale: "en", body: "A different caption [campaign link]" }] }, NOW);
    await expect(approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: seenByOwner }, NOW)).rejects.toMatchObject({
      code: "changed_since_viewed",
    });
    expect(await db.select().from(campaignApprovals)).toHaveLength(0);

    const fresh = await view(db, campaign.id);
    expect(fresh.payloadHash).not.toBe(seenByOwner);
    await approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: fresh.payloadHash }, NOW);
    expect((await view(db, campaign.id)).approvalCurrent).toBe(true);
  });

  it("makes an approval stale as soon as the campaign is edited, and returns it to draft", async () => {
    const campaign = await approvedCampaign(db);
    const approved = await view(db, campaign.id);
    expect(approved.approvalCurrent).toBe(true);

    // Saving the form without changing anything keeps the approval.
    const untouched = await updateCampaign(db, TEST_MANAGER, editInput(approved.campaign), LATER);
    expect(untouched).toMatchObject({ changed: false, approvalInvalidated: false });
    expect((await view(db, campaign.id)).approvalCurrent).toBe(true);

    // A real change (here: adding paid spend) does not.
    const edited = await updateCampaign(db, TEST_MANAGER, editInput(approved.campaign, { budgetCents: 2500 }), LATER);
    expect(edited).toMatchObject({ changed: true, approvalInvalidated: true });
    expect(edited.campaign.status).toBe("draft");

    const stale = await view(db, campaign.id);
    expect(stale.approvalCurrent).toBe(false);
    expect(stale.changedSinceApproval).toBe(true);
    expect(stale.latestApproval?.decision).toBe("approved");
    expect(stale.latestApproval?.payloadHash).toBe(approved.payloadHash);
    expect(stale.payloadHash).not.toBe(approved.payloadHash);
    expect((await listCampaigns(db, TEST_OWNER))[0]).toMatchObject({ changedSinceApproval: true });
    const [audit] = await audits(db, "growth.campaign.edit", "ok");
    expect(audit.detail).toMatchObject({ approvalInvalidated: true, budgetCents: 2500 });

    // The earlier approval never comes back by itself; the owner has to approve the new content.
    await expect(approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: approved.payloadHash }, LATER)).rejects.toMatchObject({
      code: "changed_since_viewed",
    });
    await approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: stale.payloadHash }, LATER);
    const again = await view(db, campaign.id);
    expect(again.approvalCurrent).toBe(true);
    expect(again.approvals.map((approval) => approval.decision)).toEqual(["approved", "approved"]);
  });

  it("makes an approval stale when a text is edited or rebuilt, and marks edited texts", async () => {
    const campaign = await approvedCampaign(db);
    const approved = await view(db, campaign.id);
    const caption = approved.creatives.find((c) => c.kind === "caption" && c.locale === "es")!;

    // A browser sends line breaks as CRLF. The same words are not an edit.
    const same = await updateCreatives(db, TEST_MANAGER, { campaignId: campaign.id, texts: [{ kind: "caption", locale: "es", body: caption.body.replace(/\n/g, "\r\n") }] }, LATER);
    expect(same).toMatchObject({ changed: false, approvalInvalidated: false });
    expect((await view(db, campaign.id)).approvalCurrent).toBe(true);

    const edited = await updateCreatives(db, TEST_MANAGER, { campaignId: campaign.id, texts: [{ kind: "caption", locale: "es", body: `${caption.body}\n\n¡Te esperamos!` }] }, LATER);
    expect(edited).toMatchObject({ changed: true, approvalInvalidated: true });
    const stale = await view(db, campaign.id);
    expect(stale.campaign.status).toBe("draft");
    expect(stale.approvalCurrent).toBe(false);
    expect(stale.changedSinceApproval).toBe(true);
    expect(stale.creatives.find((c) => c.kind === "caption" && c.locale === "es")).toMatchObject({ origin: "owner_edit", updatedBy: TEST_MANAGER.id });
    expect(stale.creatives.filter((c) => c.origin === "template")).toHaveLength(7);

    // Approve again, then rebuild from the template: the texts change back, so it is stale again.
    await approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: stale.payloadHash }, LATER);
    const rebuilt = await regenerateCreatives(db, TEST_MANAGER, { campaignId: campaign.id }, LATER);
    expect(rebuilt.approvalInvalidated).toBe(true);
    const after = await view(db, campaign.id);
    expect(after.creatives.every((c) => c.origin === "template")).toBe(true);
    expect(after.payloadHash).toBe(approved.payloadHash);
    expect(after.approvalCurrent).toBe(false);
  });

  it("records request-changes and revoke decisions with who, when and the exact content", async () => {
    const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "weekday_lunch", locale: "en" }, { now: NOW });
    await submitForApproval(db, TEST_MANAGER, { campaignId: campaign.id }, NOW);
    await expect(requestChanges(db, TEST_OWNER, { campaignId: campaign.id, note: " " }, NOW)).rejects.toMatchObject({ code: "note_required" });

    const sentBack = await requestChanges(db, TEST_OWNER, { campaignId: campaign.id, note: "Mention the address earlier." }, NOW);
    expect(sentBack).toMatchObject({ decision: "changes_requested", note: "Mention the address earlier.", actorRole: "owner" });
    let current = await view(db, campaign.id);
    expect(current.campaign.status).toBe("draft");
    expect(current.changedSinceApproval).toBe(false);

    // The owner may approve a draft directly; then withdraw the approval.
    await approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: current.payloadHash }, MID);
    await expect(revokeApproval(db, TEST_MANAGER, { campaignId: campaign.id })).rejects.toBeInstanceOf(PermissionError);
    const revoked = await revokeApproval(db, TEST_OWNER, { campaignId: campaign.id, note: "Hold until the new hours are confirmed" }, LATER);
    expect(revoked).toMatchObject({ decision: "revoked", payloadHash: current.payloadHash });

    current = await view(db, campaign.id);
    expect(current.campaign.status).toBe("draft");
    expect(current.approvalCurrent).toBe(false);
    expect(current.approvals.map((approval) => approval.decision)).toEqual(["revoked", "approved", "changes_requested"]);
    for (const approval of current.approvals) {
      expect(approval.actorId).toBe(TEST_OWNER.id);
      expect(approval.decidedAt).toBeInstanceOf(Date);
      expect(hashPayload(approval.payload)).toBe(approval.payloadHash);
    }
    for (const action of ["request_changes", "approve", "revoke"]) {
      expect(await audits(db, `growth.campaign.${action}`, "ok")).toHaveLength(1);
    }
    // Steps that do not fit the current state are refused.
    await expect(revokeApproval(db, TEST_OWNER, { campaignId: campaign.id })).rejects.toMatchObject({ code: "invalid_state" });
    await expect(requestChanges(db, TEST_OWNER, { campaignId: campaign.id, note: "again" })).rejects.toMatchObject({ code: "invalid_state" });
    await expect(approveCampaign(db, TEST_OWNER, { campaignId: "missing", expectedHash: "x" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("editing", () => {
  it("saves the plan, keeps dishes in menu order and limits an offer to the dishes shown", async () => {
    const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "weekday_lunch", locale: "en" }, { now: NOW });
    const result = await updateCampaign(
      db,
      TEST_OWNER,
      editInput(campaign, {
        name: "  Lunch near the office  ",
        objective: "directions",
        landingPath: "/visit",
        featuredItemIds: ["butifarra", "pan-con-chicharron", "butifarra"],
        offer: {
          type: "limited_test",
          description: "Chicha morada with a sánguche",
          eligibleItemIds: ["butifarra", "triple"],
          exclusions: "",
          quantityLimit: null,
          redemptionControl: "Show the post",
          contributionMarginNote: "  ",
        },
      }),
      NOW,
    );
    expect(result.campaign).toMatchObject({
      name: "Lunch near the office",
      objective: "directions",
      landingPath: "/visit",
      featuredItemIds: ["pan-con-chicharron", "butifarra"],
      status: "draft",
    });
    expect(result.campaign.offer).toEqual({
      type: "limited_test",
      description: "Chicha morada with a sánguche",
      eligibleItemIds: ["butifarra"],
      exclusions: "",
      quantityLimit: null,
      redemptionControl: "Show the post",
      contributionMarginNote: null,
    });
    // Saved, but an incomplete limited test cannot be approved, and the margin shows as unknown.
    const current = await view(db, campaign.id);
    expect(current.checks.map((check) => [check.code, check.level])).toEqual([
      ["offer_incomplete", "block"],
      ["margin_unknown", "warn"],
    ]);
    await expect(submitForApproval(db, TEST_OWNER, { campaignId: campaign.id }, NOW)).rejects.toMatchObject({ code: "blocked_by_checks" });
  });

  it("rejects input that is not valid and saves nothing", async () => {
    const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "weekday_lunch", locale: "en" }, { now: NOW });
    const bad: Array<Partial<CampaignEditInput>> = [
      { name: " " },
      { budgetCents: -1 },
      { budgetCents: 10.5 },
      { featuredItemIds: ["dish-that-does-not-exist"] },
      { featuredItemIds: ["pan-con-chicharron", "pan-con-pollo", "butifarra", "triple", "sanguche-asado", "pan-con-pavo", "sanguche-huachana"] },
      { schedule: { ...campaign.schedule, startsOn: "2026-02-30" } },
      { schedule: { ...campaign.schedule, startTime: "25:00" } },
      { schedule: { ...campaign.schedule, weekdays: [7] } },
      { landingPath: "https://example.com" as CampaignEditInput["landingPath"] },
      { objective: "sell_more" as CampaignEditInput["objective"] },
    ];
    for (const overrides of bad) {
      await expect(updateCampaign(db, TEST_MANAGER, editInput(campaign, overrides), NOW)).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect(await audits(db, "growth.campaign.edit", "invalid")).toHaveLength(bad.length);
    expect((await view(db, campaign.id)).campaign).toMatchObject({ name: campaign.name, budgetCents: 0, featuredItemIds: campaign.featuredItemIds });
    await expect(updateCampaign(db, TEST_MANAGER, { ...editInput(campaign), campaignId: "missing" }, NOW)).rejects.toMatchObject({ code: "not_found" });
  });

  it("puts a campaign away and stops further edits", async () => {
    const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "catering", locale: "en" }, { now: NOW });
    expect((await archiveCampaign(db, TEST_MANAGER, { campaignId: campaign.id }, NOW)).status).toBe("archived");
    await expect(updateCampaign(db, TEST_MANAGER, editInput(campaign, { name: "Again" }), NOW)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(submitForApproval(db, TEST_MANAGER, { campaignId: campaign.id }, NOW)).rejects.toMatchObject({ code: "invalid_state" });
    const approved = await approvedCampaign(db);
    await expect(archiveCampaign(db, TEST_MANAGER, { campaignId: approved.id }, NOW)).rejects.toMatchObject({ code: "invalid_state" });
  });
});

describe("export", () => {
  it("says DRAFT – NOT APPROVED unless the exact content is currently approved", async () => {
    const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "weekday_lunch", locale: "en" }, { now: NOW });
    const firstLine = (body: string) => body.split("\n")[0];

    const draft = await exportCampaign(db, TEST_MANAGER, { campaignId: campaign.id, ...EXPORT_TO }, NOW);
    expect(draft).not.toBeNull();
    expect(draft!.approved).toBe(false);
    expect(firstLine(draft!.body)).toBe(`# ${EXPORT_DRAFT_HEADER}`);
    expect(EXPORT_DRAFT_HEADER).toBe("DRAFT – NOT APPROVED");
    expect(draft!.filename).toBe(`panguich-${campaign.code.toLowerCase()}-draft.md`);

    await submitForApproval(db, TEST_MANAGER, { campaignId: campaign.id }, NOW);
    const pending = await exportCampaign(db, TEST_OWNER, { campaignId: campaign.id, ...EXPORT_TO }, NOW);
    expect(firstLine(pending!.body)).toBe(`# ${EXPORT_DRAFT_HEADER}`);

    const { payloadHash } = await view(db, campaign.id);
    await approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: payloadHash }, NOW);
    const approved = await exportCampaign(db, TEST_MANAGER, { campaignId: campaign.id, ...EXPORT_TO }, LATER);
    expect(approved!.approved).toBe(true);
    expect(firstLine(approved!.body)).toBe(`# ${EXPORT_APPROVED_HEADER}`);
    expect(approved!.body).not.toContain(EXPORT_DRAFT_HEADER);
    expect(approved!.body).toContain("Approved by Demo Owner");
    expect(approved!.filename).toMatch(/-approved\.md$/);

    // Edited after approval: a draft again, and the file says so.
    await updateCreatives(db, TEST_MANAGER, { campaignId: campaign.id, texts: [{ kind: "email", locale: "en", body: "Subject: New\n\nNew email [campaign link]" }] }, LATER);
    const stale = await exportCampaign(db, TEST_OWNER, { campaignId: campaign.id, ...EXPORT_TO }, LATER);
    expect(stale!.approved).toBe(false);
    expect(firstLine(stale!.body)).toBe(`# ${EXPORT_DRAFT_HEADER}`);
    expect(stale!.body).not.toContain(EXPORT_APPROVED_HEADER);

    // Withdrawn approval: draft.
    const again = await view(db, campaign.id);
    await approveCampaign(db, TEST_OWNER, { campaignId: campaign.id, expectedHash: again.payloadHash }, LATER);
    await revokeApproval(db, TEST_OWNER, { campaignId: campaign.id }, LATER);
    expect(firstLine((await exportCampaign(db, TEST_OWNER, { campaignId: campaign.id, ...EXPORT_TO }, LATER))!.body)).toBe(`# ${EXPORT_DRAFT_HEADER}`);

    expect(await exportCampaign(db, TEST_OWNER, { campaignId: "missing", ...EXPORT_TO })).toBeNull();
    expect((await audits(db, "growth.campaign.export", "ok")).length).toBe(5);
  });

  it("contains the texts with the full campaign link, the notes, and no claim of publishing", async () => {
    const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "weekend_breakfast", locale: "en" }, { now: NOW });
    const english = (await exportCampaign(db, TEST_MANAGER, { campaignId: campaign.id, ...EXPORT_TO }, NOW))!.body;

    expect(english).toContain(`http://localhost:3210/en/menu?c=${campaign.code}`);
    expect(english).toContain(`http://localhost:3210/es/menu?c=${campaign.code}`);
    expect(english).not.toContain("[campaign link]");
    expect(english).not.toContain("[enlace de campaña]");
    expect(english).toContain("### Caption — English (Template draft)");
    expect(english).toContain("### Email — Spanish (Template draft)");
    expect(english).toContain("Weekend breakfast, Peruvian style.");
    expect(english).toContain("Desayuno de fin de semana, a la peruana.");
    expect(english).toContain("Desayuno Lurín — $20.99 (not listed for online ordering when checked)");
    expect(english).toContain("[Check before approving] The goal is pickup orders, but these dishes were not listed for online ordering");
    expect(english).toContain("Not connected — export only");
    expect(english).toContain("Nothing in this file has been published, sent or scheduled.");
    expect(english).toContain("Replace it with your real website address once that is decided.");
    expect(english).toContain("A tap is not an order.");

    const spanish = (await exportCampaign(db, TEST_OWNER, { campaignId: campaign.id, ...EXPORT_TO, locale: "es" }, NOW))!.body;
    expect(spanish.split("\n")[0]).toBe("# DRAFT – NOT APPROVED · BORRADOR – NO APROBADO");
    expect(spanish).toContain("No conectado: solo exportar");
    expect(spanish).toContain("### Correo — Español (Borrador de plantilla)");
  });
});

describe("sample data and Today", () => {
  it("seeds one sample campaign, created by the demo manager and waiting for the owner", async () => {
    await seedGrowth(db, NOW);
    const rows = await db.select().from(campaigns);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: SAMPLE_CAMPAIGN_CODE,
      name: "Sample draft · Weekday lunch",
      useCase: "weekday_lunch",
      status: "pending_approval",
      createdBy: "demo-manager",
      isSynthetic: true,
      budgetCents: 0,
    });
    expect(await db.select().from(campaignCreatives)).toHaveLength(8);
    expect(await db.select().from(campaignApprovals)).toHaveLength(0);
    const sample = await view(db, rows[0].id);
    expect(sample.checks).toEqual([]);
    expect((await exportCampaign(db, TEST_OWNER, { campaignId: rows[0].id, ...EXPORT_TO }, NOW))!.body).toContain("SAMPLE DATA");

    // Seeding again adds nothing.
    await seedGrowth(db, LATER);
    expect(await db.select().from(campaigns)).toHaveLength(1);
  });

  it("shows the pending-approval card only to the owner", async () => {
    expect(await getGrowthTodayCards(db, "owner", "en", NOW)).toEqual([]);
    await seedGrowth(db, NOW);
    const [campaign] = await db.select().from(campaigns);

    expect(await getGrowthTodayCards(db, "manager", "en", LATER)).toEqual([]);
    expect(await getGrowthTodayCards(db, "staff", "en", LATER)).toEqual([]);
    const cards = await getGrowthTodayCards(db, "owner", "en", LATER);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "growth:pending-approval",
      module: "growth",
      basis: "observed",
      synthetic: true,
      title: "1 campaign draft is waiting for your approval",
      source: "Sample campaign draft made for this demonstration",
      nextAction: { href: `/owner/grow/${campaign.id}` },
    });
    expect(cards[0].priority).toBeGreaterThanOrEqual(40);
    expect(cards[0].priority).toBeLessThanOrEqual(45);
    expect(cards[0].explanation).toContain("“Sample draft · Weekday lunch”");
    expect(cards[0].explanation).toContain("Approving does not publish anything");
    expect(cards[0].freshness).toBe("Sent for approval 3 hours ago");
    expect((await getGrowthTodayCards(db, "owner", "es", LATER))[0].title).toBe("1 borrador de campaña espera tu aprobación");

    // A real draft waiting alongside the sample: not labeled as sample any more, links to the list.
    const real = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "catering", locale: "en" }, { now: NOW });
    await submitForApproval(db, TEST_MANAGER, { campaignId: real.id }, NOW);
    const mixed = await getGrowthTodayCards(db, "owner", "en", LATER);
    expect(mixed[0]).toMatchObject({ synthetic: false, title: "2 campaign drafts are waiting for your approval", nextAction: { href: "/owner/grow" } });

    // Once decided, the card goes away.
    for (const id of [campaign.id, real.id]) {
      await approveCampaign(db, TEST_OWNER, { campaignId: id, expectedHash: (await view(db, id)).payloadHash }, LATER);
    }
    expect(await getGrowthTodayCards(db, "owner", "en", LATER)).toEqual([]);
  });
});

describe("website activity", () => {
  it("reports taps overall and per campaign code, and nothing else", async () => {
    const campaign = await createCampaignFromUseCase(db, TEST_MANAGER, { useCase: "weekday_lunch", locale: "en" }, { now: NOW });
    let n = 0;
    const tap = (type: Parameters<typeof recordSiteEvent>[1]["type"], campaignCode?: string) =>
      recordSiteEvent(db, { clientEventId: `test-event-${(n += 1)}`, type, campaignCode, path: "/en/menu" });
    await tap("menu_view");
    await tap("menu_view", campaign.code);
    await tap("order_handoff", campaign.code);
    await tap("directions_click", "OLD-CODE");

    const activity = await getGrowthActivity(db, TEST_MANAGER);
    expect(activity.overall).toMatchObject({ menu_view: 2, order_handoff: 1, directions_click: 1, call_click: 0, catering_submit: 0 });
    expect(activity.overallTotal).toBe(4);
    expect(activity.overallTotal).toBeLessThan(activity.smallSampleThreshold);
    expect(activity.byCampaign).toEqual([
      expect.objectContaining({ code: campaign.code, campaignId: campaign.id, campaignName: "Weekday lunch", total: 2 }),
      expect.objectContaining({ code: "OLD-CODE", campaignId: null, campaignName: null, total: 1 }),
    ]);
    // The activity report has taps and page views only: no orders, sales, revenue or visits.
    expect(JSON.stringify(Object.keys(activity.overall))).not.toMatch(/order"|orders|sale|revenue|visit/);
  });
});
