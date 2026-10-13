"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, type Db } from "@/db/client";
import { CONSENT_CHANNELS, type ConsentChannel } from "@/db/schema";
import type { Actor } from "@/lib/audit";
import { PermissionError } from "@/lib/auth/permissions";
import { requireUser, toActor } from "@/lib/auth/session";
import { businessDateString } from "@/lib/time";
import type { InquiryFormState } from "./form-copy";
import type { QuoteFormState } from "./quote-form-state";
import { cleanText, readInquiryForm, readQuoteForm, toLocaleOrDefault, validateQuoteForm } from "./schema";
import {
  addNote,
  approveQuote,
  assignInquiry,
  changeStatus,
  createInquiryByTeam,
  createQuoteVersion,
  rebuildChecklist,
  recordUnsubscribe,
  setChecklistItemDone,
  setDepositStatus,
  setFollowUp,
  updateInquiryDetails,
  type Result,
} from "./service";

/**
 * Server actions for the owner workspace's catering pages. Each one identifies the signed-in
 * person and hands the work to a service function, which checks the permission, applies the
 * rules and writes the audit trail. Results travel back as short codes in the address
 * (`?notice=` / `?error=`), never as free text, so the pages work without JavaScript.
 */

const LIST = "/owner/catering";
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(form: FormData, name: string): string {
  return cleanText(form.get(name));
}

function detailPath(inquiryId: string): string {
  return `${LIST}/${inquiryId}`;
}

type Outcome = { ok: true } | { ok: false; code: string };

async function attempt(work: (db: Db, actor: Actor) => Promise<Result<unknown>>): Promise<Outcome> {
  const user = await requireUser();
  const db = await getDb();
  try {
    const result = await work(db, toActor(user));
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  } catch (error) {
    // The refusal is already in the audit log (see `authorize`).
    if (error instanceof PermissionError) return { ok: false, code: "not_allowed" };
    throw error;
  }
}

/** Runs one change on a request, then returns to that request with a notice or an error code. */
async function perform(
  form: FormData,
  options: { notice: string; anchor: string },
  work: (db: Db, actor: Actor, inquiryId: string) => Promise<Result<unknown>>,
): Promise<never> {
  const inquiryId = field(form, "inquiryId");
  if (!ID_PATTERN.test(inquiryId)) redirect(`${LIST}?error=not_found`);
  const outcome = await attempt((db, actor) => work(db, actor, inquiryId));
  revalidatePath("/owner", "layout");
  if (!outcome.ok && outcome.code === "not_found") redirect(`${LIST}?error=not_found`);
  const query = outcome.ok ? `notice=${options.notice}` : `error=${encodeURIComponent(outcome.code)}`;
  // `at` tells the page which section to show the message in; the #anchor scrolls there.
  redirect(`${detailPath(inquiryId)}?${query}&at=${options.anchor}#${options.anchor}`);
}

export async function changeStageAction(form: FormData): Promise<void> {
  await perform(form, { notice: "status", anchor: "stage" }, (db, actor, id) =>
    changeStatus(db, actor, id, { to: field(form, "to"), reason: field(form, "reason") }),
  );
}

export async function setDepositAction(form: FormData): Promise<void> {
  await perform(form, { notice: "deposit", anchor: "deposit" }, (db, actor, id) =>
    setDepositStatus(db, actor, id, { to: field(form, "to"), note: field(form, "note") }),
  );
}

export async function approveQuoteAction(form: FormData): Promise<void> {
  await perform(form, { notice: "quote_approved", anchor: "quote" }, (db, actor) => approveQuote(db, actor, field(form, "quoteId")));
}

export async function setFollowUpAction(form: FormData): Promise<void> {
  // The "remove date" button sends clear=1; otherwise the typed date is saved.
  const date = field(form, "clear") === "1" ? null : field(form, "followUpOn") || null;
  await perform(form, { notice: "follow_up", anchor: "assign" }, (db, actor, id) => setFollowUp(db, actor, id, { date }));
}

export async function assignAction(form: FormData): Promise<void> {
  await perform(form, { notice: "assigned", anchor: "assign" }, (db, actor, id) =>
    assignInquiry(db, actor, id, { assigneeId: field(form, "assigneeId") || null }),
  );
}

export async function addNoteAction(form: FormData): Promise<void> {
  await perform(form, { notice: "note", anchor: "history" }, (db, actor, id) => addNote(db, actor, id, { note: field(form, "note") }));
}

export async function rebuildChecklistAction(form: FormData): Promise<void> {
  await perform(form, { notice: "rebuilt", anchor: "pack" }, (db, actor, id) => rebuildChecklist(db, actor, id));
}

export async function recordUnsubscribeAction(form: FormData): Promise<void> {
  const channel = field(form, "channel");
  await perform(form, { notice: "unsubscribed", anchor: "consent" }, async (db, actor, id) => {
    if (!(CONSENT_CHANNELS as readonly string[]).includes(channel)) return { ok: false, code: "invalid_input" };
    return recordUnsubscribe(db, actor, id, channel as ConsentChannel);
  });
}

/**
 * Ticks or unticks one checklist item. On success the page simply refreshes in place, so
 * ticking a long list does not jump around; a problem returns to the request with its reason.
 */
export async function tickChecklistAction(form: FormData): Promise<void> {
  const inquiryId = field(form, "inquiryId");
  const itemId = field(form, "itemId");
  const done = field(form, "done") === "1";
  if (!ID_PATTERN.test(inquiryId) || !ID_PATTERN.test(itemId)) redirect(`${LIST}?error=not_found`);
  const outcome = await attempt((db, actor) => setChecklistItemDone(db, actor, itemId, done));
  revalidatePath("/owner", "layout");
  if (!outcome.ok) redirect(`${detailPath(inquiryId)}?error=${encodeURIComponent(outcome.code)}&at=pack#pack`);
}

/** The team's "add a request" and "edit details" form. Returns the typed values with any errors. */
export async function saveTeamInquiryAction(previous: InquiryFormState, form: FormData): Promise<InquiryFormState> {
  const attemptNumber = (previous?.attempt ?? 0) + 1;
  const values = readInquiryForm(form);
  const customerLocale = toLocaleOrDefault(form.get("customerLocale"));
  const inquiryId = field(form, "inquiryId");
  const editing = inquiryId !== "";
  if (editing && !ID_PATTERN.test(inquiryId)) redirect(`${LIST}?error=not_found`);

  const user = await requireUser();
  const db = await getDb();
  let savedId: string;
  try {
    const result = editing
      ? await updateInquiryDetails(db, toActor(user), inquiryId, values, { customerLocale })
      : await createInquiryByTeam(db, toActor(user), values, { customerLocale });
    if (!result.ok) {
      if (result.code === "not_found") redirect(`${LIST}?error=not_found`);
      if (result.code === "invalid_input") return { status: "invalid", attempt: attemptNumber, values, errors: result.fields ?? {}, customerLocale };
      return { status: "failed", attempt: attemptNumber, values, errors: {}, failure: "locked", customerLocale };
    }
    savedId = result.value.id;
  } catch (error) {
    if (error instanceof PermissionError) return { status: "failed", attempt: attemptNumber, values, errors: {}, failure: "not_allowed", customerLocale };
    throw error;
  }
  revalidatePath("/owner", "layout");
  redirect(`${detailPath(savedId)}?notice=${editing ? "updated" : "created"}`);
}

/** The "write a new quote version" form. Returns the typed rows with any errors. */
export async function saveQuoteAction(previous: QuoteFormState, form: FormData): Promise<QuoteFormState> {
  const attemptNumber = (previous?.attempt ?? 0) + 1;
  const values = readQuoteForm(form);
  const inquiryId = field(form, "inquiryId");
  if (!ID_PATTERN.test(inquiryId)) redirect(`${LIST}?error=not_found`);

  const checked = validateQuoteForm(values, { today: businessDateString(new Date()) });
  if (!checked.ok) return { attempt: attemptNumber, values, errors: checked.errors };

  const outcome = await attempt((db, actor) => createQuoteVersion(db, actor, inquiryId, checked.value));
  if (!outcome.ok) {
    if (outcome.code === "not_found") redirect(`${LIST}?error=not_found`);
    return { attempt: attemptNumber, values, errors: {}, failure: outcome.code };
  }
  revalidatePath("/owner", "layout");
  redirect(`${detailPath(inquiryId)}?notice=quote_saved&at=quote#quote`);
}
