"use server";

import type { Policy, QuoteInput, QuoteResult } from "./types";

// Default to IPv4 explicitly: on Windows, "localhost" can resolve to IPv6 (::1)
// and miss a server bound only on 127.0.0.1.
const API = process.env.API_URL ?? "http://127.0.0.1:3000";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export async function quotePolicy(risk: QuoteInput): Promise<QuoteResult> {
  // The portal collects the risk; the product and a standard annual term are
  // fixed for this demo line.
  const command = {
    productCode: "PRIVATE_CAR",
    term: { from: "2026-01-01", to: "2027-01-01" },
    risk,
  };
  const res = await fetch(`${API}/quotes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function bindPolicy(policyId: string): Promise<Policy> {
  const res = await fetch(`${API}/policies/${policyId}/bind`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function issuePolicy(policyId: string): Promise<Policy> {
  const res = await fetch(`${API}/policies/${policyId}/issue`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
