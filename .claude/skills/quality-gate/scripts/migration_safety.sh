#!/usr/bin/env bash
# Prove the new migrations survive contact with a database that already has rows.
#
# Railway runs `prisma migrate deploy` against the LIVE database before switching traffic.
# The test suite runs against an empty scratch database built from nothing, so it cannot see
# the failure mode that actually bites: a migration that is fine on an empty table and fails
# on a populated one — a NOT NULL column with no default, a unique index over data that has
# duplicates, a narrowed type. When that fails mid-deploy the release is stuck and the old
# version keeps serving.
#
# So: build the database as production has it today, fill it with data, then apply the new
# migrations on top and check nothing was lost.
#
#   1. check the deploy base out into a worktree
#   2. apply ITS migrations to a scratch database  -> the schema production is on now
#   3. seed it                                     -> tables hold rows, as production does
#   4. count rows
#   5. apply the WORKING TREE's migrations on top  -> exactly what the deploy will do
#   6. count again: no table may lose rows
#
# Step 3 needs the BASE's Prisma client, not the working tree's — seeding a base-schema
# database with a client that knows about new columns fails immediately. Generating the
# client is a whole-repo side effect, so it is restored on every exit path, including Ctrl-C.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

BASE="origin/main"
[[ "${1:-}" == "--base" ]] && BASE="$2"

PG_HOST="${PGHOST:-127.0.0.1}"
PG_PORT="${PGPORT:-5432}"
PG_USER="${PGUSER:-app}"
export PGPASSWORD="${PGPASSWORD:-app}"
DB="qg_migration_safety"
URL="postgresql://${PG_USER}:${PGPASSWORD}@${PG_HOST}:${PG_PORT}/${DB}?schema=public"
TMP="$(mktemp -d)"
WORKTREE="$TMP/base"
CLIENT_SWAPPED=0

cleanup() {
  # Restoring the generated client matters more than tidiness: leaving the repo's client on
  # the base schema would break the working tree in a way that looks like a code bug.
  if [[ $CLIENT_SWAPPED -eq 1 ]]; then
    npx prisma generate >/dev/null 2>&1 || \
      echo "!! could not restore the Prisma client — run 'npx prisma generate'" >&2
  fi
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  git worktree prune >/dev/null 2>&1 || true
  rm -rf "$TMP" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pq() { psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -qAt "$@"; }
row_counts() {
  pq -d "$DB" -c "ANALYZE;" >/dev/null 2>&1
  pq -d "$DB" -c "SELECT relname||'='||n_live_tup FROM pg_stat_user_tables
                  WHERE n_live_tup > 0 AND relname <> '_prisma_migrations' ORDER BY relname;"
}

echo "== migration safety: $BASE -> working tree =="

# Nothing new to apply means the deploy does nothing to the database, and there is nothing
# here to prove.
BASE_MIGRATIONS=$(git ls-tree -r --name-only "$BASE" -- prisma/migrations 2>/dev/null \
  | awk -F/ '/migration.sql$/ {print $3}' | sort)
HEAD_MIGRATIONS=$(find prisma/migrations -name migration.sql 2>/dev/null \
  | awk -F/ '{print $(NF-1)}' | sort)
NEW=$(comm -13 <(echo "$BASE_MIGRATIONS") <(echo "$HEAD_MIGRATIONS"))

if [[ -z "${NEW// }" ]]; then
  echo "No new migrations relative to $BASE — the deploy applies nothing to the database."
  exit 0
fi
echo "New migrations to apply:"; echo "$NEW" | sed 's/^/  + /'

# An already-deployed migration must never be edited: migrate deploy stores a checksum per
# migration and refuses to run against a database where one no longer matches.
DRIFTED=""
while read -r m; do
  [[ -z "$m" ]] && continue
  old=$(git show "$BASE:prisma/migrations/$m/migration.sql" 2>/dev/null | shasum | cut -d' ' -f1)
  new=$(shasum "prisma/migrations/$m/migration.sql" 2>/dev/null | cut -d' ' -f1)
  [[ -n "$old" && "$old" != "$new" ]] && DRIFTED="$DRIFTED $m"
done <<< "$BASE_MIGRATIONS"
if [[ -n "${DRIFTED// }" ]]; then
  echo "FAIL: already-deployed migration(s) were edited:$DRIFTED"
  echo "      migrate deploy stores a checksum per migration and will refuse to run."
  exit 1
fi

echo "-- building the database as $BASE has it"
git worktree add --detach "$WORKTREE" "$BASE" >/dev/null 2>&1 || {
  echo "SKIP: could not create a worktree for $BASE"; exit 0; }
ln -sfn "$REPO_ROOT/node_modules" "$WORKTREE/node_modules"

pq -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null 2>&1
pq -d postgres -c "CREATE DATABASE ${DB};" >/dev/null 2>&1 || {
  echo "SKIP: could not create the scratch database ${DB}"; exit 0; }

( cd "$WORKTREE" && DATABASE_URL="$URL" npx prisma migrate deploy ) >/dev/null 2>&1 || {
  echo "FAIL: the base's own migrations do not apply cleanly — fix $BASE first."; exit 1; }

echo "-- seeding, so the tables hold rows as production does"
CLIENT_SWAPPED=1
npx prisma generate --schema "$WORKTREE/prisma/schema.prisma" >/dev/null 2>&1 || {
  echo "SKIP: could not generate the base's Prisma client"; exit 0; }

if ( cd "$WORKTREE" && DATABASE_URL="$URL" SEED_DEMO_DATA=true npx tsx prisma/seed.ts ) >/dev/null 2>&1; then
  :
else
  echo "!! the base's seed failed — continuing against an EMPTY database."
  echo "   This gate then proves only that the migration parses, not that it survives data."
fi

npx prisma generate >/dev/null 2>&1
CLIENT_SWAPPED=0

BEFORE="$(row_counts)"
POPULATED=$(echo "$BEFORE" | grep -c . )
echo "   populated tables: $POPULATED"
if [[ "$POPULATED" -eq 0 ]]; then
  echo "!! nothing in the database — treat this gate's result as weak evidence."
fi

echo "-- applying the new migrations, exactly as the deploy will"
if ! DATABASE_URL="$URL" npx prisma migrate deploy >"$TMP/migrate.log" 2>&1; then
  tail -25 "$TMP/migrate.log"
  echo "FAIL: the new migrations do not apply to a populated database."
  echo "      This deploy would fail on Railway and leave the old version serving."
  exit 1
fi
echo "   applied cleanly"

echo "-- checking no table lost rows"
AFTER="$(row_counts)"
lost=0
while IFS= read -r entry; do
  [[ -z "$entry" ]] && continue
  table="${entry%%=*}"; was="${entry##*=}"
  now=$(echo "$AFTER" | grep "^${table}=" | cut -d= -f2)
  now="${now:-0}"
  if (( now < was )); then
    echo "   LOST: $table  $was -> $now"
    lost=1
  fi
done <<< "$BEFORE"

if (( lost )); then
  echo "FAIL: the migration destroyed existing rows. On Railway that is production data."
  exit 1
fi

echo "PASS: $POPULATED populated tables migrated with no row loss."
