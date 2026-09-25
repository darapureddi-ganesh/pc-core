import { randomUUID } from "node:crypto";
import {
  HeuristicFraudScorer,
  RegexDocumentExtractor,
  checkVehicleDetails,
  type DocumentExtractor,
  type ExtractedFields,
  type FraudScorer,
} from "@pc-core/claims-ai";
import type { Claim, ClaimsRepository, VehicleRegistryPort } from "@pc-core/ports";
import { ServiceError } from "./errors.js";
import type { PolicyService } from "./policy-service.js";

export interface ClaimsAiProviders {
  extractor?: DocumentExtractor;
  fraudScorer?: FraudScorer;
  /** optional VAHAN-style vehicle registry lookup — a deterministic check
   * comparing FNOL-declared vehicle identity fields against an authoritative
   * record (see @pc-core/claims-ai's checkVehicleDetails). Skipped silently
   * if not configured for the tenant, or if the registry has no record for
   * the policy's registration number. */
  vehicleRegistry?: VehicleRegistryPort;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between two ISO (YYYY-MM-DD) dates, `to` − `from`. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      MS_PER_DAY,
  );
}

/** Flatten the IDP extractor's typed output into the port's generic string map. */
function toFlatFields(fields: ExtractedFields): Record<string, string> {
  const flat: Record<string, string> = {};
  if (fields.registrationNo) flat.registrationNo = fields.registrationNo;
  if (fields.policyNumber) flat.policyNumber = fields.policyNumber;
  if (fields.amount) flat.amount = fields.amount;
  if (fields.dates.length) flat.dates = fields.dates.join(", ");
  return flat;
}

/**
 * Claims, anchored to the temporal policy model. First-notice-of-loss looks up
 * the policy as-of the INCIDENT date, so the cover (and sum insured) applied to
 * a claim is exactly what was in force then — even across mid-term endorsements.
 *
 * FNOL also runs the claims-AI pillars: IDP extraction over any raw intake
 * text, and a fraud-risk score against this tenant's own claim history — both
 * behind swappable provider interfaces (DocumentExtractor / FraudScorer), so a
 * connected company can supply a real OCR/LLM or fraud model per tenant. The
 * defaults are PC Core's own regex extractor and heuristic scorer.
 */
export class ClaimsService {
  private readonly extractor: DocumentExtractor;
  private readonly fraudScorer: FraudScorer;
  private readonly vehicleRegistry?: VehicleRegistryPort;

  constructor(
    private readonly repo: ClaimsRepository,
    private readonly policies: PolicyService,
    providers: ClaimsAiProviders = {},
  ) {
    this.extractor = providers.extractor ?? new RegexDocumentExtractor();
    this.fraudScorer = providers.fraudScorer ?? new HeuristicFraudScorer();
    this.vehicleRegistry = providers.vehicleRegistry;
  }

  async fnol(cmd: {
    policyId: string;
    incidentDate: string;
    cause: string;
    /** free-text FNOL note / OCR'd document text, run through IDP extraction */
    rawIntakeText?: string;
    /** vehicle identity fields as declared by the claimant at FNOL, checked
     * against this.vehicleRegistry (if configured) for a
     * VEHICLE_DETAILS_MISMATCH signal. Ignored if no registry is configured. */
    declaredVehicle?: {
      chassisNumber?: string;
      engineNumber?: string;
      ownerName?: string;
    };
  }): Promise<Claim> {
    const policy = await this.policies.get(cmd.policyId); // throws NOT_FOUND
    if (policy.status !== "ISSUED") {
      throw new ServiceError("policy is not in force", "CONFLICT");
    }

    const snapshot = await this.policies.getAsOf(
      cmd.policyId,
      cmd.incidentDate,
    );
    if (!snapshot) {
      throw new ServiceError(
        "no cover in force on the incident date",
        "BAD_REQUEST",
      );
    }

    const priorClaimsOnPolicy = (await this.repo.list()).filter(
      (c) => c.policyId === cmd.policyId,
    ).length;
    const { score, signals } = await this.fraudScorer.score({
      priorClaimsOnPolicy,
      daysSincePolicyStart: daysBetween(policy.term.from, cmd.incidentDate),
    });

    let fraudScore = score;
    const fraudSignals = [...signals];

    // Optional, deterministic: if this tenant has a vehicle registry
    // configured, cross-check the declared vehicle identity against it.
    // Silently skipped when no registry is configured or it has no record
    // for this policy's registration number — never blocks FNOL.
    if (this.vehicleRegistry) {
      const regNo = policy.base.vehicle.registrationNo;
      const record = regNo
        ? await this.vehicleRegistry.lookupByRegistrationNumber(regNo)
        : null;
      if (record) {
        const { signals: mismatchSignals } = checkVehicleDetails(
          {
            chassisNumber: cmd.declaredVehicle?.chassisNumber,
            engineNumber: cmd.declaredVehicle?.engineNumber,
            ownerName: cmd.declaredVehicle?.ownerName ?? policy.insured?.name,
          },
          record,
        );
        if (mismatchSignals.length) {
          fraudSignals.push(...mismatchSignals);
          fraudScore = clamp01(fraudScore + 0.35);
        }
      }
    }

    const extractedFields = cmd.rawIntakeText
      ? toFlatFields(await this.extractor.extract(cmd.rawIntakeText))
      : undefined;

    const claim: Claim = {
      claimId: randomUUID(),
      policyId: cmd.policyId,
      policyNumber: policy.policyNumber,
      incidentDate: cmd.incidentDate,
      cause: cmd.cause,
      status: "OPEN",
      sumInsured: snapshot.rating.sumInsured,
      reserveAmount: 0,
      settledAmount: 0,
      ...(extractedFields && { extractedFields }),
      fraudScore,
      fraudSignals,
    };
    await this.repo.create(claim);
    return claim;
  }

  async setReserve(cmd: { claimId: string; amount: number }): Promise<Claim> {
    const claim = await this.load(cmd.claimId);
    if (claim.status === "SETTLED") {
      throw new ServiceError("claim is already settled", "CONFLICT");
    }
    this.withinCover(cmd.amount, claim.sumInsured, "reserve");
    claim.reserveAmount = cmd.amount;
    claim.status = "RESERVED";
    await this.repo.save(claim);
    return claim;
  }

  async settle(cmd: { claimId: string; amount: number }): Promise<Claim> {
    const claim = await this.load(cmd.claimId);
    if (claim.status === "SETTLED") {
      throw new ServiceError("claim is already settled", "CONFLICT");
    }
    if (cmd.amount <= 0) {
      throw new ServiceError("settlement must be positive", "BAD_REQUEST");
    }
    this.withinCover(cmd.amount, claim.sumInsured, "settlement");
    claim.settledAmount = cmd.amount;
    claim.status = "SETTLED";
    await this.repo.save(claim);
    return claim;
  }

  async get(claimId: string): Promise<Claim> {
    return this.load(claimId);
  }

  // ── internals ────────────────────────────────────────────────────────────

  private withinCover(amount: number, sumInsured: number, label: string): void {
    if (amount > sumInsured) {
      throw new ServiceError(
        `${label} ${amount} exceeds sum insured ${sumInsured}`,
        "BAD_REQUEST",
      );
    }
  }

  private async load(claimId: string): Promise<Claim> {
    const claim = await this.repo.get(claimId);
    if (!claim) {
      throw new ServiceError(`claim ${claimId} not found`, "NOT_FOUND");
    }
    return claim;
  }
}
