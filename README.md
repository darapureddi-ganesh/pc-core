# pc-core

An open-source **P&C insurance core** — motor line. A config-over-code,
effective-dated policy platform in the spirit of Guidewire / Duck Creek, built
in the open.

A working motor core on an effective-dated spine: **policy lifecycle, rating,
billing, claims, and documents**, with a Next.js agent portal on top. All logic
is pure and tested; persistence is behind repository ports (in-memory today,
Postgres-ready).

## Try it

One command runs the API and the agent portal together:

```bash
pnpm install
pnpm dev
```

Then open **http://localhost:3001** and click through the whole lifecycle:
enter a vehicle, get a config-driven quote, bind, issue — the portal then
auto-invoices the premium, lets you pay it off, and links straight to the
generated **policy schedule** and **Form 51 certificate**. Every number and
every document field traces back to `packages/products/private_car.2026.1.yaml`.

(`pnpm demo` runs a separate, non-interactive CLI walkthrough of the rating
engine and the temporal timeline — no servers needed.)

## What's here

```
apps/
  api/            multi-tenant Fastify service: lifecycle + billing + claims + docs
  web/            Next.js agent portal: quote -> bind -> issue, over the API
  mock-insurer/   a stand-in "company's own system" — its own schema, over HTTP
packages/
  ports/          the Connector SDK: storage contracts a company implements
  adapters/       reference adapters: in-memory + RemoteHttpPolicyRepository
  domain/         effective-dated / bitemporal timeline  (pure, tested)
  config-engine/  product loader + rating interpreter + rules  (pure, tested)
  billing/        double-entry ledger + installment schedule  (pure, tested)
  claims-ai/      IDP field extraction + fraud scoring  (pure, tested)
  forms/          policy schedule + Form 51 + premium register renderers  (pure, tested)
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
the priced breakdown, bind, issue, pay the invoice, and open the generated
documents — by calling the API over HTTP from server actions. `pnpm dev` (above)
runs it alongside the API; to run them separately:

```bash
pnpm --filter @pc-core/api start    # API on :3000
pnpm --filter @pc-core/web start    # portal on :3001  (build first: --filter @pc-core/web build)
```

The portal reads `API_URL` server-side (default `http://127.0.0.1:3000` — IPv4
on purpose, since `localhost` can resolve to IPv6 on Windows and miss the API)
and links to documents via the client-visible `API_PUBLIC_BASE` in `app/config.ts`.

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

## Documents & reporting (P6)

Which documents a product issues is config (`product.forms` in the YAML);
rendering is pure (`packages/forms`). Data is gathered by reconstructing the
policy at inception, so a schedule always reflects the cover actually in force.

```bash
GET /policies/:id/documents             # forms this product issues (from config)
GET /policies/:id/documents/schedule    # policy schedule (HTML, print-ready)
GET /policies/:id/documents/certificate # Certificate of Insurance, Form 51 (HTML)
GET /reports/premium-register           # IRDAI-style premium register (CSV)
```

Documents are watermarked **SPECIMEN** and clearly marked as not issued by a real
insurer.

## Bring your own backend (the Connector SDK)

pc-core is a platform, not a silo: a company connects **their own system** and
every feature above works against **their data**. Services never touch a database
directly — only the storage contracts in `@pc-core/ports`
(`PolicyRepository`, `BillingRepository`, `ClaimsRepository`). A connector is
just an implementation of those interfaces, against a database or over HTTP.

The API is **multi-tenant and self-serve**. Two tenants ship seeded for the demo:

- **`demo`** — pc-core's own in-memory store
- **`acme`** — a policy store that lives entirely in a separate process
  (`apps/mock-insurer`) with a *deliberately different internal schema*
  (`productCd`, lower-case `state`, risk as an opaque `riskBlob`), reached only
  over HTTP via `RemoteHttpPolicyRepository`

Any third company can **onboard at runtime, no restart, no code change** — point
pc-core at a REST service implementing the connector contract and get back an
API key:

```bash
curl -sX POST localhost:3000/connectors/register -H 'content-type: application/json' \
  -d '{"name":"Beta Insurance","policyBaseUrl":"https://beta.example.com"}'
# -> { "tenantId": "beta-insurance-062a10", "name": "Beta Insurance", "apiKey": "pk_..." }
```

Every route resolves its tenant from `Authorization: Bearer <apiKey>` (the real,
per-connector path) or, for local demos, an unauthenticated `X-Tenant-Id` header:

```bash
curl -sX POST localhost:3000/quotes -H 'authorization: Bearer pk_...' \
  -H 'content-type: application/json' -d '{ ...quote... }'
# Beta's issued policy is numbered by BETA'S OWN system and stored in its own
# schema — pc-core never sees it. Acme's the same, via the seeded demo tenant.
```

Run the platform demo (API + a stand-in external insurer, printing both demo
API keys on boot) with `pnpm platform`.

## Claims-AI (from the technology matrix)

Two pillars of the claims-technology matrix run as pure services behind
**swappable provider interfaces** — `DocumentExtractor` and `FraudScorer`
(`packages/claims-ai`) — so `ClaimsService` never depends on a concrete model:

- **IDP / OCR** — `RegexDocumentExtractor` (the default: pulls registration
  numbers, policy numbers, amounts and dates out of raw FNOL text, tuned for
  the Indian document mix) or `LlmDocumentExtractor`, a reference adapter that
  puts any `LlmClient` (Claude, GPT, a local model) behind the same interface —
  strict-JSON prompting, safe degradation on a malformed or failed reply.
- **Fraud scoring** — `HeuristicFraudScorer` (the default: repeat-claim and
  early-incident signals) against `FraudScorer`, ready for a real graph/anomaly
  model behind the same shape.

pc-core ships no hosted model — these are honest v1s proving the pillars
end-to-end and defining the seam a company's own model plugs into per tenant
(`ClaimsService`'s third constructor argument). FNOL returns `fraudScore`,
`fraudSignals`, and `extractedFields`.

## Next (from the build plan)

- **richer rating** — pro-rated endorsement premium, renewal terms
- **infra** — Postgres adapters for the repository ports; a `@pc-core/contracts` types package shared by api + web; wire claim settlements into the billing ledger; persist the tenant registry itself (currently in-memory, so registered connectors don't survive a restart)
- **portal** — surface claims (FNOL) and tenant switching in the agent portal alongside billing and documents

See the design note and build plan for the full picture.
