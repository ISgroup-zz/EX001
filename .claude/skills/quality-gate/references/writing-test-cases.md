# Deriving and proving test cases

The point of a test case is to fail. A test that cannot fail is a comment with a runtime cost.
So the work is in two halves, and the second half is the one people skip.

## 1. Derive: which rule changed?

Read the diff and ask what a user could now do that they could not before, or vice versa. Then
find where that is *decided*. In this codebase decisions live in `src/server/services/` — never
in components, never in server actions (those only parse forms and delegate). Test the service.

A useful prompt: **write the bug report first.** "A PM schedules 60% and 60% against one PO and
we promise the vendor 120% of the order." Now you know what to assert and what the failure looks
like. If you cannot write a plausible bug report for a change, it may not need a test — a
renamed variable does not.

Rules of thumb for what deserves a case:

- **A new guard.** Every `throw new Error(...)` in a service is a rule someone will hit. Test
  that it fires, and — separately — that it does *not* fire on the legitimate case next to it.
  The second half is what stops an over-eager guard from blocking real work.
- **A boundary.** Exactly at the limit, one either side. Over-receipt, over-billing and
  over-scheduling in this app are all boundaries.
- **A derived value.** Anything computed from other data — budget, forecast buckets, milestone
  amounts — needs a case with hand-computed expected numbers. Recomputing the implementation
  inside the test proves only that you can copy code.
- **Money and rounding.** Money is integer minor units everywhere (`*Minor`). A test that asserts
  a rounded value should say *why* that rounding is correct, since the next person will otherwise
  assume it is a typo and "fix" it.
- **Anything the database engine decides.** Postgres, not SQLite: `LIKE` is case-sensitive,
  ordering of nulls differs, unique constraints are enforced differently. If a change relies on
  engine behaviour, test it against the real engine — which the suite already does.

## 2. Prove: watch it fail

**Break the rule, run the test, confirm red, restore.** This takes a minute and is the entire
difference between a test and a decoration.

```bash
# 1. write the test, confirm it passes
npx vitest run tests/milestone-payments.test.ts

# 2. break the rule it covers — invert a comparison, delete a guard, drop a `mode` option
# 3. confirm the test now FAILS, and that the message names the real problem
npx vitest run tests/milestone-payments.test.ts

# 4. restore, confirm green again
git checkout -- src/server/services/vendorPayment.ts
```

If the test still passes with the rule broken, it is asserting something else — usually a
tautology like "the function returned an object". Rewrite it against the *consequence* the rule
exists to prevent.

Two real examples from this repo, both found this way:

- **Case-insensitive project search.** Moving SQLite → Postgres silently broke searching
  "substation" for "Substation". The fix was `mode: "insensitive"`. The test was only worth
  keeping once it was run with that option removed and observed to fail — two failures, exactly
  the two searches that would have broken in production.
- **The over-scheduling guard.** It lived in `replacePlan`, which is not the only write path, so
  `createPlanItems` could bypass it entirely. A test written against the service rather than the
  path it was expected to take found that immediately, and the guard moved to the single write
  path where it belongs.

## 3. Write it where it belongs

- Service-level, in `tests/*.test.ts`, using the fixtures in `tests/helpers.ts`
  (`openStandardProject`, `makeVendor`, `resetDatabase`, `NOW`).
- Every suite calls `beforeEach(resetDatabase)`. If a new model is added to the schema, add it to
  `resetDatabase` too, or rows leak between tests and you get failures that depend on file order.
- Name the test after the behaviour, not the function: `"refuses to bill more than has been
  delivered"` beats `"issueInvoice throws"`. When it fails at 2am, the name is the bug report.
- Add a comment for *why* a specific number is expected when it is not self-evident. Hand-computed
  totals (`10 × $70 = $700`) age far better than a magic constant.

## 4. What tests here cannot cover

Be honest about this in the report rather than implying coverage you do not have:

- **Migrations against real data** — the suite builds an empty database every time. That is what
  gate 4 exists for.
- **The rendered UI** — component behaviour, RTL layout, hydration. Gate 7's smoke check catches
  crashes and 500s, not visual regressions.
- **Concurrency** — the suite runs `fileParallelism: false` against one database. Two PMs posting
  receipts against the same PO at the same instant is not modelled anywhere.
- **Performance at scale** — every fixture is a handful of rows.
