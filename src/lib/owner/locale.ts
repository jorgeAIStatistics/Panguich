import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n";
import type { SessionUser } from "@/lib/auth/session";

/** The workspace language: the person's explicit choice if they made one, else their profile default. */
export async function getOwnerLocale(user?: SessionUser | null): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return user?.locale ?? "en";
}
