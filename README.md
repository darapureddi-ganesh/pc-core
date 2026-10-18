# PC Core

**Policy & Claims Core** is an open-source P&C insurance core for the Indian
motor line. It covers policy lifecycle, rating, billing, claims and documents,
with a Next.js agent portal on top. Products are config (YAML), policies are
effective-dated timelines, and all business logic is pure and tested.

## Quick start

```bash
pnpm install
pnpm dev        # API on :3000 + portal on :3001
```

Open http://localhost:3001 and sign in with `pc-core-demo`. Quote a car, bind,
issue, pay the invoice, open the policy schedule and Form 51, then file a claim
and work it through the claims queue.

```bash
pnpm test       # all tests, no Postgres needed
pnpm typecheck
pnpm demo       # CLI walkthrough of rating and the policy timeline
pnpm platform   # API + mock-insurer, to try a second tenant on its own backend
```

## Layout

```
apps/
  api/            multi-tenant Fastify API
  web/            Next.js agent portal
  mock-insurer/   stand-in for a company's own policy system, over HTTP
packages/
  ports/          storage contracts a company implements (the Connector SDK)
  adapters/       in-memory, Postgres, remote-HTTP and mock VAHAN/DigiLocker adapters
  domain/         effective-dated / bitemporal policy timeline
  config-engine/  product loader, rating interpreter, rules
  billing/        double-entry ledger + installment schedule
  claims-ai/      document extraction, fraud scoring, vehicle and coverage checks
  claims-queue/   triage, IRDAI clocks, SLA, handler assignment
  forms/          policy schedule, Form 51, premium register
  db/             Drizzle schema + migrations
  products/       private_car.2026.1.yaml — the product definition
```

## How it works

**Effective-dated policies.** A policy is a timeline you reconstruct, not a
row you update. Endorsements are stored as deltas and re-rated on read, so a
backdated endorsement recomputes every later slice. Claims look the policy up
as of the incident date, so the sum insured is whatever was in force then.

**Config-over-code rating.** No code knows what "Private Car" is. The engine
runs the ordered algorithm and rules in `private_car.2026.1.yaml`. The NCB
slabs come from the India Motor Tariff, and the TP premiums (annual, and the
mandatory 3-year term for new cars) from the Motor Vehicles (Third Party
Insurance Base Premium and Liability) Rules, 2022.

**Claims.** First notice of loss runs fraud scoring, document extraction and
an optional VAHAN cross-check. Triage and assignment are deterministic rules.
Each claim runs against IRDAI's clocks: surveyor within 24 hours, survey
report within 15 days, settlement within 7 days of the report. Payments are
maker-checker: a handler releases up to their payment authority, and anything
larger needs a second handler. Payments can't exceed the reserve. Recovery
(subrogation or salvage) is tracked per claim, and every action goes into the
claim's activity log.

**AI is advisory.** Extraction, fraud scoring and triage sit behind swappable
interfaces with rule-based defaults. Point them at a local model and the rules
still decide: fraud scoring falls back to the heuristic if the model fails,
and triage hints are shown next to the rules' result, never applied.

## API

Every route resolves its tenant from `Authorization: Bearer <apiKey>`, or from
`X-Tenant-Id` for local demos (default `demo`).

```bash
# policy
POST /quotes                         {productCode, term, risk, insured?, customerId?}
POST /policies/:id/bind | /issue | /endorsements | /cancel
GET  /policies/:id?asOf=YYYY-MM-DD   # the re-rated slice in effect on that date

# billing
POST /policies/:id/payments          {amount, date}
GET  /policies/:id/billing

# claims
POST /policies/:id/claims            {incidentDate, cause, rawIntakeText?, declaredVehicle?}
GET  /claims/:id | /claims/:id/coverage
POST /claims/:id/reserve | /settle   {amount}
POST /claims/:id/surveyor            {name, by}
POST /claims/:id/survey-report       {assessedAmount, by}
POST /claims/:id/payments            {payee, payeeType, mode, account, ifsc?, amount, requestedBy}
POST /claims/:id/payments/:paymentId/approve   {approvedBy}
POST /claims/:id/recovery            {against, theirInsurer?, targetMin, targetMax, by}
POST /claims/:id/recovery/steps      {step, amount?, note?, by}
POST /claims/:id/recovery/settle     {amount, date, by}

# claim queue
POST /claims/:id/classify | /assign
POST /claims/:id/override            {handlerId, reason, overrideBy}
GET  /claims/queue/status | /claims/overview | /handlers

# customers
POST /customers                      {name, email?, phone?}
GET  /customers | /customers/:id | /customers/:id/history

# documents
GET  /policies/:id/documents/schedule | /certificate
GET  /reports/premium-register       # CSV

# platform
GET  /tenants
POST /connectors/register            {name, policyBaseUrl, ollamaModel?, ollamaBaseUrl?}
```

Documents are watermarked SPECIMEN.

## Connect your own system

Services only touch storage through the interfaces in `@pc-core/ports`. A
company plugs in its own database or system by implementing them, or
registers a REST service at runtime with `POST /connectors/register` and gets
back an API key. The seeded `beta` tenant shows this: its policies live in
`apps/mock-insurer`, with a different schema, reached only over HTTP.

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | api | Run the `demo` tenant on Postgres (apply `packages/db/migrations` first) |
| `LOCAL_LLM_MODEL`, `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_API_KEY` | api | Point claims AI at an OpenAI-compatible local model server |
| `BETA_URL` | api | Where the `beta` tenant's policy system runs (default `http://127.0.0.1:4000`) |
| `PORT` | api, mock-insurer | Listen port |
| `API_URL` | web | API base URL (default `http://127.0.0.1:3000`) |
| `PORTAL_PASSWORD` | web | Portal login (default `pc-core-demo`) |
| `PORTAL_AUTH_SECRET` | web | Signs the session cookie. Set a real one anywhere shared |

## Limits

- The portal has one shared login, so the claim page's "Acting as" picker
  stands in for real users. Maker-checker needs per-user identity before
  production.
- VAHAN and DigiLocker ship as mock adapters only. Real use needs NIC/MoRTH
  and DigiLocker partner onboarding. Aadhaar/e-KYC is out of scope.
- The tenant registry is in memory, so registered connectors don't survive a
  restart.

## Next

- Pro-rated endorsement premium and renewals
- Enforce the `policy_period` exclusion constraint by materializing the
  timeline into normalized rows
- Post claim payments to the billing ledger
- A shared `@pc-core/contracts` types package for api and web
- Persist the tenant registry
