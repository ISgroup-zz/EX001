#!/usr/bin/env bash
# Pre-deployment gates for Procurement Hub.
#
# Runs each gate in cost order, captures full output per gate, and reports PASS / FAIL /
# SKIPPED. A gate that could not run is reported as SKIPPED with a reason — never as a pass,
# because a check you did not run tells you nothing and rendering it green is how a gate
# quietly stops being a gate.
#
# Exits non-zero if any gate FAILED. SKIPPED does not fail the run on its own; the report
# decides what an unrun gate means for the verdict.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

BASE="origin/main"
QUICK=0
OUT=".quality-gate/$(date +%Y%m%d-%H%M%S)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)  BASE="$2"; shift 2 ;;
    --quick) QUICK=1; shift ;;
    --out)   OUT="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      echo; echo "Usage: run_gates.sh [--base <ref>] [--quick] [--out <dir>]"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$OUT"
PG_HOST="${PGHOST:-127.0.0.1}"
PG_PORT="${PGPORT:-5432}"
TEST_URL="${TEST_DATABASE_URL:-postgresql://app:app@${PG_HOST}:${PG_PORT}/procurement_test?schema=public}"
SHADOW_URL="${QG_SHADOW_URL:-postgresql://app:app@${PG_HOST}:${PG_PORT}/qg_shadow?schema=public}"

names=(); states=(); details=(); secs=()

record() { names+=("$1"); states+=("$2"); details+=("$3"); secs+=("$4"); }

# run <name> <logfile> <command...>
run() {
  local name="$1" log="$2"; shift 2
  local start; start=$(date +%s)
  printf '  %-20s ' "$name"
  if "$@" >"$OUT/$log" 2>&1; then
    local d=$(( $(date +%s) - start ))
    printf 'PASS  (%ss)\n' "$d"
    record "$name" PASS "" "$d"
    return 0
  else
    local code=$? d=$(( $(date +%s) - start ))
    printf 'FAIL  (%ss)  -> %s\n' "$d" "$OUT/$log"
    tail -n 25 "$OUT/$log" | sed 's/^/      | /'
    record "$name" FAIL "exit $code; see $OUT/$log" "$d"
    return 1
  fi
}

skip() {
  printf '  %-20s SKIPPED  (%s)\n' "$1" "$2"
  record "$1" SKIPPED "$2" 0
}

echo "Quality gate  ·  base=$BASE  ·  logs=$OUT"
echo

# --- context -----------------------------------------------------------------
git fetch origin main -q 2>/dev/null || true
git --no-pager diff --stat "$BASE"...HEAD > "$OUT/diff.stat" 2>/dev/null || true
git --no-pager diff "$BASE"...HEAD > "$OUT/diff.patch" 2>/dev/null || true
CHANGED=$(git --no-pager diff --name-only "$BASE"...HEAD 2>/dev/null | wc -l | tr -d ' ')
echo "Changed files vs $BASE: $CHANGED"
if [[ "$CHANGED" == "0" ]]; then
  echo "Nothing to gate — HEAD matches $BASE."
fi
echo

# --- reachability ------------------------------------------------------------
DB_UP=0
if command -v pg_isready >/dev/null 2>&1 && pg_isready -h "$PG_HOST" -p "$PG_PORT" -q 2>/dev/null; then
  DB_UP=1
elif node -e "process.exit(0)" 2>/dev/null && npx --no-install prisma db execute --stdin --url "$TEST_URL" <<<"SELECT 1" >/dev/null 2>&1; then
  DB_UP=1
fi
[[ $DB_UP -eq 1 ]] || echo "!! No Postgres at ${PG_HOST}:${PG_PORT} — database gates will be SKIPPED, not passed." && echo

echo "Gates:"

# --- 1-2: static -------------------------------------------------------------
run "typecheck" "1-typecheck.log" npm run typecheck
run "lint"      "2-lint.log"      npm run lint

# --- 3: migration drift ------------------------------------------------------
# schema.prisma and prisma/migrations/ must describe the same database. If they drift, the
# app expects columns the deployed database will not have.
if [[ $DB_UP -eq 1 ]]; then
  run "migration-drift" "3-drift.log" \
    npx prisma migrate diff \
      --from-migrations prisma/migrations \
      --to-schema-datamodel prisma/schema.prisma \
      --shadow-database-url "$SHADOW_URL" \
      --exit-code
else
  skip "migration-drift" "no database reachable"
fi

# --- 4: migration safety on populated data -----------------------------------
# The gate that npm test cannot be: do what the deploy does, to data that already exists.
if [[ $DB_UP -eq 1 ]]; then
  if [[ "$CHANGED" != "0" ]] && git --no-pager diff --name-only "$BASE"...HEAD | grep -q '^prisma/'; then
    run "migration-safety" "4-migration-safety.log" \
      "$REPO_ROOT/.claude/skills/quality-gate/scripts/migration_safety.sh" --base "$BASE"
  else
    skip "migration-safety" "no changes under prisma/ — deploy applies no new migrations"
  fi
else
  skip "migration-safety" "no database reachable"
fi

# --- 5: the suite ------------------------------------------------------------
if [[ $DB_UP -eq 1 ]]; then
  TEST_DATABASE_URL="$TEST_URL" run "tests" "5-tests.log" npm test
else
  skip "tests" "no database reachable"
fi

# --- 6-7: production build and smoke ----------------------------------------
if [[ $QUICK -eq 1 ]]; then
  skip "build" "--quick"
  skip "smoke"  "--quick"
else
  run "build" "6-build.log" npm run build
  if [[ "${states[-1]}" == "PASS" && $DB_UP -eq 1 ]]; then
    run "smoke" "7-smoke.log" node "$REPO_ROOT/.claude/skills/quality-gate/scripts/smoke.mjs"
  elif [[ $DB_UP -ne 1 ]]; then
    skip "smoke" "no database reachable"
  else
    skip "smoke" "build failed — nothing to serve"
  fi
fi

# --- summary -----------------------------------------------------------------
pass=0; fail=0; skipped=0
{
  echo "{"
  echo "  \"base\": \"$BASE\","
  echo "  \"head\": \"$(git rev-parse --short HEAD 2>/dev/null || echo unknown)\","
  echo "  \"changedFiles\": $CHANGED,"
  echo "  \"ranAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"gates\": ["
  for i in "${!names[@]}"; do
    case "${states[$i]}" in PASS) ((pass++));; FAIL) ((fail++));; SKIPPED) ((skipped++));; esac
    printf '    {"name": "%s", "state": "%s", "seconds": %s, "detail": "%s"}%s\n' \
      "${names[$i]}" "${states[$i]}" "${secs[$i]}" "${details[$i]//\"/\\\"}" \
      "$([[ $i -lt $(( ${#names[@]} - 1 )) ]] && echo , || echo '')"
  done
  echo "  ],"
  echo "  \"passed\": $pass, \"failed\": $fail, \"skipped\": $skipped"
  echo "}"
} > "$OUT/summary.json"

echo
echo "  $pass passed · $fail failed · $skipped skipped"
echo "  summary: $OUT/summary.json"
[[ $skipped -gt 0 ]] && echo "  NOTE: $skipped gate(s) did not run. Unrun is not the same as passing — say so in the report."
echo

exit $(( fail > 0 ? 1 : 0 ))
