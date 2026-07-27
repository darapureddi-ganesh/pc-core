-- 0001_policy_period.sql
-- The effective-dated spine. The exclusion constraint is the load-bearing line:
-- Postgres itself refuses to store two overlapping ISSUED slices for one policy.

create extension if not exists btree_gist;

create table policy (
  policy_id      uuid primary key default gen_random_uuid(),
  policy_number  text not null unique,
  product_code   text not null,
  inception_date timestamptz not null,
  status         text not null            -- active | lapsed | cancelled
);

create table policy_period (
  period_id        uuid primary key default gen_random_uuid(),
  policy_id        uuid not null references policy(policy_id),
  txn_type         text not null,         -- NEW | ENDORSE | RENEW | CANCEL
  effective        daterange not null,    -- business validity of this slice, [from, to)
  status           text not null,         -- QUOTED | BOUND | ISSUED | SUPERSEDED
  product_code     text not null,
  product_version  text not null,         -- pins the metadata this slice was rated on
  content_hash     text not null,         -- hash of that product version
  written_premium  numeric(14,2),
  recorded_at      timestamptz not null default now(),  -- system-time axis

  -- No two ISSUED slices of the same policy may overlap in business time.
  exclude using gist (
    policy_id with =,
    effective with &&
  ) where (status = 'ISSUED')
);

-- As-of reconstruction: what did this policy look like on :as_of_date ?
--   select * from policy_period
--   where policy_id = :policy_id
--     and effective @> :as_of_date::date
--     and status = 'ISSUED';
