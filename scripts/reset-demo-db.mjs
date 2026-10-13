// Deletes the local demo database so the next start re-creates it with fresh sample data.
// Stop the app first. Usage: npm run db:reset
import fs from "node:fs/promises";
import path from "node:path";

const dir = path.resolve(process.cwd(), process.env.PANGUICH_DATA_DIR ?? ".data/pglite");
if (!dir.startsWith(path.resolve(process.cwd(), ".data"))) {
  console.error(`Refusing to delete ${dir}: it is outside this project's .data folder.`);
  process.exit(1);
}
await fs.rm(dir, { recursive: true, force: true });
console.log(`Removed ${path.relative(process.cwd(), dir)}. Start the app to create a fresh demo database.`);
