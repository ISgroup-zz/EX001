import { execSync } from "node:child_process";

/**
 * Ensure the test database has the current schema.
 *
 * The tests need a real Postgres now that the app runs on one — behaviour like
 * case-sensitive LIKE differs from SQLite, and a suite that passes on the wrong engine
 * proves nothing about production.
 *
 * `migrate deploy` is idempotent and non-destructive: it applies any migrations the
 * database is missing and does nothing otherwise. Cleaning between tests is the job of
 * `resetDatabase()` in tests/helpers.ts, which every suite calls in `beforeEach`.
 *
 * Point TEST_DATABASE_URL at any scratch database; otherwise the local one from
 * docker-compose.yml is used.
 */

const DEFAULT_TEST_URL = "postgresql://app:app@127.0.0.1:5432/procurement_test?schema=public";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_URL;
  process.env.DATABASE_URL = url;

  try {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not prepare the test database at ${url.replace(/:[^:@]*@/, ":***@")}.\n` +
        "Start one with `docker compose up -d`, or set TEST_DATABASE_URL to a scratch database.\n\n" +
        detail,
    );
  }
}
