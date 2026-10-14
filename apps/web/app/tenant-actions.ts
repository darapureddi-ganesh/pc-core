"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { ConnectorRegistration, TenantInfo } from "./types";
import { DEFAULT_TENANT, TENANT_COOKIE, TENANT_KEYS_COOKIE, parseTenantKeys } from "../lib/tenant";

const API = process.env.API_URL ?? "http://127.0.0.1:3000";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export async function getTenants(): Promise<TenantInfo[]> {
  const res = await fetch(`${API}/tenants`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

/**
 * Self-serve onboarding: point PC Core at a REST service implementing the
 * policy connector contract (see @pc-core/adapters RemoteHttpPolicyRepository
 * and apps/mock-insurer for a reference implementation) and get back a new
 * tenant + API key — no restart, no code change on PC Core's side.
 *
 * Optionally also points this tenant's claims-AI IDP extraction at a
 * self-hosted Ollama model instead of the default regex extractor — PC Core
 * ships no hosted model, so this is how a company brings their own.
 */
export async function registerConnector(
  name: string,
  policyBaseUrl: string,
  ollama?: { model: string; baseUrl?: string },
): Promise<ConnectorRegistration> {
  const res = await fetch(`${API}/connectors/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      policyBaseUrl,
      ...(ollama?.model && { ollamaModel: ollama.model, ollamaBaseUrl: ollama.baseUrl }),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  const registration = (await res.json()) as ConnectorRegistration;

  // Remember this tenant's real API key so every later call the portal
  // makes on its behalf authenticates with it (see actions.ts's
  // tenantHeaders) — the API only honors the unauthenticated X-Tenant-Id
  // convenience for platform-seeded tenants, never a self-serve one.
  const jar = await cookies();
  const learnedKeys = parseTenantKeys(jar.get(TENANT_KEYS_COOKIE)?.value);
  learnedKeys[registration.tenantId] = registration.apiKey;
  // This cookie holds real API keys in cleartext — httpOnly so no XSS can
  // read it via document.cookie, secure once there's real TLS to require.
  jar.set(TENANT_KEYS_COOKIE, JSON.stringify(learnedKeys), {
    sameSite: "lax",
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  // The tenant list (and the switcher that reads it) should include this
  // new connector immediately, without a manual refresh.
  revalidatePath("/", "layout");
  return registration;
}

export async function getCurrentTenant(): Promise<string> {
  return (await cookies()).get(TENANT_COOKIE)?.value ?? DEFAULT_TENANT;
}

/** Sets the tenant cookie and invalidates the whole app's router cache (the
 * layout reads the cookie to render the switcher + resolve every action call)
 * so the change takes effect without a full page reload. Stays on whichever
 * page the user was on — switching tenants shouldn't bounce you back to "/". */
export async function switchTenant(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenantId") ?? DEFAULT_TENANT);
  (await cookies()).set(TENANT_COOKIE, tenantId, { sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
