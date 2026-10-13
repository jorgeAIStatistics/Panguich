import { count } from "drizzle-orm";
import type { Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";
import { seedCatering } from "@/modules/catering/seed";
import { seedGrowth } from "@/modules/growth/seed";
import { seedOperations } from "@/modules/operations/seed";
import type { Db } from "./client";
import { users } from "./schema";

/**
 * Demo identities. They are placeholders, not real people, and are flagged is_demo so
 * nothing they do can ever reach a live send, payment, or external system.
 */
export const DEMO_USERS: ReadonlyArray<{ id: string; name: string; role: Role; locale: Locale; isDemo: true }> = [
  { id: "demo-owner", name: "Demo Owner", role: "owner", locale: "es", isDemo: true },
  { id: "demo-manager", name: "Demo Manager", role: "manager", locale: "en", isDemo: true },
  { id: "demo-staff", name: "Demo Staff", role: "staff", locale: "es", isDemo: true },
];

/** Inserts demo identities and clearly labeled sample records into an empty database. */
export async function seedDemoData(db: Db): Promise<{ seeded: boolean }> {
  const [{ value: existing }] = await db.select({ value: count() }).from(users);
  if (existing > 0) return { seeded: false };

  await db.insert(users).values(DEMO_USERS.map((u) => ({ ...u })));
  await seedCatering(db);
  await seedGrowth(db);
  await seedOperations(db);
  return { seeded: true };
}
