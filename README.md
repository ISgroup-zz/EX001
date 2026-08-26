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

## Getting started

```bash
npm install
cp .env.example .env      # DATABASE_URL + SESSION_SECRET
npm run db:push           # create the SQLite schema
npm run db:seed           # demo data (see sign-ins below)
npm run dev               # http://localhost:3000
```

Demo sign-ins (all `password123`):

| Email | Role | Can do |
|---|---|---|
| `admin@procurementhub.test` | Admin | everything, including user management |
| `pm@procurementhub.test` | Project manager | open projects, raise POs, post receipts, invoice |
| `viewer@procurementhub.test` | Viewer | read everything, change nothing |

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
  ├── grn.ts                  receipt rules, pre-filled drafts, posting
  ├── invoice.ts              billable quantities, issuing, payments
  ├── forecast.ts             planned vs. actual, cash, schedule health
  └── reporting.ts            project and portfolio rollups
src/server/actions/           server actions wrapping the services
src/app/                      routes
tests/                        vitest suites for the rules above
```

**Money is stored as integer minor units** (cents) everywhere — `*Minor` fields — and
every total goes through `src/lib/money.ts`, so agreement, PO, GRN and invoice figures
can never disagree. Quantities are decimals rounded to 3 dp at each boundary.

## Commands

```bash
npm run dev         # development server
npm run build       # production build
npm test            # vitest — 78 tests over the business rules
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run db:push     # sync the schema
npm run db:reset    # drop and recreate (stop the dev server first — it holds the file)
npm run db:seed     # reseed demo data
npm run db:studio   # browse the database
```

## Notes

- SQLite by default; moving to Postgres is a `provider` + `DATABASE_URL` change.
- Auth is email/password with scrypt hashing and a database-backed session cookie.
  It is deliberately simple — swap in an identity provider when you need SSO.
- Invoice numbers (`INV-2026-0001`) are assigned on **issue**, not on draft creation,
  so abandoned drafts don't leave gaps in the sequence.
