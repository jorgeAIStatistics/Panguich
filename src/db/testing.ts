import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_DIR, type Db } from "./client";
import * as schema from "./schema";
import { DEMO_USERS } from "./seed";

/**
 * A fresh in-memory Postgres with the real migrations applied, for integration tests.
 * Demo users are inserted (tests need actors); no other sample data is.
 */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  await db.insert(schema.users).values(DEMO_USERS.map((u) => ({ ...u })));
  return db;
}

export const TEST_OWNER = { id: "demo-owner", role: "owner" } as const;
export const TEST_MANAGER = { id: "demo-manager", role: "manager" } as const;
export const TEST_STAFF = { id: "demo-staff", role: "staff" } as const;
