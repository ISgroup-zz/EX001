# Report format

Someone reads this to decide whether to push. Lead with the answer.

Keep it short — a long report gets skimmed, and a skimmed report is one where the FAIL line gets
missed. Everything below fits comfortably on one screen.

```markdown
## Quality gate: <GO | NO-GO | GO WITH RISK>

<One sentence saying why. If NO-GO, name the blocker here — not further down.>

**Shipping:** <n> commits, <n> files — <one line on what actually changes for a user>
**Base:** origin/main @ <sha>  →  HEAD @ <sha>

### Gates

| Gate | Result | Notes |
|---|---|---|
| typecheck | PASS | |
| lint | PASS | |
| migration drift | PASS | schema and migrations agree |
| migration safety | PASS | 2 new migrations applied to a seeded copy of the base, no row loss |
| tests | PASS | 103 passed |
| build | PASS | |
| smoke | SKIPPED | no browser available — the running app was NOT exercised |

### Test cases added

- `<file>` — `<test name>`
  Covers: <the rule>. Proven by <what was broken to make it fail>.

### Residual risk

- <What is still uncovered, and how bad it would be.>
```

## Rules that keep this report worth reading

**The verdict is the first line.** Not a summary of what you ran — the decision.

**SKIPPED is never dressed as a pass.** If a gate did not run, the row says SKIPPED, the Notes
column says why, and the verdict accounts for it. Writing "smoke: n/a ✅" is how a gate stops
meaning anything.

**GO WITH RISK is a real verdict, not a hedge.** Use it when the gates pass but something
material is uncovered — a rule you could not test, a smoke check that could not run, a migration
verified only against seed data rather than anything production-shaped. Recording that honestly
is more useful than a green tick that someone later discovers was hollow.

**Name blockers, don't count them.** "NO-GO: the migration adds `paymentBasis NOT NULL` with no
default and fails on the 1,240 existing DeliveryPlanItem rows" is actionable. "NO-GO: 1 gate
failed" sends the reader digging through logs.

**Residual risk is mandatory and specific.** "Concurrency is untested" is fine. "Some edge cases
may exist" is filler — cut it. If you genuinely believe nothing material is uncovered, say which
things you checked and considered closed, so the claim can be argued with.

## Worked example

```markdown
## Quality gate: GO WITH RISK

All seven gates pass, but the new payment schedule was only exercised against seeded demo data —
no production-shaped PO has more than three milestones.

**Shipping:** 1 commit, 20 files — vendor PO milestones now carry payment terms, and plan changes
are logged.
**Base:** origin/main @ 721deae  →  HEAD @ 84743b1

### Gates

| Gate | Result | Notes |
|---|---|---|
| typecheck | PASS | includes 61 new Arabic keys — a missing one would fail here |
| lint | PASS | |
| migration drift | PASS | |
| migration safety | PASS | `20260828_milestone_payments` applied to a seeded base copy; 14 tables, no row loss |
| tests | PASS | 103 passed (23 new) |
| build | PASS | |
| smoke | PASS | 7 routes × 2 locales, `dir="rtl"` confirmed, no console errors |

### Test cases added

- `tests/milestone-payments.test.ts` — "refuses a schedule that promises more than the order"
  Covers: the over-scheduling guard. Proven by removing the guard and watching two cases go red.
- `tests/milestone-payments.test.ts` — "runs payment terms from the actual delivery"
  Covers: terms anchored to the posted GRN, not the planned date. Proven by reverting to
  `plannedDate`, which fails both this and the reschedule case.

### Residual risk

- The rounding tolerance in `assertScheduleWithinPoValue` is one minor unit per milestone. A PO
  with hundreds of milestones could accumulate a cent of slack per milestone. Not reachable
  through the UI today, which caps practical milestone counts well below that.
- Payment terms are anchored to the *latest* posted GRN on a milestone. A milestone fulfilled by
  several receipts dates from the last one; nobody has confirmed that is the commercial intent.
```
