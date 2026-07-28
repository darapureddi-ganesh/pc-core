import {
  renderForm51,
  renderPolicySchedule,
  renderPremiumRegisterCsv,
  inr,
  type CertificateData,
  type CoverageLine,
  type PremiumLine,
  type RegisterRow,
  type ScheduleData,
} from "@pc-core/forms";
import type { FormBinding } from "@pc-core/config-engine";
import { ServiceError } from "./errors.js";
import { resolveProduct } from "./products.js";
import type { PolicyService } from "./policy-service.js";
import type { PolicyAggregate, PolicySnapshot } from "@pc-core/ports";

/**
 * Documents and regulatory reporting. Which forms a product issues is config
 * (product.forms in the YAML); the rendering is pure (@pc-core/forms). The
 * data is gathered by reconstructing the policy at inception, so a schedule
 * always reflects the cover and premium that were actually in force.
 */
export class DocumentService {
  constructor(private readonly policies: PolicyService) {}

  async availableForms(policyId: string): Promise<FormBinding[]> {
    const policy = await this.policies.get(policyId);
    return resolveProduct(policy.productCode, policy.productVersion).product.forms;
  }

  async schedule(policyId: string): Promise<string> {
    const { policy, snapshot } = await this.atInception(policyId);
    return renderPolicySchedule(this.scheduleData(policy, snapshot));
  }

  async certificate(policyId: string): Promise<string> {
    const { policy } = await this.atInception(policyId);
    return renderForm51(this.certificateData(policy));
  }

  /** IRDAI-style premium register across every policy that has been issued. */
  async premiumRegisterCsv(): Promise<string> {
    const rows: RegisterRow[] = [];
    for (const policy of await this.policies.list()) {
      if (policy.policyNumber === null) continue; // never issued
      const snapshot = await this.policies.getAsOf(policy.policyId, policy.term.from);
      if (snapshot) rows.push(this.registerRow(policy, snapshot));
    }
    return renderPremiumRegisterCsv(rows);
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async atInception(
    policyId: string,
  ): Promise<{ policy: PolicyAggregate; snapshot: PolicySnapshot }> {
    const policy = await this.policies.get(policyId);
    if (policy.status !== "ISSUED") {
      throw new ServiceError("policy is not issued", "CONFLICT");
    }
    const snapshot = await this.policies.getAsOf(policyId, policy.term.from);
    if (!snapshot) {
      throw new ServiceError("no cover at inception", "BAD_REQUEST");
    }
    return { policy, snapshot };
  }

  private description(risk: PolicySnapshot["risk"]): string {
    return (
      [risk.vehicle.make, risk.vehicle.model]
        .filter((s): s is string => Boolean(s))
        .join(" ") || "Private car"
    );
  }

  private scheduleData(
    policy: PolicyAggregate,
    snapshot: PolicySnapshot,
  ): ScheduleData {
    const b = snapshot.rating.breakdown;
    const risk = snapshot.risk;

    const coverages: CoverageLine[] = [
      { name: "Own Damage", detail: `IDV ${inr(snapshot.rating.sumInsured)}` },
      { name: "Third-Party Liability", detail: "Statutory (Motor Vehicles Act)" },
      { name: "PA (Owner-Driver)", detail: inr(b.pa ?? 0) },
      ...risk.selectedAddOns.map((code) => ({ name: code, detail: "Add-on" })),
    ];
    const lines: PremiumLine[] = [
      { label: "Own damage (net)", amount: b.odNet ?? 0 },
      { label: "Third-party", amount: b.tp ?? 0 },
      { label: "PA (owner-driver)", amount: b.pa ?? 0 },
      { label: "GST 18%", amount: b.gst ?? 0 },
    ];

    return {
      policyNumber: policy.policyNumber ?? "—",
      insuredName: policy.insured?.name ?? "—",
      product: policy.productCode,
      productVersion: policy.productVersion,
      vehicle: {
        registrationNo: risk.vehicle.registrationNo ?? "—",
        description: this.description(risk),
        cc: risk.vehicle.cc,
        idv: snapshot.rating.sumInsured,
        rtoZone: risk.vehicle.rtoZone,
      },
      period: policy.term,
      ncb: risk.policy.ncb,
      coverages,
      premium: { lines, total: snapshot.rating.total },
    };
  }

  private certificateData(policy: PolicyAggregate): CertificateData {
    return {
      certificateNumber: policy.policyNumber ?? "—",
      policyNumber: policy.policyNumber ?? "—",
      insuredName: policy.insured?.name ?? "—",
      vehicle: {
        registrationNo: policy.base.vehicle.registrationNo ?? "—",
        description: this.description(policy.base),
      },
      period: policy.term,
      tp: {
        propertyDamage: "₹7,50,000",
        bodilyInjury: "As per the Motor Vehicles Act (unlimited)",
      },
      issuedAt: new Date().toISOString(),
    };
  }

  private registerRow(
    policy: PolicyAggregate,
    snapshot: PolicySnapshot,
  ): RegisterRow {
    const b = snapshot.rating.breakdown;
    return {
      policyNumber: policy.policyNumber ?? "—",
      product: policy.productCode,
      inception: policy.term.from,
      expiry: policy.term.to,
      sumInsured: snapshot.rating.sumInsured,
      odPremium: b.odNet ?? 0,
      tpPremium: b.tp ?? 0,
      gst: b.gst ?? 0,
      total: snapshot.rating.total,
    };
  }
}
