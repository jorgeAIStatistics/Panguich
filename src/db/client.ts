import fs from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;
/** A database handle or an open transaction. Service functions accept either. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export const MIGRATIONS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle");

export function dataDir(): string {
  const configured = process.env.PANGUICH_DATA_DIR;
  return configured
    ? path.resolve(/* turbopackIgnore: true */ process.cwd(), configured)
    : path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "pglite");
}

// One embedded Postgres per server process, shared across hot reloads.
const holder = globalThis as unknown as { __panguichDb?: Promise<Db> };

/**
 * The application database.
 *
 * Phase A runs on PGlite (PostgreSQL compiled to WebAssembly) so the demo needs no
 * database server. The schema and SQL are plain PostgreSQL; moving to a hosted Postgres
 * for the pilot means swapping this one file's driver, not the application code.
 */
export function getDb(): Promise<Db> {
  if (!holder.__panguichDb) {
    holder.__panguichDb = open().catch((error) => {
      holder.__panguichDb = undefined;
      throw error;
    });
  }
  return holder.__panguichDb;
}

async function open(): Promise<Db> {
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true });
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  const { seedDemoData } = await import("./seed");
  await seedDemoData(db);
  return db;
}
