# pc-core

An open-source **P&C insurance core** — motor line. A config-over-code,
effective-dated policy platform in the spirit of Guidewire / Duck Creek, built
in the open.

This repo is the **P1 skeleton**: the two things that can't be retrofitted are
real and tested, and everything else has a place to slot in.

## What's here

```
apps/
  api/            Fastify service: policy lifecycle + billing + claims
  web/            Next.js agent portal: quote -> bind -> issue, over the API
packages/
  domain/         effective-dated / bitemporal timeline  (pure, tested)
  config-engine/  product loader + rating interpreter + rules  (pure, tested)
  billing/        double-entry ledger + installment schedule  (pure, tested)
  db/             drizzle schema + the temporal migration (exclusion constraint)
  products/       private_car.2026.1.yaml — the product IS this file
tooling/
  demo.ts         end-to-end walkthrough
```

The **domain** and **config-engine** packages import nothing from a framework
or database — they take plain objects and return plain objects. That's what
makes the rating logic testable with golden files and portable to a future
channel (a BimaSugam / ONDC front end, say).

## Quick start

```bash
pnpm install
pnpm test      # runs the two proofs below — no Postgres needed
pnpm demo      # prints a quote breakdown + a timeline reconstruction
```

## The two proofs

**1. The effective-dated spine** (`packages/domain`). A policy is a timeline you
reconstruct, not a row you update. The test issues a 12-month policy, adds a
driver mid-term, then inserts a **backdated** endorsement _before_ it — and
reconstructs the policy correctly as-of several dates, on both the business-time
and system-time axes. Pass this and the hard part is done.

**2. Config-over-code rating** (`packages/config-engine`). No code knows what
"Private Car" is. The engine loads `private_car.2026.1.yaml`, runs its ordered
rating algorithm, and evaluates its json-logic rules. Changing the NCB scale,
adding an add-on or moving a referral threshold is a metadata edit — the test
proves the numbers trace to the YAML.

## Where the database comes in

`packages/db` holds the Drizzle schema and `migrations/0001_policy_period.sql`.
The load-bearing line there is a Postgres **GiST exclusion constraint** that makes
overlapping issued slices impossible at the storage layer. The pure timeline
logic in `domain` is what gets persisted into and queried out of that table.

## Policy lifecycle API (P3)

`apps/api` wires the two pure packages into a lifecycle service — quote → bind →
issue → endorse → cancel, plus as-of reconstruction — behind a Fastify HTTP
surface. It depends only on a `PolicyRepository` port; the in-memory adapter is
used by tests and local dev, and a Postgres/Drizzle adapter (mapping to
`packages/db`) slots in with no code change. Endorsements are stored as
persistable deltas and **re-rated** on read, so a backdated endorsement
recomputes every downstream slice.

```bash
pnpm --filter @pc-core/api start    # listens on :3000 (in-memory store)
```

```bash
# quote a car
curl -sX POST localhost:3000/quotes -H 'content-type: application/json' -d '{
  "productCode":"PRIVATE_CAR",
  "term":{"from":"2026-01-01","to":"2027-01-01"},
  "risk":{"vehicle":{"cc":1200,"idv":600000,"rtoZone":"A","age":2},
          "policy":{"ncb":25},"selectedAddOns":["ZERO_DEP"],
          "coverages":{"tpSelected":true}}}'
# -> { "policyId": "...", "rating": { ... "total": 21642.38 } }
```

Then `POST /policies/:id/bind`, `/issue`, `/endorsements`, and
`GET /policies/:id?asOf=2026-06-01` to read the re-rated slice in effect.

## Agent portal (P4)

`apps/web` is a Next.js portal that drives the whole flow — enter a vehicle, see
the priced breakdown, bind and issue — by calling the API over HTTP from server
actions. Run the two side by side (two terminals):

```bash
pnpm --filter @pc-core/api start    # API on :3000
pnpm --filter @pc-core/web start    # portal on :3001  (build first: --filter @pc-core/web build)
```

Then open http://localhost:3001. The portal reads `API_URL` (default
`http://127.0.0.1:3000` — IPv4 on purpose, since `localhost` can resolve to IPv6
on Windows and miss the API).

## Billing & claims (P5)

Issuing a policy auto-creates a premium **invoice** on a double-entry ledger
(`packages/billing`); payments draw the receivable down and balances are always
derived from journal entries, never stored. Claims are anchored to the temporal
model: **first-notice-of-loss looks the policy up as-of the incident date**, so a
claim's sum insured is exactly what was in force then — even across a mid-term
IDV endorsement.

```bash
POST /policies/:id/payments   {amount, date}     # draw down the invoice
GET  /policies/:id/billing                        # statement: total, paid, outstanding
POST /policies/:id/claims     {incidentDate, cause}   # FNOL -> cover as-of incident
POST /claims/:id/reserve      {amount}
POST /claims/:id/settle       {amount}
```

## Next (from the build plan)

- **P6** — forms (policy schedule, Form 51) + IRDAI reporting
- **richer rating** — pro-rated endorsement premium, renewal terms
- **infra** — Postgres adapters for the repository ports; a `@pc-core/contracts` types package shared by api + web; wire claim settlements into the billing ledger

See the design note and build plan for the full picture.
