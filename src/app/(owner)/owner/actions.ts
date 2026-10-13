"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { endSession, getSessionUser, isDemoMode, startSession } from "@/lib/auth/session";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";

/** Demo sign-in: choose one of the sample identities. Refused unless demo mode is on. */
export async function demoSignIn(formData: FormData): Promise<void> {
  const userId = String(formData.get("userId") ?? "");
  const db = await getDb();
  if (!isDemoMode()) {
    await writeAudit(db, { actor: null, action: "auth.demo_sign_in", outcome: "denied", detail: { reason: "demo_mode_off" } });
    redirect("/owner/sign-in?error=unavailable");
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isDemo) {
    await writeAudit(db, { actor: null, action: "auth.demo_sign_in", outcome: "invalid", detail: { userId } });
    redirect("/owner/sign-in?error=unknown");
  }
  await startSession(user.id);
  await writeAudit(db, { actor: { id: user.id, role: user.role }, action: "auth.demo_sign_in", outcome: "ok" });
  redirect("/owner");
}

export async function signOut(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    await writeAudit(await getDb(), { actor: { id: user.id, role: user.role }, action: "auth.sign_out", outcome: "ok" });
  }
  await endSession();
  redirect("/owner/sign-in");
}

/** Remembers the person's language choice (cookie) and, when signed in, saves it to their profile. */
export async function setOwnerLanguage(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const user = await getSessionUser();
  if (user) {
    const db = await getDb();
    await db.update(users).set({ locale }).where(eq(users.id, user.id));
  }
  revalidatePath("/owner", "layout");
}
