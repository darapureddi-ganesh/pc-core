"use server";

import { cookies } from "next/headers";
import type {
  AssignResult,
  BillingStatement,
  ClassifyResult,
  Claim,
  Policy,
  QueueStatus,
  QuoteInput,
  QuoteResult,
} from "./types";
import { DEFAULT_TENANT, TENANT_COOKIE } from "../lib/tenant";

// Default to IPv4 explicitly: on Windows, "localhost" can resolve to IPv6 (::1)
// and miss a server bound only on 127.0.0.1.
const API = process.env.API_URL ?? "http://127.0.0.1:3000";

/** Every call is scoped to whichever tenant is selected in the portal (see
 * tenant-actions.ts) via the API's unauthenticated X-Tenant-Id convenience
 * header — the same one curl-based local demos use. */
async function tenantHeaders(): Promise<Record<string, string>> {
  const tenantId = (await cookies()).get(TENANT_COOKIE)?.value ?? DEFAULT_TENANT;
  return { "x-tenant-id": tenantId };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export async function quotePolicy(cmd: {
  insured: { name: string };
  risk: QuoteInput;
}): Promise<QuoteResult> {
  // The portal collects the risk; the product and a standard annual term are
  // fixed for this demo line.
  const command = {
    productCode: "PRIVATE_CAR",
    term: { from: "2026-01-01", to: "2027-01-01" },
    insured: cmd.insured,
    risk: cmd.risk,
  };
  const res = await fetch(`${API}/quotes`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await tenantHeaders()) },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function bindPolicy(policyId: string): Promise<Policy> {
  const res = await fetch(`${API}/policies/${policyId}/bind`, {
    method: "POST",
    headers: await tenantHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function issuePolicy(policyId: string): Promise<Policy> {
  const res = await fetch(`${API}/policies/${policyId}/issue`, {
    method: "POST",
    headers: await tenantHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function getBillingStatement(
  policyId: string,
): Promise<BillingStatement> {
  const res = await fetch(`${API}/policies/${policyId}/billing`, {
    headers: await tenantHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function payOutstanding(
  policyId: string,
  amount: number,
): Promise<BillingStatement> {
  const res = await fetch(`${API}/policies/${policyId}/payments`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await tenantHeaders()) },
    body: JSON.stringify({ amount, date: new Date().toISOString().slice(0, 10) }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fileClaim(
  policyId: string,
  cmd: { incidentDate: string; cause: string; rawIntakeText?: string },
): Promise<Claim> {
  const res = await fetch(`${API}/policies/${policyId}/claims`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await tenantHeaders()) },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function classifyClaim(claimId: string): Promise<ClassifyResult> {
  const res = await fetch(`${API}/claims/${claimId}/classify`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await tenantHeaders()) },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function assignClaim(claimId: string): Promise<AssignResult> {
  const res = await fetch(`${API}/claims/${claimId}/assign`, {
    method: "POST",
    headers: await tenantHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function overrideClaim(
  claimId: string,
  cmd: { handlerId: string; reason: string; overrideBy: string },
): Promise<Claim> {
  const res = await fetch(`${API}/claims/${claimId}/override`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await tenantHeaders()) },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function getQueueStatus(): Promise<QueueStatus> {
  const res = await fetch(`${API}/claims/queue/status`, {
    headers: await tenantHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
