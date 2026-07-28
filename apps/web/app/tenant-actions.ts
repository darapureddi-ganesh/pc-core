"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { TenantInfo } from "./types";
import { DEFAULT_TENANT, TENANT_COOKIE } from "../lib/tenant";

const API = process.env.API_URL ?? "http://127.0.0.1:3000";

export async function getTenants(): Promise<TenantInfo[]> {
  const res = await fetch(`${API}/tenants`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
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
