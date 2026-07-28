"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchTenant } from "./tenant-actions";
import type { TenantInfo } from "./types";

export function TenantSwitcher({
  tenants,
  current,
}: {
  tenants: TenantInfo[];
  current: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const formData = new FormData();
    formData.set("tenantId", e.target.value);
    startTransition(async () => {
      await switchTenant(formData);
      router.refresh();
    });
  };

  if (tenants.length === 0) return null;

  return (
    <select className="tenant-select" value={current} disabled={pending} onChange={onChange}>
      {tenants.map((t) => (
        <option key={t.tenantId} value={t.tenantId}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
