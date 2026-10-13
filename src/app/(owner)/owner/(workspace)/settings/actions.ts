"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { resetDemoData } from "@/db/seed";
import { authorize, writeAudit } from "@/lib/audit";
import { PermissionError } from "@/lib/auth/permissions";
import { requireUser, toActor } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { resolveConflict } from "@/modules/today/business";

/** Saves the owner's answer to one of the "your public pages disagree" questions. */
export async function answerConflict(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conflictId = String(formData.get("conflictId") ?? "");
  const answer = String(formData.get("answer") ?? "");
  let outcome = "saved";
  try {
    const result = await resolveConflict(await getDb(), toActor(user), conflictId, answer, new Date());
    if (!result.ok) outcome = result.reason;
  } catch (error) {
    if (!(error instanceof PermissionError)) throw error;
    outcome = "not_allowed";
  }
  revalidatePath("/owner", "layout");
  redirect(`/owner/settings?conflict=${outcome}#${encodeURIComponent(conflictId)}`);
}

/** Demo only: wipes what was entered here and restores the labeled sample records. */
export async function resetDemo(formData: FormData): Promise<void> {
  const user = await requireUser();
  const actor = toActor(user);
  const db = await getDb();
  let outcome = "done";
  try {
    await authorize(db, actor, "data.reset_demo", { action: "data.reset_demo" });
    if (!isDemoMode()) {
      await writeAudit(db, { actor, action: "data.reset_demo", permission: "data.reset_demo", outcome: "denied", detail: { reason: "demo_mode_off" } });
      outcome = "unavailable";
    } else if (formData.get("confirm") !== "yes") {
      outcome = "confirm";
    } else {
      await resetDemoData(db);
      await writeAudit(db, { actor, action: "data.reset_demo", permission: "data.reset_demo", outcome: "ok" });
    }
  } catch (error) {
    if (!(error instanceof PermissionError)) throw error;
    outcome = "not_allowed";
  }
  revalidatePath("/owner", "layout");
  redirect(`/owner/settings?reset=${outcome}#demo-data`);
}
