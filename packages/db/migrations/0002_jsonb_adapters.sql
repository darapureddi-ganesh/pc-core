-- 0002_jsonb_adapters.sql
-- Pragmatic JSONB-backed storage for the Connector SDK ports: the same
-- aggregate shapes the in-memory adapters hold in a Map, just durable. This is
-- NOT the normalized policy/policy_period model in 0001 (no GiST no-overlap
-- guarantee here) — it's the fast path to a real, restart-surviving Postgres
-- store. Materializing into policy_period is future work.

create table if not exists policy_store (
  policy_id     uuid primary key,
  policy_number text unique,
  data          jsonb not null
);

create sequence if not exists policy_number_seq;

create table if not exists billing_store (
  policy_id uuid primary key,
  data      jsonb not null
);

create table if not exists claim_store (
  claim_id  uuid primary key,
  policy_id uuid not null,
  data      jsonb not null
);

create index if not exists claim_store_policy_id_idx on claim_store (policy_id);

create table if not exists handler_store (
  handler_id text primary key,
  data       jsonb not null
);

create table if not exists assignment_log_store (
  id         serial primary key,
  claim_id   uuid not null,
  created_at timestamptz not null default now(),
  data       jsonb not null
);

create index if not exists assignment_log_store_claim_id_idx on assignment_log_store (claim_id);
