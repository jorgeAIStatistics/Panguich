import { and, desc, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { consentRecords, type ConsentChannel } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Locale } from "@/lib/i18n";
import { CONSENT_DISCLOSURE_VERSION, CONSENT_DISCLOSURES, UNSUBSCRIBE_DISCLOSURE, UNSUBSCRIBE_VERSION } from "./consent-text";
import { emailKey, phoneDigits } from "./schema";

/**
 * Consent is kept per contact and per channel, with the exact wording the person saw.
 *
 * Rules enforced here:
 *  - agreeing to be contacted about a request never counts as agreeing to marketing;
 *  - there is no SMS program, so SMS marketing consent is never recorded and never true;
 *  - a contact who unsubscribed is suppressed until they give a new, explicit consent;
 *  - requests typed in by the team record no consent at all: nobody showed the customer a
 *    disclosure, so there is nothing to record.
 */

/** The key a consent record is filed under: lower-cased email, or digits-only phone. */
export function contactKeyForEmail(email: string): string {
  return emailKey(email);
}
export function contactKeyForPhone(phone: string): string {
  return phoneDigits(phone);
}

export type ConsentGrant = {
  inquiryId: string;
  contactKey: string;
  channel: ConsentChannel;
  disclosureVersion: string;
  disclosureText: string;
  source: string;
  locale: Locale;
  capturedAt: Date;
};

/**
 * Consent rows for a request sent through the website form. Pure: decides what evidence to keep.
 *  - "contact me about this request" -> one transactional row per contact method given;
 *  - "email news" (optional, separate box) -> one email_marketing row, only with an email.
 * Nothing here ever produces an SMS marketing row.
 */
export function consentGrantsForWebsiteForm(input: {
  inquiryId: string;
  email: string | null;
  phone: string | null;
  consentContact: boolean;
  consentNews: boolean;
  locale: Locale;
  capturedAt: Date;
}): ConsentGrant[] {
  const base = {
    inquiryId: input.inquiryId,
    disclosureVersion: CONSENT_DISCLOSURE_VERSION,
    source: "website_catering_form",
    locale: input.locale,
    capturedAt: input.capturedAt,
  };
  const grants: ConsentGrant[] = [];
  if (input.consentContact) {
    const text = CONSENT_DISCLOSURES.transactional_contact[input.locale];
    if (input.email) grants.push({ ...base, contactKey: contactKeyForEmail(input.email), channel: "transactional_contact", disclosureText: text });
    if (input.phone) grants.push({ ...base, contactKey: contactKeyForPhone(input.phone), channel: "transactional_contact", disclosureText: text });
  }
  if (input.consentNews && input.email) {
    grants.push({
      ...base,
      contactKey: contactKeyForEmail(input.email),
      channel: "email_marketing",
      disclosureText: CONSENT_DISCLOSURES.email_marketing[input.locale],
    });
  }
  return grants;
}

export async function recordConsentGrants(db: DbOrTx, grants: readonly ConsentGrant[]): Promise<void> {
  // Belt and braces: no SMS program exists, so an SMS marketing grant is a programming error.
  if (grants.some((grant) => grant.channel === "sms_marketing")) {
    throw new Error("SMS marketing consent cannot be recorded: there is no SMS program.");
  }
  if (grants.length === 0) return;
  await db.insert(consentRecords).values(grants.map((grant) => ({ id: newId(), granted: true, ...grant })));
}

/**
 * May this contact be messaged on this channel?
 * True only when the most recent record for exactly this contact + channel is a grant that has
 * not been suppressed. Consent for one channel says nothing about another.
 */
export async function canMessage(db: DbOrTx, contactKey: string, channel: ConsentChannel): Promise<boolean> {
  if (channel === "sms_marketing") return false; // No SMS program.
  const key = contactKey.trim().toLowerCase();
  if (!key) return false;
  const recent = await db
    .select({
      granted: consentRecords.granted,
      suppressedAt: consentRecords.suppressedAt,
      capturedAt: consentRecords.capturedAt,
    })
    .from(consentRecords)
    .where(and(eq(consentRecords.contactKey, key), eq(consentRecords.channel, channel)))
    .orderBy(desc(consentRecords.capturedAt))
    .limit(10);
  if (recent.length === 0) return false;
  // If several records share the newest timestamp, every one of them must allow it.
  const newest = recent[0].capturedAt.getTime();
  return recent
    .filter((record) => record.capturedAt.getTime() === newest)
    .every((record) => record.granted && record.suppressedAt === null);
}

/**
 * Unsubscribe / STOP. Marks every existing record for the contact + channel as suppressed.
 * If there was no record, one is written so the request is remembered.
 * Only a new explicit consent given afterwards can make the contact messageable again.
 */
export async function suppressContact(
  db: DbOrTx,
  contactKey: string,
  channel: ConsentChannel,
  options: { now?: Date; source?: string; locale?: Locale; inquiryId?: string | null } = {},
): Promise<{ suppressed: number }> {
  const key = contactKey.trim().toLowerCase();
  if (!key) return { suppressed: 0 };
  const now = options.now ?? new Date();

  const updated = await db
    .update(consentRecords)
    .set({ suppressedAt: now })
    .where(and(eq(consentRecords.contactKey, key), eq(consentRecords.channel, channel), isNull(consentRecords.suppressedAt)))
    .returning({ id: consentRecords.id });

  const [existing] = await db
    .select({ id: consentRecords.id })
    .from(consentRecords)
    .where(and(eq(consentRecords.contactKey, key), eq(consentRecords.channel, channel)))
    .limit(1);
  if (!existing) {
    const locale = options.locale ?? "en";
    await db.insert(consentRecords).values({
      id: newId(),
      inquiryId: options.inquiryId ?? null,
      contactKey: key,
      channel,
      granted: false,
      disclosureVersion: UNSUBSCRIBE_VERSION,
      disclosureText: UNSUBSCRIBE_DISCLOSURE[locale],
      source: options.source ?? "unsubscribe",
      locale,
      capturedAt: now,
      suppressedAt: now,
    });
  }
  return { suppressed: updated.length };
}
