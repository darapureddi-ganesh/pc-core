"use server";

import { cookies } from "next/headers";
import type { Customer, CustomerHistory } from "./types";
import { DEFAULT_TENANT, TENANT_COOKIE } from "../lib/tenant";

const API = process.env.API_URL ?? "http://127.0.0.1:3000";

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

export async function registerCustomer(cmd: {
  name: string;
  email?: string;
  phone?: string;
}): Promise<Customer> {
  const res = await fetch(`${API}/customers`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await tenantHeaders()) },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function getCustomers(): Promise<Customer[]> {
  const res = await fetch(`${API}/customers`, {
    headers: await tenantHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export async function getCustomerHistory(customerId: string): Promise<CustomerHistory> {
  const res = await fetch(`${API}/customers/${customerId}/history`, {
    headers: await tenantHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
