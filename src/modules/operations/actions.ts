"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, type Db } from "@/db/client";
import type { Actor } from "@/lib/audit";
import { PermissionError } from "@/lib/auth/permissions";
import { requireUser, toActor } from "@/lib/auth/session";
import { parseUsdToCents } from "@/lib/money";
import { OperationsError } from "./errors";
import {
  approveSupplierQuestion,
  assignException,
  dismissException,
  recordCashRecovered,
  recordCredit,
  updateDraftQuestion,
  validateException,
} from "./service";

/**
 * Server actions for the Operations pages. Each one identifies the signed-in person and hands
 * the work to a service function, which checks the permission, applies the rules and writes
 * the history and the audit trail. Results travel back as short codes in the address
 * (?notice= / ?error=), never as free text, so the pages work without JavaScript.
 *
 * None of these contacts a supplier or moves money.
 */

const LIST = "/owner/operations";
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Runs one step on an exception, then returns to it with a notice or an error code. */
async function perform(
  form: FormData,
  options: { notice: string; anchor: string; invalidInputCode?: string },
  work: (db: Db, actor: Actor, exceptionId: string) => Promise<unknown>,
): Promise<never> {
  const user = await requireUser();
  const exceptionId = field(form, "exceptionId");
  if (!ID_PATTERN.test(exceptionId)) redirect(`${LIST}?error=not_found`);

  let code: string | null = null;
  try {
    await work(await getDb(), toActor(user), exceptionId);
  } catch (error) {
    // A refusal is already in the audit log (see `authorize` and the service's own records).
    if (error instanceof PermissionError) code = "not_allowed";
    else if (error instanceof OperationsError) code = error.code === "invalid_input" ? (options.invalidInputCode ?? "invalid_input") : error.code;
    else throw error;
  }
  revalidatePath("/owner", "layout");
  if (code === "not_found") redirect(`${LIST}?error=not_found`);
  const query = code ? `error=${encodeURIComponent(code)}` : `notice=${options.notice}`;
  redirect(`${LIST}/exceptions/${exceptionId}?${query}#${options.anchor}`);
}

export async function validateExceptionAction(form: FormData): Promise<void> {
  await perform(form, { notice: "validated", anchor: "actions" }, (db, actor, exceptionId) => validateException(db, actor, { exceptionId }));
}

export async function dismissExceptionAction(form: FormData): Promise<void> {
  await perform(form, { notice: "dismissed", anchor: "actions", invalidInputCode: "reason_required" }, (db, actor, exceptionId) =>
    dismissException(db, actor, { exceptionId, reason: field(form, "reason") }),
  );
}

export async function assignExceptionAction(form: FormData): Promise<void> {
  await perform(form, { notice: "assigned", anchor: "actions" }, (db, actor, exceptionId) =>
    assignException(db, actor, { exceptionId, assigneeId: field(form, "assigneeId") || null }),
  );
}

export async function saveQuestionAction(form: FormData): Promise<void> {
  await perform(form, { notice: "question_saved", anchor: "question" }, (db, actor, exceptionId) => {
    const en = form.get("questionEn");
    const es = form.get("questionEs");
    return updateDraftQuestion(db, actor, { exceptionId, en: typeof en === "string" ? en : "", es: typeof es === "string" ? es : "" });
  });
}

/** Records the owner's approval of the wording. Sends nothing. */
export async function approveQuestionAction(form: FormData): Promise<void> {
  await perform(form, { notice: "question_approved", anchor: "question" }, (db, actor, exceptionId) =>
    approveSupplierQuestion(db, actor, { exceptionId, expectedHash: field(form, "expectedHash") }),
  );
}

export async function recordCreditAction(form: FormData): Promise<void> {
  await perform(form, { notice: "credit_recorded", anchor: "actions", invalidInputCode: "amount_invalid" }, (db, actor, exceptionId) => {
    // An amount that cannot be read is never guessed: NaN is refused (and recorded) by the service.
    const amountCents = parseUsdToCents(field(form, "amount")) ?? Number.NaN;
    return recordCredit(db, actor, { exceptionId, amountCents });
  });
}

export async function recordCashAction(form: FormData): Promise<void> {
  await perform(form, { notice: "cash_recorded", anchor: "actions" }, (db, actor, exceptionId) => recordCashRecovered(db, actor, { exceptionId }));
}
