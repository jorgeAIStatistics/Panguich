"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { isDemoMode } from "@/lib/demo";
import { recordSiteEvent } from "@/modules/tracking/service";
import type { InquiryFormState } from "./form-copy";
import { EMPTY_INQUIRY_VALUES } from "./form-values";
import { cateringFormLimiters, clientKeyFromForwardedFor } from "./rate-limit";
import { cleanCampaignCode, cleanText, readInquiryForm, toLocaleOrDefault } from "./schema";
import { submitWebsiteInquiry } from "./service";

/**
 * The public catering request form posts here. No sign-in: anyone can call this, so it
 * trusts nothing it receives. It saves a request and its consent evidence, and that is all:
 * no email, no text message, no payment, nothing sent to the restaurant's other systems.
 */
export async function submitCateringInquiry(previous: InquiryFormState, formData: FormData): Promise<InquiryFormState> {
  const attempt = (previous?.attempt ?? 0) + 1;
  const values = readInquiryForm(formData);
  const locale = toLocaleOrDefault(formData.get("locale"));
  const campaignCode = cleanCampaignCode(formData.get("campaign"));

  // A field people never see. Anything typed in it comes from an automated form filler.
  if (cleanText(formData.get("website")) !== "") {
    return { status: "failed", attempt, values, errors: {}, failure: "blocked" };
  }

  const nowMs = Date.now();
  const clientKey = clientKeyFromForwardedFor((await headers()).get("x-forwarded-for"));
  const limiters = cateringFormLimiters();
  if (limiters.perClient.isLimited(clientKey, nowMs) || limiters.overall.isLimited("all", nowMs)) {
    return { status: "failed", attempt, values, errors: {}, failure: "rate_limited" };
  }

  let saved: { id: string; reference: string };
  try {
    const db = await getDb();
    const result = await submitWebsiteInquiry(db, values, { locale, campaignCode }, new Date(nowMs));
    if (!result.ok) {
      return { status: "invalid", attempt, values, errors: result.fields ?? {} };
    }
    saved = result.value;
    limiters.perClient.hit(clientKey, nowMs);
    limiters.overall.hit("all", nowMs);

    try {
      // Counted once per saved request. A tracking problem must never lose the request itself.
      await recordSiteEvent(db, {
        clientEventId: `catering_submit:${saved.id}`,
        type: "catering_submit",
        locale,
        path: `/${locale}/catering`,
        campaignCode,
      });
    } catch (error) {
      console.error("catering: could not record the catering_submit event", error);
    }
  } catch (error) {
    console.error("catering: could not save a website request", error);
    return { status: "failed", attempt, values, errors: {}, failure: "server" };
  }

  revalidatePath("/owner", "layout");
  return { status: "success", attempt, values: EMPTY_INQUIRY_VALUES, errors: {}, reference: saved.reference, demo: isDemoMode() };
}
