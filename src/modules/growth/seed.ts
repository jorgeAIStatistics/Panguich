import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { campaigns } from "@/db/schema";
import { createCampaignFromUseCase, submitForApproval } from "./service";

/** The demo identity the sample draft is recorded under. Not a real person. */
const SAMPLE_AUTHOR = { id: "demo-manager", role: "manager" } as const;

export const SAMPLE_CAMPAIGN_CODE = "LUNCH-SAMPLE";
export const SAMPLE_CAMPAIGN_NAME = "Sample draft · Weekday lunch";

/**
 * Inserts clearly labeled sample records for the demonstration.
 *
 * One sample campaign, made the same way a person would make it: created from the weekday
 * lunch template by the demo manager and sent to the owner for approval. It is stored with
 * isSynthetic = true and always shown with a "Sample data" label. It was never published,
 * because nothing in this system publishes.
 */
export async function seedGrowth(db: Db, now: Date = new Date()): Promise<void> {
  // Safe to call twice: the sample campaign is only ever created once.
  const [existing] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.code, SAMPLE_CAMPAIGN_CODE)).limit(1);
  if (existing) return;

  const campaign = await createCampaignFromUseCase(
    db,
    SAMPLE_AUTHOR,
    { useCase: "weekday_lunch", locale: "en" },
    { code: SAMPLE_CAMPAIGN_CODE, name: SAMPLE_CAMPAIGN_NAME, isSynthetic: true, now },
  );
  await submitForApproval(db, SAMPLE_AUTHOR, { campaignId: campaign.id }, now);
}
