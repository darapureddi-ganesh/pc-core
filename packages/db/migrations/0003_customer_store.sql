-- 0003_customer_store.sql
-- The customer/policyholder identity, added alongside the other JSONB-backed
-- Connector SDK stores from 0002_jsonb_adapters.sql. See that file's comment
-- for why this is a pragmatic JSONB table rather than a normalized schema.

create table if not exists customer_store (
  customer_id uuid primary key,
  data        jsonb not null
);
