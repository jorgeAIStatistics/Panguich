import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { MENU_ITEMS } from "@/content/menu";
import type { Db, DbOrTx } from "@/db/client";
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_USE_CASES,
  campaignApprovals,
  campaignCreatives,
  campaigns,
  CREATIVE_KINDS,
  SITE_EVENT_TYPES,
  users,
  type ApprovalDecision,
  type CampaignOffer,
  type CampaignStatus,
  type CampaignUseCase,
} from "@/db/schema";
import { authorize, writeAudit, type Actor } from "@/lib/audit";
import type { Permission } from "@/lib/auth/permissions";
import { newId, newReference } from "@/lib/ids";
import { LOCALES, type Locale } from "@/lib/i18n";
import { businessDateString, isClockTime, isIsoDate } from "@/lib/time";
import { CAMPAIGN_CODE_PATTERN, getEventCounts, getEventCountsByCampaign, type EventCounts } from "@/modules/tracking/service";
import { buildApprovalPayload, hashPayload, isApprovalCurrent, type ApprovalPayload } from "./approval";
import { canonicalJson } from "./canonical";
import { hasBlockingCheck, runCampaignChecks, type CampaignCheck } from "./checks";
import { buildExportBundle } from "./export";
import { sortWeekdays } from "./schedule-text";
import { buildDraft, generateCreatives, LANDING_PATHS, MAX_FEATURED_ITEMS, USE_CASE_TEMPLATES } from "./templates";
import { GrowthError, type Approval, type Campaign, type CampaignContent, type Creative, type GrowthErrorCode } from "./types";

/**
 * Grow: bilingual campaign drafts tied to one countable action, with the owner's approval of
 * the exact content and an honest record of it.
 *
 * States: draft → pending_approval → approved, and back to draft when changes are requested,
 * approval is withdrawn, or approved content is edited. Nothing here publishes, sends or
 * spends: no social, email or advertising account is connected.
 */

const ENTITY = "campaign";

/** With fewer recorded taps than this, the interface says "too few to draw conclusions". */
export const SMALL_SAMPLE_THRESHOLD = 30;

const MENU_ORDER = new Map(MENU_ITEMS.map((item, index) => [item.id, index]));

function contentOf(campaign: Campaign): CampaignContent {
  return {
    code: campaign.code,
    name: campaign.name,
    useCase: campaign.useCase,
    objective: campaign.objective,
    audience: campaign.audience,
    offer: campaign.offer,
    schedule: campaign.schedule,
    featuredItemIds: campaign.featuredItemIds,
    landingPath: campaign.landingPath,
    budgetCents: campaign.budgetCents,
  };
}

async function refuse(
  db: DbOrTx,
  who: NonNullable<Actor>,
  permission: Permission,
  action: string,
  campaignId: string | undefined,
  code: GrowthErrorCode,
  detail: Record<string, unknown> = {},
): Promise<never> {
  await writeAudit(db, { actor: who, action, permission, entityType: ENTITY, entityId: campaignId, outcome: "invalid", detail: { reason: code, ...detail } });
  throw new GrowthError(code);
}

async function loadCampaign(db: DbOrTx, campaignId: string): Promise<{ campaign: Campaign; creatives: Creative[] } | null> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign) return null;
  const creatives = await db
    .select()
    .from(campaignCreatives)
    .where(eq(campaignCreatives.campaignId, campaignId))
    .orderBy(asc(campaignCreatives.kind), asc(campaignCreatives.locale));
  return { campaign, creatives };
}

async function latestApprovalOf(db: DbOrTx, campaignId: string): Promise<Approval | null> {
  const [latest] = await db
    .select()
    .from(campaignApprovals)
    .where(eq(campaignApprovals.campaignId, campaignId))
    .orderBy(desc(campaignApprovals.decidedAt), desc(campaignApprovals.id))
    .limit(1);
  return latest ?? null;
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export type CreateOptions = {
  /** A fixed code instead of a random one (sample data). Must match the tracking code pattern. */
  code?: string;
  name?: string;
  /** Marks the campaign as sample data made for the demonstration. */
  isSynthetic?: boolean;
  now?: Date;
};

/** Starts a draft from one of the three use cases, with template texts in both languages. */
export async function createCampaignFromUseCase(
  db: Db,
  actor: Actor,
  input: { useCase: string; locale: Locale },
  options: CreateOptions = {},
): Promise<Campaign> {
  const action = "growth.campaign.create";
  const who = await authorize(db, actor, "growth.edit", { action, entityType: ENTITY });
  const useCase = z.enum(CAMPAIGN_USE_CASES).safeParse(input.useCase);
  if (!useCase.success || (options.code !== undefined && !CAMPAIGN_CODE_PATTERN.test(options.code))) {
    return refuse(db, who, "growth.edit", action, undefined, "invalid_input");
  }

  const template = USE_CASE_TEMPLATES[useCase.data as CampaignUseCase];
  let code = options.code ?? newReference(template.codePrefix, 4);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const [taken] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.code, code)).limit(1);
    if (!taken) break;
    if (options.code !== undefined || attempt === 5) return refuse(db, who, "growth.edit", action, undefined, "invalid_input", { code });
    code = newReference(template.codePrefix, 4);
  }

  const now = options.now ?? new Date();
  const draft = buildDraft(template.useCase, { code, today: businessDateString(now), locale: input.locale });
  const content: CampaignContent = { ...draft, name: options.name ?? draft.name };
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(campaigns).values({
      id,
      ...content,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      createdBy: who.id,
      isSynthetic: options.isSynthetic ?? false,
    });
    await tx.insert(campaignCreatives).values(
      generateCreatives(content).map((creative) => ({ id: newId(), campaignId: id, ...creative, updatedAt: now, updatedBy: who.id })),
    );
    await writeAudit(tx, {
      actor: who,
      action,
      permission: "growth.edit",
      entityType: ENTITY,
      entityId: id,
      outcome: "ok",
      detail: { useCase: template.useCase, code, isSynthetic: options.isSynthetic ?? false },
    });
  });
  const created = await loadCampaign(db, id);
  return created!.campaign;
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export type CampaignListItem = { campaign: Campaign; changedSinceApproval: boolean };

export async function listCampaigns(db: DbOrTx, actor: Actor): Promise<CampaignListItem[]> {
  await authorize(db, actor, "growth.view", { action: "growth.view" });
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.updatedAt), asc(campaigns.id));
  const decisions = await db
    .select({ campaignId: campaignApprovals.campaignId, decision: campaignApprovals.decision })
    .from(campaignApprovals)
    .orderBy(desc(campaignApprovals.decidedAt), desc(campaignApprovals.id));
  const latest = new Map<string, ApprovalDecision>();
  for (const row of decisions) if (!latest.has(row.campaignId)) latest.set(row.campaignId, row.decision);
  const order: Record<CampaignStatus, number> = { pending_approval: 0, draft: 1, approved: 2, archived: 3 };
  return rows
    .map((campaign) => ({ campaign, changedSinceApproval: campaign.status === "draft" && latest.get(campaign.id) === "approved" }))
    .sort((a, b) => order[a.campaign.status] - order[b.campaign.status]);
}

export type ApprovalRecord = Approval & { actorName: string | null };

export type CampaignView = {
  campaign: Campaign;
  creatives: Creative[];
  /** Newest first. */
  approvals: ApprovalRecord[];
  latestApproval: ApprovalRecord | null;
  /** The exact content an approval would cover right now, and its fingerprint. */
  payload: ApprovalPayload;
  payloadHash: string;
  /** The latest decision is an approval of exactly the current content. */
  approvalCurrent: boolean;
  /** It was approved, and the content is no longer what was approved. */
  changedSinceApproval: boolean;
  checks: CampaignCheck[];
  blocked: boolean;
};

export async function getCampaignView(
  db: DbOrTx,
  actor: Actor,
  campaignId: string,
  options: { locale: Locale; now?: Date },
): Promise<CampaignView | null> {
  await authorize(db, actor, "growth.view", { action: "growth.campaign.view", entityType: ENTITY, entityId: campaignId });
  const loaded = await loadCampaign(db, campaignId);
  if (!loaded) return null;
  const { campaign, creatives } = loaded;
  const approvalRows = await db
    .select({ approval: campaignApprovals, actorName: users.name })
    .from(campaignApprovals)
    .leftJoin(users, eq(campaignApprovals.actorId, users.id))
    .where(eq(campaignApprovals.campaignId, campaignId))
    .orderBy(desc(campaignApprovals.decidedAt), desc(campaignApprovals.id));
  const approvals = approvalRows.map((row) => ({ ...row.approval, actorName: row.actorName }));
  const latestApproval = approvals[0] ?? null;

  const content = contentOf(campaign);
  const payload = buildApprovalPayload(content, creatives);
  const approvalCurrent = isApprovalCurrent(campaign, creatives, latestApproval);
  const checks = runCampaignChecks(content, creatives, options.locale, businessDateString(options.now ?? new Date()));
  return {
    campaign,
    creatives,
    approvals,
    latestApproval,
    payload,
    payloadHash: hashPayload(payload),
    approvalCurrent,
    changedSinceApproval: latestApproval?.decision === "approved" && !approvalCurrent && campaign.status !== "archived",
    checks,
    blocked: hasBlockingCheck(checks),
  };
}

/* ------------------------------------------------------------------ */
/* Edit                                                                */
/* ------------------------------------------------------------------ */

const isoDate = z.string().refine(isIsoDate);
const clockTime = z.string().refine(isClockTime);

const offerInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("limited_test"),
    description: z.string().trim().max(500),
    eligibleItemIds: z.array(z.string().max(80)).max(40),
    exclusions: z.string().trim().max(500),
    quantityLimit: z.union([z.number().int().positive().max(1_000_000), z.literal("no_limit"), z.null()]),
    redemptionControl: z.string().trim().max(500),
    contributionMarginNote: z.string().trim().max(500).nullable(),
  }),
]);

export const campaignEditInput = z.object({
  campaignId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  audience: z.string().trim().max(600),
  objective: z.enum(CAMPAIGN_OBJECTIVES),
  landingPath: z.enum(LANDING_PATHS),
  schedule: z.object({
    startsOn: isoDate,
    endsOn: isoDate,
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    startTime: clockTime,
    endTime: clockTime,
  }),
  featuredItemIds: z.array(z.string().max(80)).max(40),
  offer: offerInput,
  budgetCents: z.number().int().min(0).max(10_000_000),
});
export type CampaignEditInput = z.input<typeof campaignEditInput>;

export type EditResult = {
  campaign: Campaign;
  changed: boolean;
  /** True when this edit changed approved content, so the campaign went back to draft. */
  approvalInvalidated: boolean;
};

/** Known menu dishes only, no repeats, in menu order. Returns null if any id is unknown. */
function normalizeItemIds(ids: readonly string[]): string[] | null {
  const unique = [...new Set(ids)];
  if (unique.some((id) => !MENU_ORDER.has(id))) return null;
  return unique.sort((a, b) => MENU_ORDER.get(a)! - MENU_ORDER.get(b)!);
}

/**
 * After any edit: if the campaign was approved and its content is no longer exactly what was
 * approved, it goes back to draft. Decided by re-hashing, not by trusting the caller.
 */
async function invalidateApprovalIfChanged(tx: DbOrTx, campaignId: string): Promise<boolean> {
  const loaded = await loadCampaign(tx, campaignId);
  if (!loaded || loaded.campaign.status !== "approved") return false;
  if (isApprovalCurrent(loaded.campaign, loaded.creatives, await latestApprovalOf(tx, campaignId))) return false;
  await tx.update(campaigns).set({ status: "draft" }).where(eq(campaigns.id, campaignId));
  return true;
}

export async function updateCampaign(db: Db, actor: Actor, input: CampaignEditInput, now: Date = new Date()): Promise<EditResult> {
  const action = "growth.campaign.edit";
  const campaignId = typeof input?.campaignId === "string" ? input.campaignId : undefined;
  const who = await authorize(db, actor, "growth.edit", { action, entityType: ENTITY, entityId: campaignId });
  const parsed = campaignEditInput.safeParse(input);
  if (!parsed.success) return refuse(db, who, "growth.edit", action, campaignId, "invalid_input", { fields: parsed.error.issues.map((issue) => issue.path.join(".")) });
  const data = parsed.data;

  const loaded = await loadCampaign(db, data.campaignId);
  if (!loaded) return refuse(db, who, "growth.edit", action, data.campaignId, "not_found");
  if (loaded.campaign.status === "archived") return refuse(db, who, "growth.edit", action, data.campaignId, "invalid_state", { status: "archived" });

  const featuredItemIds = normalizeItemIds(data.featuredItemIds);
  if (!featuredItemIds || featuredItemIds.length > MAX_FEATURED_ITEMS) {
    return refuse(db, who, "growth.edit", action, data.campaignId, "invalid_input", { fields: ["featuredItemIds"] });
  }
  let offer: CampaignOffer = { type: "none" };
  if (data.offer.type === "limited_test") {
    const eligible = normalizeItemIds(data.offer.eligibleItemIds);
    if (!eligible) return refuse(db, who, "growth.edit", action, data.campaignId, "invalid_input", { fields: ["offer.eligibleItemIds"] });
    offer = {
      type: "limited_test",
      description: data.offer.description,
      // An offer only makes sense on dishes the campaign shows.
      eligibleItemIds: eligible.filter((id) => featuredItemIds.includes(id)),
      exclusions: data.offer.exclusions,
      quantityLimit: data.offer.quantityLimit,
      redemptionControl: data.offer.redemptionControl,
      contributionMarginNote: data.offer.contributionMarginNote?.trim() ? data.offer.contributionMarginNote.trim() : null,
    };
  }

  const before = contentOf(loaded.campaign);
  const after: CampaignContent = {
    ...before,
    name: data.name,
    audience: data.audience,
    objective: data.objective,
    landingPath: data.landingPath,
    schedule: { ...data.schedule, weekdays: sortWeekdays(data.schedule.weekdays) },
    featuredItemIds,
    offer,
    budgetCents: data.budgetCents,
  };
  if (canonicalJson(before) === canonicalJson(after)) return { campaign: loaded.campaign, changed: false, approvalInvalidated: false };

  const approvalInvalidated = await db.transaction(async (tx) => {
    await tx
      .update(campaigns)
      .set({
        name: after.name,
        audience: after.audience,
        objective: after.objective,
        landingPath: after.landingPath,
        schedule: after.schedule,
        featuredItemIds: after.featuredItemIds,
        offer: after.offer,
        budgetCents: after.budgetCents,
        updatedAt: now,
      })
      .where(eq(campaigns.id, data.campaignId));
    const invalidated = await invalidateApprovalIfChanged(tx, data.campaignId);
    await writeAudit(tx, {
      actor: who,
      action,
      permission: "growth.edit",
      entityType: ENTITY,
      entityId: data.campaignId,
      outcome: "ok",
      detail: { approvalInvalidated: invalidated, budgetCents: after.budgetCents },
    });
    return invalidated;
  });
  return { campaign: (await loadCampaign(db, data.campaignId))!.campaign, changed: true, approvalInvalidated };
}

const creativeTextsInput = z.object({
  campaignId: z.string().min(1),
  texts: z
    .array(z.object({ kind: z.enum(CREATIVE_KINDS), locale: z.enum(LOCALES), body: z.string().max(6000) }))
    .min(1)
    .max(CREATIVE_KINDS.length * LOCALES.length),
});
export type CreativeTextsInput = z.input<typeof creativeTextsInput>;

/** Browsers send textarea line breaks as CRLF; stored text uses LF so an untouched text stays untouched. */
function normalizeBody(body: string): string {
  return body.replace(/\r\n?/g, "\n").trimEnd();
}

/** Saves edited texts. A text whose words changed is marked as edited by a person. */
export async function updateCreatives(db: Db, actor: Actor, input: CreativeTextsInput, now: Date = new Date()): Promise<EditResult> {
  const action = "growth.creative.edit";
  const campaignId = typeof input?.campaignId === "string" ? input.campaignId : undefined;
  const who = await authorize(db, actor, "growth.edit", { action, entityType: ENTITY, entityId: campaignId });
  const parsed = creativeTextsInput.safeParse(input);
  if (!parsed.success) return refuse(db, who, "growth.edit", action, campaignId, "invalid_input");
  const data = parsed.data;

  const loaded = await loadCampaign(db, data.campaignId);
  if (!loaded) return refuse(db, who, "growth.edit", action, data.campaignId, "not_found");
  if (loaded.campaign.status === "archived") return refuse(db, who, "growth.edit", action, data.campaignId, "invalid_state", { status: "archived" });

  const changes = data.texts
    .map((text) => ({ ...text, body: normalizeBody(text.body) }))
    .filter((text) => loaded.creatives.find((c) => c.kind === text.kind && c.locale === text.locale)?.body !== text.body);
  if (changes.length === 0) return { campaign: loaded.campaign, changed: false, approvalInvalidated: false };

  const approvalInvalidated = await db.transaction(async (tx) => {
    for (const change of changes) {
      await tx
        .insert(campaignCreatives)
        .values({ id: newId(), campaignId: data.campaignId, kind: change.kind, locale: change.locale, body: change.body, origin: "owner_edit", updatedAt: now, updatedBy: who.id })
        .onConflictDoUpdate({
          target: [campaignCreatives.campaignId, campaignCreatives.kind, campaignCreatives.locale],
          set: { body: change.body, origin: "owner_edit", updatedAt: now, updatedBy: who.id },
        });
    }
    await tx.update(campaigns).set({ updatedAt: now }).where(eq(campaigns.id, data.campaignId));
    const invalidated = await invalidateApprovalIfChanged(tx, data.campaignId);
    await writeAudit(tx, {
      actor: who,
      action,
      permission: "growth.edit",
      entityType: ENTITY,
      entityId: data.campaignId,
      outcome: "ok",
      detail: { edited: changes.map((change) => `${change.kind}:${change.locale}`), approvalInvalidated: invalidated },
    });
    return invalidated;
  });
  return { campaign: (await loadCampaign(db, data.campaignId))!.campaign, changed: true, approvalInvalidated };
}

/** Rewrites all eight texts from the template for the campaign as it stands now. Replaces edits. */
export async function regenerateCreatives(db: Db, actor: Actor, input: { campaignId: string }, now: Date = new Date()): Promise<EditResult> {
  const action = "growth.creative.rebuild";
  const who = await authorize(db, actor, "growth.edit", { action, entityType: ENTITY, entityId: input.campaignId });
  const loaded = await loadCampaign(db, input.campaignId);
  if (!loaded) return refuse(db, who, "growth.edit", action, input.campaignId, "not_found");
  if (loaded.campaign.status === "archived") return refuse(db, who, "growth.edit", action, input.campaignId, "invalid_state", { status: "archived" });

  const fresh = generateCreatives(contentOf(loaded.campaign));
  const approvalInvalidated = await db.transaction(async (tx) => {
    for (const creative of fresh) {
      await tx
        .insert(campaignCreatives)
        .values({ id: newId(), campaignId: input.campaignId, ...creative, updatedAt: now, updatedBy: who.id })
        .onConflictDoUpdate({
          target: [campaignCreatives.campaignId, campaignCreatives.kind, campaignCreatives.locale],
          set: { body: creative.body, origin: "template", updatedAt: now, updatedBy: who.id },
        });
    }
    await tx.update(campaigns).set({ updatedAt: now }).where(eq(campaigns.id, input.campaignId));
    const invalidated = await invalidateApprovalIfChanged(tx, input.campaignId);
    await writeAudit(tx, { actor: who, action, permission: "growth.edit", entityType: ENTITY, entityId: input.campaignId, outcome: "ok", detail: { approvalInvalidated: invalidated } });
    return invalidated;
  });
  return { campaign: (await loadCampaign(db, input.campaignId))!.campaign, changed: true, approvalInvalidated };
}

/* ------------------------------------------------------------------ */
/* Approval flow                                                       */
/* ------------------------------------------------------------------ */

function blockingCodes(campaign: Campaign, creatives: Creative[], now: Date): string[] {
  return runCampaignChecks(contentOf(campaign), creatives, "en", businessDateString(now))
    .filter((check) => check.level === "block")
    .map((check) => check.code);
}

/** draft → pending_approval. Anyone who can edit campaigns. */
export async function submitForApproval(db: Db, actor: Actor, input: { campaignId: string }, now: Date = new Date()): Promise<Campaign> {
  const action = "growth.campaign.submit";
  const who = await authorize(db, actor, "growth.edit", { action, entityType: ENTITY, entityId: input.campaignId });
  const loaded = await loadCampaign(db, input.campaignId);
  if (!loaded) return refuse(db, who, "growth.edit", action, input.campaignId, "not_found");
  if (loaded.campaign.status !== "draft") return refuse(db, who, "growth.edit", action, input.campaignId, "invalid_state", { status: loaded.campaign.status });
  const blocking = blockingCodes(loaded.campaign, loaded.creatives, now);
  if (blocking.length > 0) return refuse(db, who, "growth.edit", action, input.campaignId, "blocked_by_checks", { checks: blocking });

  await db.transaction(async (tx) => {
    await tx.update(campaigns).set({ status: "pending_approval", updatedAt: now }).where(eq(campaigns.id, input.campaignId));
    await writeAudit(tx, { actor: who, action, permission: "growth.edit", entityType: ENTITY, entityId: input.campaignId, outcome: "ok", detail: { from: "draft", to: "pending_approval" } });
  });
  return (await loadCampaign(db, input.campaignId))!.campaign;
}

async function recordDecision(
  tx: DbOrTx,
  who: NonNullable<Actor>,
  campaign: Campaign,
  creatives: Creative[],
  decision: ApprovalDecision,
  toStatus: CampaignStatus,
  note: string | null,
  now: Date,
  action: string,
): Promise<Approval> {
  const payload = buildApprovalPayload(contentOf(campaign), creatives);
  const payloadHash = hashPayload(payload);
  const [approval] = await tx
    .insert(campaignApprovals)
    .values({ id: newId(), campaignId: campaign.id, decidedAt: now, actorId: who.id, actorRole: who.role, decision, payloadHash, payload, note })
    .returning();
  await tx.update(campaigns).set({ status: toStatus, updatedAt: now }).where(eq(campaigns.id, campaign.id));
  await writeAudit(tx, {
    actor: who,
    action,
    permission: "growth.approve",
    entityType: ENTITY,
    entityId: campaign.id,
    outcome: "ok",
    detail: { decision, from: campaign.status, to: toStatus, payloadHash, budgetCents: campaign.budgetCents, published: false },
  });
  return approval;
}

function cleanNote(note: string | null | undefined): string | null {
  const text = (note ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 1000);
  return text.length > 0 ? text : null;
}

/**
 * The owner approves the exact content. `expectedHash` is the fingerprint of what was on the
 * owner's screen: if anything changed since the page was opened, approval is refused and they
 * must read it again. Refused while any blocking check fails. Publishes nothing.
 */
export async function approveCampaign(
  db: Db,
  actor: Actor,
  input: { campaignId: string; expectedHash: string; note?: string | null },
  now: Date = new Date(),
): Promise<Approval> {
  const action = "growth.campaign.approve";
  const who = await authorize(db, actor, "growth.approve", { action, entityType: ENTITY, entityId: input.campaignId });
  const loaded = await loadCampaign(db, input.campaignId);
  if (!loaded) return refuse(db, who, "growth.approve", action, input.campaignId, "not_found");
  const { campaign, creatives } = loaded;
  // Also allowed: an "approved" campaign whose approval stopped counting because the menu
  // facts behind it changed. It needs approving again, exactly like an edited one.
  const needsApprovalAgain = campaign.status === "approved" && !isApprovalCurrent(campaign, creatives, await latestApprovalOf(db, campaign.id));
  if (campaign.status !== "pending_approval" && campaign.status !== "draft" && !needsApprovalAgain) {
    return refuse(db, who, "growth.approve", action, input.campaignId, "invalid_state", { status: campaign.status });
  }
  const blocking = blockingCodes(campaign, creatives, now);
  if (blocking.length > 0) return refuse(db, who, "growth.approve", action, input.campaignId, "blocked_by_checks", { checks: blocking });
  const currentHash = hashPayload(buildApprovalPayload(contentOf(campaign), creatives));
  if (input.expectedHash !== currentHash) return refuse(db, who, "growth.approve", action, input.campaignId, "changed_since_viewed");

  return db.transaction((tx) => recordDecision(tx, who, campaign, creatives, "approved", "approved", cleanNote(input.note), now, action));
}

/** The owner sends a pending campaign back with a note saying what should change. */
export async function requestChanges(db: Db, actor: Actor, input: { campaignId: string; note: string }, now: Date = new Date()): Promise<Approval> {
  const action = "growth.campaign.request_changes";
  const who = await authorize(db, actor, "growth.approve", { action, entityType: ENTITY, entityId: input.campaignId });
  const loaded = await loadCampaign(db, input.campaignId);
  if (!loaded) return refuse(db, who, "growth.approve", action, input.campaignId, "not_found");
  if (loaded.campaign.status !== "pending_approval") {
    return refuse(db, who, "growth.approve", action, input.campaignId, "invalid_state", { status: loaded.campaign.status });
  }
  const note = cleanNote(input.note);
  if (!note || note.length < 3) return refuse(db, who, "growth.approve", action, input.campaignId, "note_required");
  return db.transaction((tx) => recordDecision(tx, who, loaded.campaign, loaded.creatives, "changes_requested", "draft", note, now, action));
}

/** The owner withdraws an approval. The campaign becomes a draft again. */
export async function revokeApproval(db: Db, actor: Actor, input: { campaignId: string; note?: string | null }, now: Date = new Date()): Promise<Approval> {
  const action = "growth.campaign.revoke";
  const who = await authorize(db, actor, "growth.approve", { action, entityType: ENTITY, entityId: input.campaignId });
  const loaded = await loadCampaign(db, input.campaignId);
  if (!loaded) return refuse(db, who, "growth.approve", action, input.campaignId, "not_found");
  if (loaded.campaign.status !== "approved") {
    return refuse(db, who, "growth.approve", action, input.campaignId, "invalid_state", { status: loaded.campaign.status });
  }
  return db.transaction((tx) => recordDecision(tx, who, loaded.campaign, loaded.creatives, "revoked", "draft", cleanNote(input.note), now, action));
}

/** Puts a draft or pending campaign away. An approved one has to be withdrawn first. */
export async function archiveCampaign(db: Db, actor: Actor, input: { campaignId: string }, now: Date = new Date()): Promise<Campaign> {
  const action = "growth.campaign.archive";
  const who = await authorize(db, actor, "growth.edit", { action, entityType: ENTITY, entityId: input.campaignId });
  const loaded = await loadCampaign(db, input.campaignId);
  if (!loaded) return refuse(db, who, "growth.edit", action, input.campaignId, "not_found");
  if (loaded.campaign.status !== "draft" && loaded.campaign.status !== "pending_approval") {
    return refuse(db, who, "growth.edit", action, input.campaignId, "invalid_state", { status: loaded.campaign.status });
  }
  await db.transaction(async (tx) => {
    await tx
      .update(campaigns)
      .set({ status: "archived", updatedAt: now })
      .where(and(eq(campaigns.id, input.campaignId), eq(campaigns.status, loaded.campaign.status)));
    await writeAudit(tx, { actor: who, action, permission: "growth.edit", entityType: ENTITY, entityId: input.campaignId, outcome: "ok", detail: { from: loaded.campaign.status, to: "archived" } });
  });
  return (await loadCampaign(db, input.campaignId))!.campaign;
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export type CampaignExport = { filename: string; body: string; approved: boolean };

/**
 * The drafts as a text file for the owner to copy from. The file says DRAFT – NOT APPROVED
 * unless the latest decision is an approval of exactly the content in the file.
 */
export async function exportCampaign(
  db: DbOrTx,
  actor: Actor,
  input: { campaignId: string; locale: Locale; siteOrigin: string; siteOriginIsProvisional: boolean },
  now: Date = new Date(),
): Promise<CampaignExport | null> {
  const action = "growth.campaign.export";
  const view = await getCampaignView(db, actor, input.campaignId, { locale: input.locale, now });
  if (!view) return null;
  const approved = view.approvalCurrent && view.latestApproval !== null;
  const bundle = buildExportBundle({
    payload: view.payload,
    payloadHash: view.payloadHash,
    currentApproval: approved ? { decidedAt: view.latestApproval!.decidedAt, approverName: view.latestApproval!.actorName ?? view.latestApproval!.actorRole } : null,
    isSynthetic: view.campaign.isSynthetic,
    checks: view.checks,
    locale: input.locale,
    siteOrigin: input.siteOrigin.replace(/\/$/, ""),
    siteOriginIsProvisional: input.siteOriginIsProvisional,
    exportedAt: now,
  });
  await writeAudit(db, {
    actor,
    action,
    permission: "growth.view",
    entityType: ENTITY,
    entityId: input.campaignId,
    outcome: "ok",
    detail: { approved, payloadHash: view.payloadHash },
  });
  return { ...bundle, approved };
}

/* ------------------------------------------------------------------ */
/* Website activity                                                    */
/* ------------------------------------------------------------------ */

export type GrowthActivity = {
  /** Everything this website recorded in this environment. Taps and page views, never orders. */
  overall: EventCounts;
  overallTotal: number;
  byCampaign: Array<{ code: string; campaignId: string | null; campaignName: string | null; isSynthetic: boolean; counts: EventCounts; total: number }>;
  smallSampleThreshold: number;
};

function totalOf(counts: EventCounts): number {
  return SITE_EVENT_TYPES.reduce((sum, type) => sum + counts[type], 0);
}

export async function getGrowthActivity(db: DbOrTx, actor: Actor): Promise<GrowthActivity> {
  await authorize(db, actor, "growth.view", { action: "growth.activity.view" });
  const overall = await getEventCounts(db);
  const perCode = await getEventCountsByCampaign(db);
  const known = await db.select({ id: campaigns.id, code: campaigns.code, name: campaigns.name, isSynthetic: campaigns.isSynthetic }).from(campaigns);
  const byCode = new Map(known.map((campaign) => [campaign.code, campaign]));
  return {
    overall,
    overallTotal: totalOf(overall),
    byCampaign: Object.entries(perCode)
      .map(([code, counts]) => {
        const campaign = byCode.get(code);
        return { code, campaignId: campaign?.id ?? null, campaignName: campaign?.name ?? null, isSynthetic: campaign?.isSynthetic ?? false, counts, total: totalOf(counts) };
      })
      .sort((a, b) => b.total - a.total || (a.code < b.code ? -1 : 1)),
    smallSampleThreshold: SMALL_SAMPLE_THRESHOLD,
  };
}
