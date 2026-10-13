-- 0004_tenant_registry.sql
-- Persists self-serve connector registrations (POST /connectors/register) so
-- they survive an API restart. Seeded platform tenants ("demo", "beta") are
-- never stored here — they're rebuilt from code/env on every boot. See
-- 0002_jsonb_adapters.sql's comment for why this is a pragmatic JSONB table
-- rather than a normalized schema.

create table if not exists tenant_registry_store (
  tenant_id text primary key,
  api_key   text not null unique,
  data      jsonb not null
);
