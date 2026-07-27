# pc-core

An open-source **P&C insurance core** — motor line. A config-over-code,
effective-dated policy platform in the spirit of Guidewire / Duck Creek, built
in the open.

This repo is the **P1 skeleton**: the two things that can't be retrofitted are
real and tested, and everything else has a place to slot in.

## What's here

```
packages/
  domain/         effective-dated / bitemporal timeline  (pure, tested)
  config-engine/  product loader + rating interpreter + rules  (pure, tested)
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

## Next (from the build plan)

- **P2** — richer rating (IDV depreciation grid, voluntary-deductible discounts, loadings)
- **P3** — `apps/api`: policy lifecycle service (quote → bind → issue → endorse) over these packages
- **P4** — `apps/web`: Next.js agent quote-to-issue flow
- **P5** — billing ledger + claims FNOL
- **P6** — forms (policy schedule, Form 51) + IRDAI reporting

See the design note and build plan for the full picture.
