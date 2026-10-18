"use server";

import { cookies } from "next/headers";
import type {
  AssignResult,
  BillingStatement,
  ClassifyResult,
  Claim,
  ClaimPayment,
  ClaimsOverview,
  CoverageView,
  Handler,
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
  customerId?: string;
}): Promise<QuoteResult> {
  // The portal collects the risk; the product and a standard annual term are
  // fixed for this demo line.
  const command = {
    productCode: "PRIVATE_CAR",
    term: { from: "2026-01-01", to: "2027-01-01" },
    insured: cmd.insured,
    risk: cmd.risk,
    customerId: cmd.customerId,
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

// ── claim workbench ─────────────────────────────────────────────────────────

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(await tenantHeaders()),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export const getClaim = async (claimId: string) => call<Claim>(`/claims/${claimId}`);
export const getCoverage = async (claimId: string) => call<CoverageView>(`/claims/${claimId}/coverage`);
export const listHandlers = async () => call<Handler[]>("/handlers");
export const getClaimsOverview = async () => call<ClaimsOverview>("/claims/overview");

export const setReserve = async (claimId: string, amount: number) =>
  call<Claim>(`/claims/${claimId}/reserve`, { amount });
export const settleClaim = async (claimId: string, amount: number) =>
  call<Claim>(`/claims/${claimId}/settle`, { amount });
export const appointSurveyor = async (claimId: string, name: string, by: string) =>
  call<Claim>(`/claims/${claimId}/surveyor`, { name, by });
export const recordSurveyReport = async (claimId: string, assessedAmount: number, by: string) =>
  call<Claim>(`/claims/${claimId}/survey-report`, { assessedAmount, by });

export const addPayment = async (
  claimId: string,
  cmd: Pick<ClaimPayment, "payee" | "payeeType" | "mode" | "amount" | "requestedBy"> & {
    account: string;
    ifsc?: string;
  },
) => call<Claim>(`/claims/${claimId}/payments`, cmd);
export const approvePayment = async (claimId: string, paymentId: string, approvedBy: string) =>
  call<Claim>(`/claims/${claimId}/payments/${paymentId}/approve`, { approvedBy });

export const openRecovery = async (
  claimId: string,
  cmd: { against: string; theirInsurer?: string; targetMin: number; targetMax: number; by: string },
) => call<Claim>(`/claims/${claimId}/recovery`, cmd);
export const addRecoveryStep = async (
  claimId: string,
  cmd: { step: string; amount?: number; note?: string; by: string },
) => call<Claim>(`/claims/${claimId}/recovery/steps`, cmd);
export const settleRecovery = async (claimId: string, amount: number, date: string, by: string) =>
  call<Claim>(`/claims/${claimId}/recovery/settle`, { amount, date, by });
