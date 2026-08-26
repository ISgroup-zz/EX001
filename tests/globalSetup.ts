import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

/** Build a throwaway SQLite database for the suite, separate from the dev one. */
export default function setup() {
  const dbPath = resolve(process.cwd(), "prisma/test.db");
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-journal`, { force: true });

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "ignore",
  });
}
