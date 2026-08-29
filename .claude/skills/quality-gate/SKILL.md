---
name: quality-gate
description: >-
  Quality control before a deployment. Works out what changed, writes and PROVES test cases for
  it, runs the full suite plus regression, migration-safety and bilingual smoke gates against a
  real Postgres, and produces a GO / NO-GO report. Use this whenever work is about to ship or
  someone asks whether it is safe to — "ready to deploy", "before I push to main", "run the
  regression tests", "is this safe to ship", "pre-deploy check", "release check", "QC this
  change", "write tests for what I changed" — and proactively before any push to main, because
  Railway deploys main automatically and a green test suite alone does NOT prove the migrations
  will survive contact with the production database.
---

# Quality gate

Deployment here is a push. `main` goes straight to Railway, which runs
`prisma migrate deploy && npm run db:seed:if-empty` against the **live** database before
traffic switches. There is no staging environment and no manual approval between the push
and real users. So the gate is this skill, run before the push.

Your job is not to run five commands and print ticks. It is to answer one question honestly:
**if this ships right now, what breaks?** Then say so in a report someone can act on.

## The two failure modes to guard against

Everything below exists because of these, so keep them in mind rather than following steps
mechanically:

**A green suite can hide a broken deploy.** The tests run against an *empty* scratch database
that `migrate deploy` builds from nothing. Production has rows. A migration that tightens a
unique constraint, narrows a type, or sets `NOT NULL` on a column holding nulls applies fine to
an empty table and fails on a populated one — after which Railway keeps serving the old version
and the release is stuck.

This is not hypothetical. Adding `CREATE UNIQUE INDEX "Project_currency_key" ON "Project"("currency")`
to this repo leaves all 103 tests **passing** — the scratch database has at most one project per
test, so the index builds fine — while the real database has three USD projects and
`migrate deploy` dies with `Key (currency)=(USD) is duplicated`. The suite cannot see this by
construction, because the thing that breaks the migration is data the suite never has. Gate 4
exists solely for it.

**A test that passes either way proves nothing.** The easiest test to write is one that asserts
whatever the code currently does. It goes green immediately, it survives review, and it will go
green just as happily when the behaviour breaks. A test case only counts once you have watched
it fail without the fix. See `references/writing-test-cases.md`.

## Step 1 — Establish what is shipping

```bash
git fetch origin main -q
git --no-pager diff --stat origin/main...HEAD
git --no-pager log --oneline origin/main..HEAD
```

Read the diff, not just the file names. You need three things before running anything:

- **Which business rules moved.** Rules live in `src/server/services/`. A change to a component
  is a display change; a change to a service is a behaviour change and carries far more risk.
- **Whether `prisma/schema.prisma` changed**, and if so whether a matching migration exists in
  `prisma/migrations/`. A schema change with no migration is a guaranteed production failure —
  the app expects columns the database will not have.
- **Whether `src/lib/i18n/en.ts` gained keys.** `ar.ts` is typed as `Dictionary`, so a missing
  Arabic key is a compile error rather than a silent English string in the Arabic UI. This is
  why typecheck is a real gate here and not a formality.

If the diff is empty, stop and say so. There is nothing to gate.

## Step 2 — Derive and prove test cases for what changed

Do this **before** running the suite, so the run includes your new tests.

For each behaviour the diff changes, ask: *is there a test that would go red if this rule were
wrong?* Not "is this file tested" — is this **rule** tested. If not, write one, then prove it by
temporarily breaking the rule and watching the test fail.

`references/writing-test-cases.md` has the method, the invariants this codebase cares about, and
worked examples from real bugs found in this repo. Read it before writing tests.

## Step 3 — Run the gates

```bash
.claude/skills/quality-gate/scripts/run_gates.sh
```

Options: `--base <ref>` (deploy base, default `origin/main`), `--quick` (skip build and smoke
while iterating), `--out <dir>` (log directory).

It runs seven gates in cost order so failures surface early, writes each gate's full output to
a log file, and emits `summary.json` alongside a human summary. It exits non-zero if any gate
fails.

| # | Gate | Catches |
|---|------|---------|
| 1 | typecheck | type errors; **missing Arabic dictionary keys** |
| 2 | lint | unused code, hook misuse |
| 3 | migration drift | `schema.prisma` and `prisma/migrations/` disagreeing |
| 4 | **migration safety** | a migration that fails or loses data on a **populated** database |
| 5 | tests | all business rules, against real Postgres |
| 6 | build | server/client boundary errors that only appear in a production build |
| 7 | smoke | the built app actually serving, in **English and Arabic** |

Gate 4 is the one that does not exist anywhere else. It checks out the deploy base into a
worktree, applies *its* migrations to a scratch database, seeds it so the tables have rows, then
applies the new migrations on top and compares row counts. That is the shape of the real deploy.

### When a gate fails

Diagnose it; do not re-run it hoping for a different answer. "Flaky" is not a root cause — this
suite is deterministic, it runs `fileParallelism: false` against one database, and every suite
calls `resetDatabase()` in `beforeEach`. A failure that appears intermittent is a real ordering
or isolation bug and is worth more attention than a reproducible one, not less.

Never make a gate pass by weakening it. Deleting an assertion, skipping a test, or relaxing a
guard to get to green converts a caught bug into a shipped one.

## Step 4 — Write the report

Use the structure in `references/report-template.md`. Non-negotiables:

- **A verdict, first line.** GO, NO-GO, or GO WITH RISK. Someone should be able to read one line
  and know whether to push.
- **`SKIPPED` is never rendered as a pass.** If gate 7 did not run because no browser was
  available, the report says so and the verdict accounts for it. A gate you did not run is
  unknown, and unknown is not green.
- **Residual risk, stated plainly.** What is still uncovered after all this. There always is
  something — say what it is instead of implying the tick marks are exhaustive.

Report GO WITH RISK rather than GO when the gates pass but something real is uncovered — a rule
you could not test, a migration you could not verify against representative data, a smoke check
that could not run. That is a genuine and common outcome; treating it as GO is how a gate stops
being trusted.

## Adapting this to another project

The method is portable; the commands are not. To move this skill, keep Steps 1, 2 and 4 as they
are and rewrite the gate list in `scripts/run_gates.sh` for the target stack. The parts worth
carrying over are the ordering (cheap and fast first), the honesty rules (skipped ≠ passed, no
weakening a gate to pass it), and Gate 4's shape — *whatever your deploy does to the database,
do that to a copy of real data first*.
