# PC Core

**Policy & Claims Core** — an open-source **P&C insurance core** — motor
line. A config-over-code, effective-dated policy platform in the spirit of
Guidewire / Duck Creek, built in the open.

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

Then open **http://localhost:3001**, sign in with the demo password
(`pc-core-demo`, see "Portal login + tenant switching" below), and click
through the whole lifecycle: enter a vehicle, get a config-driven quote,
bind, issue — the portal then auto-invoices the premium, lets you pay it
off, and links straight to the generated **policy schedule** and
**Form 51 certificate**. Every number and every document field traces back
to `packages/products/private_car.2026.1.yaml`.

`pnpm test` runs the two proofs below (no Postgres needed); `pnpm demo` prints
a quote breakdown and a timeline reconstruction from the CLI — no servers.

## What's here

```
apps/
  api/            multi-tenant Fastify service: lifecycle + billing + claims + docs
  web/            Next.js agent portal: quote -> bind -> issue, over the API
  mock-insurer/   a stand-in "company's own system" — its own schema, over HTTP
packages/
  ports/          the Connector SDK: storage contracts a company implements
  adapters/       reference adapters: in-memory + RemoteHttpPolicyRepository
  schema-mapping/ infers + applies a field mapping for a connector whose own
                  shape differs from PolicyAggregate  (pure, tested)
  domain/         effective-dated / bitemporal timeline  (pure, tested)
  config-engine/  product loader + rating interpreter + rules  (pure, tested)
  billing/        double-entry ledger + installment schedule  (pure, tested)
  claims-ai/      IDP field extraction + fraud scoring  (pure, tested)
  claims-queue/   claim triage, SLA windows, handler assignment scoring  (pure, tested)
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

The NCB slabs and TP tariff in that YAML aren't placeholders — they're sourced
from real IRDAI regulation: NCB (20/25/35/45/50%) from the 2002 India Motor
Tariff, and the annual TP premium (₹2,094 / ₹3,416 / ₹7,897 by cc) plus the
mandatory **3-year new-vehicle TP lump sum** (₹6,521 / ₹10,640 / ₹24,596) from
the Gazette of India's *Motor Vehicles (Third Party Insurance Base Premium and
Liability) Rules, 2022*. Check "New vehicle (first registration)" on the quote
form to price a brand-new car's mandatory 3-year TP term instead of the annual
one (`newVehicle` on `QuoteInput` / `POST /quotes`).

## Where the database comes in

`packages/db` holds two things:

- `migrations/0001_policy_period.sql` — a normalized `policy`/`policy_period`
  schema whose load-bearing line is a Postgres **GiST exclusion constraint**
  that makes overlapping issued slices impossible at the storage layer. Not
  yet wired into a repository adapter — future work is materializing the
  transaction-log domain model into these rows so the constraint is actually
  enforced.
- `migrations/0002_jsonb_adapters.sql` — pragmatic JSONB tables backing every
  Connector SDK port today (`PostgresPolicyRepository`,
  `PostgresBillingRepository`, `PostgresClaimsRepository`,
  `PostgresHandlersRepository`, `PostgresAssignmentLogRepository` in
  `@pc-core/adapters`): the same aggregate shape the in-memory adapters hold
  in a `Map`, just durable. Set `DATABASE_URL` and the `demo` tenant runs
  against real Postgres instead — useful for a pilot on infra a company
  actually controls (e.g. India's data-localization requirement), without
  waiting on the normalized model above.

```bash
createdb pc_core_dev
psql pc_core_dev -f packages/db/migrations/0002_jsonb_adapters.sql
DATABASE_URL=postgres://localhost/pc_core_dev pnpm --filter @pc-core/api start
```

## Policy lifecycle API

`apps/api` wires the two pure packages into a lifecycle service — quote → bind →
issue → endorse → cancel, plus as-of reconstruction — behind a Fastify HTTP
surface. It depends only on a `PolicyRepository` port; the in-memory adapter is
used by tests and local dev by default, and the Postgres adapter above (or a
connected company's own system, via `RemoteHttpPolicyRepository`) slots in
with no code change. Endorsements are stored as persistable deltas and
**re-rated** on read, so a backdated endorsement recomputes every downstream
slice.

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

### Renewal

`POST /policies/:id/renew` quotes a fresh policy carrying the risk forward
one year — vehicle age +1, term rolled by `addOneYear` (`@pc-core/domain`),
and NCB progressed per the product's own `ncbScale` table
(`nextNcbTier`, `@pc-core/config-engine`): claim-free steps up one tier,
any claim during the expiring term resets to the bottom tier. The result
links back to the expiring policy via `renewedFromPolicyId`.

```bash
curl -sX POST localhost:3000/policies/<id>/renew -H 'authorization: Bearer pk_demo'
# -> { "renewalPolicyId": "...", "previousPolicyId": "...",
#      "rating": { ...  "total": 18721.88 },
#      "term": { "from": "2027-01-01", "to": "2028-01-01" },
#      "ncb": { "previous": 25, "renewed": 35, "hadClaimInTerm": false } }
```

Renewal is deliberately not a parallel lifecycle: the returned
`renewalPolicyId` is an ordinary `QUOTED` policy — `bind`/`issue` it through
the exact same routes as any new business (the portal's "Renew this policy"
button does exactly that). **One honest simplification**: "any claim resets
NCB" is coarser than real Indian motor NCB rules, which only reset on an
own-damage claim, not a third-party-only one — this model doesn't yet
distinguish the two (`Claim.cause` is free text).

## Agent portal

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

Once a policy is issued, the same page lets you file a claim (FNOL) — with an
optional free-text intake note — classify it, and auto-assign it to a
handler. The claims-AI pillars run automatically on that FNOL call and are
shown inline: the IDP extractor's fields pulled from the intake note, the
fraud score with its actual signal text, and the classification pipeline
trace (baseline vs. company-rule override) plus the ranked handler
candidates. A second route, **Claims queue** (`app/claims/page.tsx`), is an
ops dashboard over `GET /claims/queue/status`: pending/assigned counts,
SLA-breach alerts, and live handler workload.

### Portal login + tenant switching

The whole portal sits behind a demo-grade login (`middleware.ts` + `lib/auth.ts`)
— one shared password gates an HMAC-signed session cookie. This is **not**
tenant-level authorization (the API already does that per-connector via
`Authorization: Bearer <apiKey>`); it's just a login screen so the portal
isn't wide open to anyone with the URL.

```bash
PORTAL_PASSWORD=your-password       # default: pc-core-demo
PORTAL_AUTH_SECRET=some-long-secret # signs the session cookie; default is a fixed dev value — set a real one before deploying anywhere shared
```

A tenant switcher in the header (`app/tenant-switcher.tsx`) lists every
registered tenant (`GET /tenants`) and lets you flip between them — every
server action then sends `X-Tenant-Id` for whichever tenant is selected
(`app/tenant-actions.ts`), the same unauthenticated convenience header the
API offers for local demos. Switching to `beta` only resolves if
`apps/mock-insurer` is actually running (`pnpm platform` instead of `pnpm dev`)
— otherwise you'll correctly see a real connection error, proving the tenant
data really is routed to a different backend, not just relabeled.

A third route, **Connectors** (`app/connectors/page.tsx`), makes the Connector
SDK's self-serve onboarding (`POST /connectors/register`) clickable instead of
curl-only: point it at any REST service implementing the policy connector
contract and get back a tenant + API key immediately, with a one-click
"switch the portal to this tenant." Pointed at the default URL
(`http://127.0.0.1:4000`, `apps/mock-insurer`, so run `pnpm platform`), a
freshly-registered tenant's issued policies come back numbered by
**that system's own scheme** (`BETA-000001`), not PC Core's — proof the
connector is genuinely routed, not just relabeled.

## Billing & claims

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

## Customer identity — the thing that ties a person's history together

Everything above anchors to a *policy*. Nothing anchored to a *person* until
now: a policy's `insured` field was always just a descriptive name string used
on documents, with no way to look up "everything about this customer" across
renewals, multiple vehicles, or every claim on every one of their policies —
a real gap against the "system of record" a production insurance core needs,
and the prerequisite for any future customer-facing (as opposed to
agent-facing) portal.

`CustomerService` (`apps/api/src/service/customer-service.ts`) adds that
identity: register a customer, link a policy to them at quote time
(`customerId` on `QuoteInput`/`POST /quotes`), and pull their aggregated
history back — every policy and every claim across all of them — in one call.
Like every other domain here, storage is a Connector SDK port
(`CustomerRepository`), with in-memory and Postgres adapters.

```bash
POST /customers                   {name, email?, phone?}   # -> {customerId, ...}
GET  /customers                                             # directory
GET  /customers/:id                                         # one customer
GET  /customers/:id/history                                 # {customer, policies, claims}
```

The portal's **Customers** page (`app/customers/page.tsx`) makes this
clickable: register a customer, paste their ID into the quote form's
"Customer ID" field, and issue as many policies against them as you like —
the history page then shows every one of those policies and every claim
across them, aggregated live.

## Claim queue — triage, SLA, assignment

Once a claim is on file, `ClaimQueueService` (`apps/api/src/service/claim-queue-service.ts`)
handles the triage/routing side of it, backed by pure rules in
`packages/claims-queue`: no hosted ML (same stance as claims-AI's fraud
scorer) — a deterministic baseline derives claim type from the description and
priority/complexity from the amount, and a company's own rules (VIP
policyholders, urgent keywords) can override the **priority** baseline to
CRITICAL, with the baseline and any override both returned for audit
(claim type and complexity are amount/keyword-derived only — not currently
rule-overridable). Assignment is a weighted score over each handler's
expertise match, workload headroom, availability and speed; manual overrides
are written to an audit log with the reviewer's identity and reason (an
IRDAI requirement).

```bash
POST /claims/:id/classify   {policyholderId?}   # -> claim + baseline vs. rule-applied trace
POST /claims/:id/assign                          # -> best-scoring handler + ranked candidates
POST /claims/:id/override    {handlerId, reason, overrideBy}
GET  /claims/queue/status                        # pending/assigned counts, SLA breaches, handler workloads
```

`HandlersRepository` and `AssignmentLogRepository` are Connector SDK ports
(`@pc-core/ports`) alongside `ClaimsRepository` — a connected company's own
adjuster roster and audit store slot in the same way its policy/claims data
does; the in-memory defaults (`@pc-core/adapters`) seed a few demo handlers
for the `demo` tenant.

## Documents & reporting

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

PC Core is a platform, not a silo: a company connects **their own system** and
every feature above works against **their data**. Services never touch a database
directly — only the storage contracts in `@pc-core/ports`
(`PolicyRepository`, `BillingRepository`, `ClaimsRepository`). A connector is
just an implementation of those interfaces, against a database or over HTTP.

The API is **multi-tenant and self-serve**. Two tenants ship seeded for the demo:

- **`demo`** — PC Core's own in-memory store
- **`beta`** — a policy store that lives entirely in a separate process
  (`apps/mock-insurer`) with a *deliberately different internal schema*
  (`productCd`, lower-case `state`, risk as an opaque `riskBlob`), reached only
  over HTTP via `RemoteHttpPolicyRepository`

Any third company can **onboard at runtime, no restart, no code change** — point
PC Core at a REST service implementing the connector contract and get back an
API key:

```bash
curl -sX POST localhost:3000/connectors/register -H 'content-type: application/json' \
  -d '{"name":"Gamma Insurance","policyBaseUrl":"https://gamma.example.com"}'
# -> { "tenantId": "gamma-insurance-062a10", "name": "Gamma Insurance", "apiKey": "pk_..." }
```

Every route resolves its tenant from `Authorization: Bearer <apiKey>` (the real,
per-connector path) or, for local demos, an unauthenticated `X-Tenant-Id` header:

```bash
curl -sX POST localhost:3000/quotes -H 'authorization: Bearer pk_...' \
  -H 'content-type: application/json' -d '{ ...quote... }'
# Gamma's issued policy is numbered by GAMMA'S OWN system and stored in its own
# schema — PC Core never sees it. Beta's the same, via the seeded demo tenant.
```

Run the platform demo (API + a stand-in external insurer, printing both demo
API keys on boot) with `pnpm platform`.

### Onboarding without hand-written translation code (schema mapping)

Gamma's example above assumes their REST service already speaks
`PolicyAggregate` directly. Most real policy-admin systems don't — they have
their own field names, their own status codes, their risk data as an opaque
blob. Today, `apps/mock-insurer/src/store.ts`'s `toContract`/`toBeta`
functions show what bridging that by hand looks like. `@pc-core/schema-mapping`
exists so a company doesn't have to write that code.

The mapping isn't inferred fresh on every request — that would mean running a
model on every single policy read, slow and unreliable on modest hardware.
Instead, a **local model proposes the mapping once**, from a few real sample
records, and from then on a **plain deterministic function applies it** —
no model in the hot path at all:

```bash
curl -sX POST localhost:3000/connectors/propose-mapping -H 'content-type: application/json' \
  -d '{"sampleRecords":[{"id":"p1","number":"G-001","productCd":"PRIVATE_CAR", ...}], "ollamaModel":"llama3.1"}'
# -> { "mapping": { "fields": {...}, "statusValues": {...}, ... }, "dryRun": { "valid": true, "samples": [...] } }
```

`dryRun` re-applies the proposed mapping to every sample and structurally
validates the result (`@pc-core/schema-mapping`'s `dryRunMapping` +
`validateMappedPolicy`) — a wrong field name, an unmapped status value, or a
JSON-encoded field the model missed all fail loudly right here, before
anyone trusts the mapping. **A person is meant to review `dryRun` and the
proposed mapping before using it** — it's a proposal, never applied
automatically just because it validates on 2-3 samples. Once confirmed, pass
it to `/connectors/register` as `policyFieldMapping`:

```bash
curl -sX POST localhost:3000/connectors/register -H 'content-type: application/json' \
  -d '{"name":"Gamma Insurance","policyBaseUrl":"https://gamma.example.com","policyFieldMapping":{...}}'
```

From then on, `MappedRemoteHttpPolicyRepository` applies that mapping on
every real call — Gamma's own JSON shape in, `PolicyAggregate` out, and back
again on writes — with no LLM involved at runtime. The mapping engine itself
(`applyPolicyEnvelopeMapping`/`unapplyPolicyEnvelopeMapping`) is deliberately
not a general transform language — no arbitrary expressions, no code
execution — just field renames, a status enum table, and JSON-encoded-field
handling. That covers a real, representative case (it can reproduce Beta's
exact hand-written mapping above) but not everything; a sufficiently unusual
schema still needs a hand-written adapter, same as before this package
existed.

## Claims-AI

Two claims-technology pillars run as pure services behind
**swappable provider interfaces** — `DocumentExtractor` and `FraudScorer`
(`packages/claims-ai`) — so `ClaimsService` never depends on a concrete model:

- **IDP / OCR** — `RegexDocumentExtractor` (the default: pulls registration
  numbers, policy numbers, amounts and dates out of raw FNOL text, tuned for
  the Indian document mix) or `LlmDocumentExtractor`, a reference adapter that
  puts any `LlmClient` (Claude, GPT, a local model) behind the same interface —
  strict-JSON prompting, safe degradation on a malformed or failed reply.
- **Fraud scoring** — `HeuristicFraudScorer` (the default: repeat-claim and
  early-incident signals) against `FraudScorer`, or `LlmFraudScorer`, a
  reference adapter that has any `LlmClient` reason over the same signals and
  return a score + explanation as strict JSON — falling back to the
  deterministic heuristic on a malformed reply or a failed model call, so
  fraud detection never goes silent because a model had a bad day.

PC Core ships no hosted model — these are honest v1s proving the pillars
end-to-end and defining the seam a company's own model plugs into per tenant
(`ClaimsService`'s third constructor argument). FNOL returns `fraudScore`,
`fraudSignals`, and `extractedFields`.

### Bring your own open-source model (Ollama)

`OllamaLlmClient` (`packages/claims-ai/src/ollama.ts`) is a concrete `LlmClient`
adapter for a self-hosted [Ollama](https://ollama.com) server — pull any
open-source model (`ollama pull llama3.1`) and point `LlmDocumentExtractor`
and/or `LlmFraudScorer` at it. This is wired all the way through self-serve
onboarding: pass `ollamaModel` (and optionally `ollamaBaseUrl`) to
`POST /connectors/register`, or fill in the same fields on the portal's
**Connectors** page, and that tenant's claim intake runs your model's
extraction AND fraud scoring instead of the defaults — no code change.

```bash
curl -sX POST localhost:3000/connectors/register -H 'content-type: application/json' \
  -d '{"name":"Delta Insurance","policyBaseUrl":"http://127.0.0.1:4000","ollamaModel":"llama3.1"}'
```

Any other model server works the same way — implement `LlmClient`'s single
method (`complete(prompt): Promise<string>`) against it and pass that instead
of `OllamaLlmClient` wherever `ClaimsAiProviders` is built.

### Running your own local model, on your own infrastructure

The Ollama flow above is for onboarding an **external** company's connector.
A company running PC Core itself — on their own servers, with no internet
egress required — can instead point their own primary tenant's claims-AI at
a local model server with three environment variables, no code change:

```bash
LOCAL_LLM_MODEL=qwen2.5-3b-instruct
LOCAL_LLM_BASE_URL=http://127.0.0.1:8080   # optional, defaults to this
LOCAL_LLM_API_KEY=...                      # optional, most local servers ignore it
```

`OpenAiCompatibleLlmClient` (`packages/claims-ai/src/openai-compatible.ts`)
speaks the standard OpenAI chat-completions HTTP shape that most local model
runtimes implement — llama.cpp's `llama-server`, LM Studio, vLLM,
text-generation-webui, and Ollama's own `/v1/chat/completions` endpoint all
work against it unmodified. When `LOCAL_LLM_MODEL` is set, the demo tenant's
`LlmDocumentExtractor` and `LlmFraudScorer` run against it instead of the
built-in regex extractor and heuristic scorer, and the claim queue's
classification step (below) gets an advisory `LlmTriageAdvisor` too.

**The rules stay authoritative either way.** This is deliberately additive,
not a replacement: `LlmFraudScorer` falls back to the deterministic
`scoreFraudRisk` heuristic on a malformed reply or a failed model call
(see "Claims-AI" above), and rating, the VAHAN vehicle cross-check, and every
other rule in the platform run exactly as they do without a model configured.
No model output is ever trusted without a check against the source claim
data — the model narrows or explains, it never overrides.

#### Claim-queue triage: an advisory hint, never a decision

`ClaimQueueService.classify()` always runs the deterministic rules pipeline
first (`classifyClaim` — see "the claim queue" below) and that result is
final: `claim.priority`, `claim.claimType`, `claim.complexity`, and the SLA
deadline are exactly what the rules say, model or no model.

When a `TriageAdvisor` is configured (via `LOCAL_LLM_MODEL`, or `ollamaModel`
on a self-serve connector), its suggestion is attached separately as
`claim.aiTriageHint` — `{ suggestedPriority, suggestedClaimType, rationale,
agreesWithRules }` — purely for a reviewer to see where the model and the
rules disagree. `agreesWithRules` is computed by the service, not the model.
`LlmTriageAdvisor` also refuses to report a value outside the same enum the
rules pipeline uses (a model can suggest `"HIGH"`, never invent a priority
level that doesn't exist), and degrades to no opinion at all — not a guess —
on a malformed reply or a failed model call. The portal's Claims panel shows
the hint next to the rules' own classification when one is present.

PC Core ships no model weights or runtime binaries of its own; bring your
own local server and point these variables at it.

### Vehicle & document verification (VAHAN / DigiLocker)

Two more Connector SDK ports follow the same "swappable provider, no hosted
service shipped" shape, for fraud-prevention checks at FNOL:

- **`VehicleRegistryPort`** (`packages/ports/src/vehicle-registry.ts`) — looks
  up a vehicle's authoritative registration record (owner, chassis/engine
  numbers, fitness/PUCC validity) by registration number, modeled on India's
  national vehicle registry, VAHAN. `ClaimsService` uses it for an optional,
  deterministic cross-check (`checkVehicleDetails` in `packages/claims-ai`) at
  FNOL: if the tenant has a registry configured, the claimant's declared
  chassis number, engine number, and owner name are compared against the
  registry record, and any mismatch adds a `VEHICLE_DETAILS_MISMATCH` fraud
  signal — pure and explainable, no LLM call. Skipped silently if no registry
  is configured for the tenant, or if it has no record for the plate.
- **`DocumentVerificationPort`** (`packages/ports/src/document-verification.ts`)
  — a consent-based issuer-pull flow (`initiateConsent` → `fetchVerifiedDocument`)
  for pulling a source-verified RC or DL, modeled on DigiLocker.

Both ports ship **mock adapters only** — `MockVehicleRegistry` and
`MockDigiLocker` (`packages/adapters`) — returning synthetic data for a
handful of hardcoded records, with no real network calls. Real production use
requires:

- **VAHAN**: onboarding as an authorized requesting entity with NIC/MoRTH —
  this is not a public API, and this repo does not implement or plan any real
  call to `vahan.parivahan.gov.in`.
- **DigiLocker**: DigiLocker Partner API approval (`api.digilocker.gov.in`).

**Aadhaar/UIDAI integration is explicitly out of scope for this repo** — no
Aadhaar authentication or e-KYC flow is implemented or planned. Swap in an
authorized adapter behind either port for production use.

## Next

- **richer rating** — pro-rated endorsement premium
- **infra** — materialize the transaction-log domain model into the normalized
  `policy_period` rows so the Postgres GiST exclusion constraint is actually
  enforced; a `@pc-core/contracts` types package shared by api + web; wire
  claim settlements into the billing ledger; persist the tenant registry
  itself (currently in-memory, so registered connectors don't survive a
  restart)
