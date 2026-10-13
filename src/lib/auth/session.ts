import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { dataDir, getDb } from "@/db/client";
import { users } from "@/db/schema";
import { writeAudit, type Actor } from "@/lib/audit";
import { isDemoMode } from "@/lib/demo";
import type { Locale } from "@/lib/i18n";
import { can, type Permission, type Role } from "./permissions";
import { signSession, verifySession } from "./token";

export const SESSION_COOKIE = "pg_session";
const SESSION_HOURS = 12;

export type SessionUser = { id: string; name: string; role: Role; locale: Locale; isDemo: boolean };

export { isDemoMode };

let cachedSecret: string | undefined;

async function sessionSecret(): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!isDemoMode()) throw new Error("SESSION_SECRET must be set when demo mode is off.");
  if (cachedSecret) return cachedSecret;
  // Demo only: a random key generated once per install, kept out of the repository.
  const file = path.join(path.dirname(dataDir()), "session-secret");
  try {
    cachedSecret = (await fs.readFile(file, "utf8")).trim();
  } catch {
    cachedSecret = randomBytes(32).toString("hex");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

/** The signed-in person, with their role read fresh from the database on every request. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySession(token, await sessionSecret(), Math.floor(Date.now() / 1000));
  if (!payload) return null;
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, payload.uid)).limit(1);
  if (!user) return null;
  // A demo identity is only valid while demo mode is on.
  if (user.isDemo && !isDemoMode()) return null;
  return { id: user.id, name: user.name, role: user.role, locale: user.locale, isDemo: user.isDemo };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/owner/sign-in");
  return user;
}

/** For pages: sends the person to a plain "not available for your role" screen and logs the refusal. */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    await writeAudit(await getDb(), {
      actor: toActor(user),
      action: "page.view",
      permission,
      outcome: "denied",
    });
    redirect(`/owner/not-allowed?need=${encodeURIComponent(permission)}`);
  }
  return user;
}

export function toActor(user: SessionUser): NonNullable<Actor> {
  return { id: user.id, role: user.role };
}

export async function startSession(userId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
  const token = signSession({ uid: userId, exp }, await sessionSecret());
  // Mark the cookie Secure whenever the request arrived over HTTPS (directly or via a proxy).
  // A local demo on http://localhost or a LAN address keeps working in every browser.
  const overHttps = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: overHttps,
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
