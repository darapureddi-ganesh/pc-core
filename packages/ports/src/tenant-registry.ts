/**
 * A self-serve connector registration (see `POST /connectors/register`),
 * persisted so it survives an API restart. Seeded platform tenants (e.g.
 * "demo", "beta") are NOT stored here — they're rebuilt fresh from code/env
 * on every boot. This only covers tenants a real company onboarded.
 */
export interface RegisteredConnectorRecord {
  tenantId: string;
  apiKey: string;
  name: string;
  policyBaseUrl: string;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  /**
   * A confirmed field mapping (see `@pc-core/schema-mapping`'s
   * `PolicyEnvelopeMapping`), kept as `unknown` here so this port doesn't
   * depend on that package. Whoever reads this record back (apps/api, on
   * boot) is responsible for validating its shape before trusting it —
   * same as any other adapter boundary in this codebase.
   */
  policyFieldMapping?: unknown;
  registeredAt: string;
}

/**
 * Durable storage for self-serve registrations — part of the platform's own
 * bookkeeping, not a per-tenant Connector SDK port a company implements.
 * The in-memory default means a registered connector doesn't survive a
 * restart unless a real store (e.g. Postgres) is configured.
 */
export interface TenantRegistryStore {
  save(record: RegisteredConnectorRecord): Promise<void>;
  list(): Promise<RegisteredConnectorRecord[]>;
}
