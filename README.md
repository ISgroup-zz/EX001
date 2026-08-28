# Procurement Hub

A web app for managing procurement projects where we sit **between a client and one or
more vendors**. The client commits budget to us, we order from vendors, goods arrive,
and we bill the client — this app tracks that whole chain in one place.

```
Client ─┐
        ├─ Project ─┬─ ClientAgreement ── lines ◄─────────────────┐
Vendor ─┘           │   (PO │ CONTRACT │ FRAMEWORK │ VARIATION)   │
                    │        └─ call-offs / variations            │ billing
                    │                                             │ source
                    ├─ VendorPO ── lines ─────────────────────────┤
                    │       ├─ DeliveryPlanItem   (promised)  ────┤ → forecast
                    │       └─ GRN                (actual)    ────┘ → billable
                    │
                    └─ Invoice ── lines ── Payment
```

## Deploying to Railway

The app runs on **PostgreSQL**, which Railway provides as a managed service.

1. **New Project → Deploy from GitHub repo** → `ISgroup-zz/ProPM`, branch `main`.
2. **+ New → Database → Add PostgreSQL**.
3. **Link the two — this does not happen on its own.** Adding the database does *not*
   give the app its connection string. On the **app** service → **Variables**, add:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   ```
   Use whatever the database service is actually called in place of `Postgres`. This is a
   Railway reference variable, so it follows the database if its credentials ever change.
   Use `DATABASE_URL` rather than `DATABASE_PUBLIC_URL`: the former goes over the private
   network, which is faster and is not billed as egress.

   Do **not** paste the value from `.env.example` here — that points at `127.0.0.1`, which
   inside a Railway container means the container itself, and you'll get
   `Can't reach database server at 127.0.0.1:5432`.
4. Service → **Settings → Deploy → Pre-deploy Command**:
   ```
   npx prisma migrate deploy
   ```
   This runs in its own container before traffic switches, so a failed migration blocks
   the deploy instead of breaking the running version.
5. *(First deploy only, optional)* **Variables → `SEED_DEMO_DATA=true`** to load the demo
   data below, then change the pre-deploy command to:
   ```
   npx prisma migrate deploy && npm run db:seed:if-empty
   ```
   Remove the variable once you've seen it working — the seed refuses to run against a
   database that already has users, but there's no reason to leave it armed.
6. **Settings → Networking → Generate Domain**, open it and sign in. If the domain returns
   *"Application failed to respond"* with `connection refused`, the generated domain is
   pointing at a different port than the app listens on — set a `PORT` variable and make the
   domain's target port match it.

`railway.json` already pins the builder (Nixpacks), the `/login` healthcheck and the
restart policy. The start command binds Railway's injected `$PORT`.

## Running locally

```bash
npm install
cp .env.example .env       # points at the local Postgres below
docker compose up -d       # Postgres on :5432
npm run db:deploy          # apply migrations
npm run db:seed            # demo data (see sign-ins below)
npm run dev                # http://localhost:3000
```

`npm run db:seed` **wipes** the database first — it is for local use only. Deployments use
`npm run db:seed:if-empty`, which never clears anything.

Demo sign-ins (all `password123`):

| Email | Role | Can do |
|---|---|---|
| `admin@procurementhub.test` | Admin | everything, including user management |
| `pm@procurementhub.test` | Project manager | open projects, raise POs, post receipts, invoice |
| `viewer@procurementhub.test` | Viewer | read everything, change nothing |

## Arabic and right-to-left

The interface ships in **English and Arabic**, switchable from the toggle in the header
(also on the sign-in page, so nobody has to read an English form to get in). The choice
is stored in a `locale` cookie and read **on the server**, so the document's `dir` is
already correct in the first HTML sent — the layout never flips after hydration.

- `src/lib/i18n/en.ts` is the source of truth; `ar.ts` is typed against it, so a missing
  or misspelled Arabic key is a **compile error**, not an English word appearing mid-screen.
- Layout mirrors properly because the styling uses **logical** properties (`ms-`/`me-`,
  `ps-`/`pe-`, `text-start`/`text-end`, `border-s`/`border-e`, `start-`/`end-`) rather than
  physical left/right, so one class set serves both directions.
- **Numbers stay in Latin digits** (1,234.50) — the norm in Gulf business software and what
  keeps invoices reconcilable against vendor and bank documents. Numeric spans carry
  `unicode-bidi: isolate` so a figure like `$1,234.50` is never split apart by the bidi
  algorithm inside Arabic text.
- Strings that interpolate values use `fill()` with named placeholders rather than
  concatenation, because Arabic word order does not follow English.

Known gaps: dates render with English month abbreviations (`23 Aug 2026`), which is
common in the region but not fully localised; and validation messages raised by the
service layer are still English.

## How the app works

### A project is opened *on* a client document

A project is never created empty. You open it on whatever the client sent — a
**purchase order**, a **contract**, or a **framework agreement** — and that document
sets the opening budget. Project and document are written in one transaction, so no
code path can produce a project with nothing behind it. The document that opened a
project is badged "opening document" and can never be deleted.

### The budget grows as documents arrive

Budget is **derived** from the client documents on a project, never stored, so it
cannot drift:

| Document type | Effect on budget |
|---|---|
| `PO` | adds its net line total |
| `CONTRACT` | adds its line total, or its declared value if entered as a lump sum |
| `FRAMEWORK` | adds its **ceiling** |
| `VARIATION` | adds its delta, which may be negative |

A `PO` issued under a framework is a **call-off**: it adds nothing further to the
budget (that money is already counted in the ceiling) but **draws the ceiling down**,
and a call-off that would overrun the ceiling is rejected. The project page carries a
**budget timeline** showing every document with the running budget after it, so
"budget went from $10,000 to $15,000 when PO-002 arrived" is visible at a glance.

### Vendor POs carry a delivery plan

Every vendor PO records what the vendor **promised and when** — one or more planned
deliveries, each with quantities per line. This is the planned-GRN schedule, and it is
what makes the forecast possible. The plan is part of raising the order, not a separate
errand: it defaults to one tranche for the full quantity on the expected date, and
splits into N shipments with one click. Planning more than was ordered is rejected;
planning less is allowed but flagged as unplanned quantity.

### Every milestone carries a payment

Each planned delivery also says what the vendor is paid for meeting it — either a
**percentage of the order** or a **fixed amount** (a mobilisation fee that shouldn't
move with the order), plus payment terms in days. Percentages are *derived* from the
PO's current net value on every read rather than stored as a figure, so repricing a
line can never leave a payment schedule quietly disagreeing with the order it belongs
to. A schedule may not promise more than the order is worth; under-scheduling is allowed
and reported as "not yet scheduled". Both the wizard and the PO page reconcile the
schedule against the order value as you type.

Money becomes **payable when the goods actually arrive** — the milestone's posted GRN —
plus its terms in days. Terms run from the real delivery date, not the planned one, so
rescheduling a milestone after delivery cannot move money that is already owed. Actual
payments are recorded against the milestone they settle, and a milestone can be neither
revalued below what has been paid nor cancelled once it has been paid against.

### Plan changes are logged, not overwritten

Delivery dates and payment terms get renegotiated, and months later somebody has to
answer "who moved this, and when?". Every change is appended to a **change log** on the
PO — field by field, with the old and new value, the person and the timestamp — so the
history survives further edits to the same milestone. Rows are never updated or deleted.

### Goods receipts are the actual deliveries

A GRN posts against vendor PO lines, normally against the planned tranche it fulfils —
which gives plan-vs-actual, slip in days, and vendor on-time performance for free.
Cumulative accepted quantity can never exceed what was ordered. Drafts are editable and
don't count as delivered; **posting is one-way**, because a posted receipt is what
invoicing is allowed to bill against.

### Invoices bill only what arrived

For each client line:

```
billable = min(ordered, delivered) − already invoiced
```

where `delivered` is the accepted quantity on posted GRNs against the vendor lines
linked to that client line. Client lines with no vendor line behind them (services,
mark-ups) fall back to their ordered quantity. Invoices pre-fill with the billable
quantity, over-billing is refused, and issuing is blocked if it would take the project
past its budget. Totals are snapshotted at issue time, so later edits to a client
document never rewrite an invoice that has gone out.

## Built for speed

A PM raises POs and posts receipts many times a day, so those two flows are the ones
that got the attention:

- **Pull, don't type.** The vendor PO wizard lists the client's lines with what is still
  unordered; ticking them fills the PO *and* sets the link that later makes the invoice
  fill itself in.
- **Keyboard-first grids.** `Enter` adds a row, `Ctrl+D` fills down, and a block pasted
  from Excel spreads across rows and columns.
- **One-click receiving.** Every planned delivery — on the dashboard, the `/deliveries`
  queue, or the PO page — is one click from a receipt pre-filled with its planned
  quantity. The common case is *check the numbers and press Post*.
- **Rejections stay out of the way** until you need them, and after posting you're told
  what just became billable, with a link straight to the invoice.

## Project layout

```
prisma/schema.prisma          data model
prisma/seed.ts                demo data, built through the real services
src/lib/money.ts              integer minor units — no float money anywhere
src/lib/dates.ts              UTC calendar-day helpers
src/lib/validation/           zod schemas: the string → integer boundary
src/server/services/          ALL business rules live here, not in components
  ├── project.ts              opening rules
  ├── budget.ts               budget derivation, framework ceilings
  ├── agreement.ts            client documents
  ├── vendorPo.ts             vendor orders, pull-from-client lines
  ├── deliveryPlan.ts         planned deliveries, split helpers, coverage
  ├── vendorPayment.ts        milestone payment terms, payables, actual payments
  ├── planChangeLog.ts        append-only audit trail for the plan and its payments
  ├── grn.ts                  receipt rules, pre-filled drafts, posting
  ├── invoice.ts              billable quantities, issuing, payments
  ├── forecast.ts             planned vs. actual, cash, schedule health
  └── reporting.ts            project and portfolio rollups
src/server/actions/           server actions wrapping the services
src/app/                      routes
tests/                        vitest suites for the rules above (run against Postgres)
```

**Money is stored as integer minor units** (cents) everywhere — `*Minor` fields — and
every total goes through `src/lib/money.ts`, so agreement, PO, GRN and invoice figures
can never disagree. Quantities are decimals rounded to 3 dp at each boundary.

## Commands

```bash
npm run dev         # development server
npm run build       # production build
npm test            # vitest — 80 tests over the business rules (needs Postgres)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run db:deploy   # apply migrations (what Railway runs pre-deploy)
npm run db:migrate  # create a new migration after changing schema.prisma
npm run db:reset    # drop, recreate and re-apply migrations (local only)
npm run db:seed     # reseed demo data — WIPES first, local only
npm run db:studio   # browse the database
```

## Notes

- PostgreSQL only. Schema changes go through migrations (`npm run db:migrate`), which
  Railway applies on deploy — never `db push`.
- Project search uses `mode: "insensitive"` because Postgres `LIKE` is case-sensitive.
  There is a regression test for it in `tests/open-project.test.ts`.
- Auth is email/password with scrypt hashing and a database-backed session cookie (an
  opaque ID, so there is no secret to sign it with). It is deliberately simple — swap in
  an identity provider when you need SSO. The cookie is marked `Secure` in production,
  which Railway satisfies by serving HTTPS.
- Invoice numbers (`INV-2026-0001`) are assigned on **issue**, not on draft creation,
  so abandoned drafts don't leave gaps in the sequence.
