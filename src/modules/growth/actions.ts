"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, type Db } from "@/db/client";
import { CREATIVE_KINDS, type CreativeKind } from "@/db/schema";
import type { Actor } from "@/lib/audit";
import { PermissionError } from "@/lib/auth/permissions";
import { requireUser, toActor } from "@/lib/auth/session";
import { LOCALES, type Locale } from "@/lib/i18n";
import { parseUsdToCents } from "@/lib/money";
import { getOwnerLocale } from "@/lib/owner/locale";
import {
  approveCampaign,
  archiveCampaign,
  createCampaignFromUseCase,
  regenerateCreatives,
  requestChanges,
  revokeApproval,
  submitForApproval,
  updateCampaign,
  updateCreatives,
  type CampaignEditInput,
} from "./service";
import { GrowthError } from "./types";

/**
 * Server actions for the Grow pages. Each one identifies the signed-in person and hands the
 * work to a service function, which checks the permission, applies the rules and writes the
 * audit trail. Results travel back as short codes in the address (?notice= / ?error=), never
 * as free text, so the pages work without JavaScript.
 */

const LIST = "/owner/grow";
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function fields(form: FormData, name: string): string[] {
  return form.getAll(name).filter((value): value is string => typeof value === "string" && value.length > 0);
}

type Outcome = { ok: true; notice: string } | { ok: false; code: string };

/** Runs the work as the signed-in person. `work` returns the notice code to show on success. */
async function attempt(work: (db: Db, actor: Actor, locale: Locale) => Promise<string>, deniedCode = "not_allowed"): Promise<Outcome> {
  const user = await requireUser();
  const db = await getDb();
  const locale = await getOwnerLocale(user);
  try {
    return { ok: true, notice: await work(db, toActor(user), locale) };
  } catch (error) {
    // A refusal is already in the audit log (see `authorize` and the service's own records).
    if (error instanceof PermissionError) return { ok: false, code: deniedCode };
    if (error instanceof GrowthError) return { ok: false, code: error.code };
    throw error;
  }
}

/** Runs one change on a campaign, then returns to it with a notice or an error code. */
async function perform(
  form: FormData,
  anchor: string,
  work: (db: Db, actor: Actor, campaignId: string) => Promise<string>,
  deniedCode?: string,
): Promise<never> {
  const campaignId = field(form, "campaignId");
  if (!ID_PATTERN.test(campaignId)) redirect(`${LIST}?error=not_found`);
  const outcome = await attempt((db, actor) => work(db, actor, campaignId), deniedCode);
  revalidatePath("/owner", "layout");
  if (!outcome.ok && outcome.code === "not_found") redirect(`${LIST}?error=not_found`);
  const query = outcome.ok ? `notice=${outcome.notice}` : `error=${encodeURIComponent(outcome.code)}`;
  redirect(`${LIST}/${campaignId}?${query}#${anchor}`);
}

export async function createCampaignAction(form: FormData): Promise<void> {
  let createdId = "";
  const outcome = await attempt(async (db, actor, locale) => {
    const campaign = await createCampaignFromUseCase(db, actor, { useCase: field(form, "useCase"), locale });
    createdId = campaign.id;
    return "created";
  });
  revalidatePath("/owner", "layout");
  if (!outcome.ok) redirect(`${LIST}?error=${encodeURIComponent(outcome.code)}`);
  redirect(`${LIST}/${createdId}?notice=created`);
}

/** Reads the "what, who and when" form exactly as typed. Validation happens in the service. */
function readPlan(form: FormData, campaignId: string): { input: CampaignEditInput; budgetReadable: boolean } {
  const budgetText = field(form, "budget");
  const budgetCents = budgetText === "" ? 0 : parseUsdToCents(budgetText);

  let offer: CampaignEditInput["offer"] = { type: "none" };
  if (field(form, "offerType") === "limited_test") {
    const limitMode = field(form, "offerLimitMode");
    const limitCount = field(form, "offerLimitCount");
    offer = {
      type: "limited_test",
      description: field(form, "offerDescription"),
      eligibleItemIds: fields(form, "offerEligibleItemIds"),
      exclusions: field(form, "offerExclusions"),
      // Anything that is not a clear whole number stays "not stated", which blocks approval.
      quantityLimit: limitMode === "no_limit" ? "no_limit" : limitMode === "number" && /^[1-9]\d{0,5}$/.test(limitCount) ? Number(limitCount) : null,
      redemptionControl: field(form, "offerRedemption"),
      contributionMarginNote: field(form, "offerMargin") || null,
    };
  }

  return {
    budgetReadable: budgetCents !== null,
    input: {
      campaignId,
      name: field(form, "name"),
      audience: field(form, "audience"),
      objective: field(form, "objective") as CampaignEditInput["objective"],
      landingPath: field(form, "landingPath") as CampaignEditInput["landingPath"],
      schedule: {
        startsOn: field(form, "startsOn"),
        endsOn: field(form, "endsOn"),
        weekdays: fields(form, "weekdays").map(Number),
        startTime: field(form, "startTime"),
        endTime: field(form, "endTime"),
      },
      featuredItemIds: fields(form, "featuredItemIds"),
      offer,
      // An amount that cannot be read is never guessed: -1 is refused (and recorded) by the service.
      budgetCents: budgetCents ?? -1,
    },
  };
}

export async function saveCampaignAction(form: FormData): Promise<void> {
  await perform(form, "plan", async (db, actor, campaignId) => {
    const { input, budgetReadable } = readPlan(form, campaignId);
    try {
      const result = await updateCampaign(db, actor, input);
      return !result.changed ? "nothing_changed" : result.approvalInvalidated ? "saved_needs_approval" : "saved";
    } catch (error) {
      if (error instanceof GrowthError && error.code === "invalid_input" && !budgetReadable) throw new GrowthError("invalid_budget");
      throw error;
    }
  });
}

export async function saveTextsAction(form: FormData): Promise<void> {
  await perform(form, "texts", async (db, actor, campaignId) => {
    const texts: Array<{ kind: CreativeKind; locale: Locale; body: string }> = [];
    for (const kind of CREATIVE_KINDS) {
      for (const locale of LOCALES) {
        const value = form.get(`body:${kind}:${locale}`);
        if (typeof value === "string") texts.push({ kind, locale, body: value });
      }
    }
    if (texts.length === 0) throw new GrowthError("invalid_input");
    const result = await updateCreatives(db, actor, { campaignId, texts });
    return !result.changed ? "nothing_changed" : result.approvalInvalidated ? "texts_saved_needs_approval" : "texts_saved";
  });
}

export async function rebuildTextsAction(form: FormData): Promise<void> {
  await perform(form, "texts", async (db, actor, campaignId) => {
    await regenerateCreatives(db, actor, { campaignId });
    return "texts_rebuilt";
  });
}

export async function submitForApprovalAction(form: FormData): Promise<void> {
  await perform(form, "decision", async (db, actor, campaignId) => {
    await submitForApproval(db, actor, { campaignId });
    return "submitted";
  });
}

export async function approveCampaignAction(form: FormData): Promise<void> {
  await perform(
    form,
    "decision",
    async (db, actor, campaignId) => {
      await approveCampaign(db, actor, { campaignId, expectedHash: field(form, "expectedHash"), note: field(form, "note") || null });
      return "approved";
    },
    "not_allowed_approve",
  );
}

export async function requestChangesAction(form: FormData): Promise<void> {
  await perform(
    form,
    "decision",
    async (db, actor, campaignId) => {
      await requestChanges(db, actor, { campaignId, note: field(form, "note") });
      return "changes_requested";
    },
    "not_allowed_approve",
  );
}

export async function revokeApprovalAction(form: FormData): Promise<void> {
  await perform(
    form,
    "decision",
    async (db, actor, campaignId) => {
      await revokeApproval(db, actor, { campaignId, note: field(form, "note") || null });
      return "revoked";
    },
    "not_allowed_approve",
  );
}

export async function archiveCampaignAction(form: FormData): Promise<void> {
  const campaignId = field(form, "campaignId");
  if (!ID_PATTERN.test(campaignId)) redirect(`${LIST}?error=not_found`);
  const outcome = await attempt(async (db, actor) => {
    await archiveCampaign(db, actor, { campaignId });
    return "archived";
  });
  revalidatePath("/owner", "layout");
  if (!outcome.ok) redirect(`${LIST}/${campaignId}?error=${encodeURIComponent(outcome.code)}#decision`);
  redirect(`${LIST}?notice=archived`);
}
