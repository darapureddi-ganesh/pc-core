import { nextNcbTier, type RatingResult } from "@pc-core/config-engine";
import { addOneYear } from "@pc-core/domain";
import type { ClaimsRepository, MotorRisk } from "@pc-core/ports";
import { PolicyService, type QuoteCommand } from "./policy-service.js";
import { ServiceError } from "./errors.js";
import { resolveProduct } from "./products.js";

export interface RenewalQuoteResult {
  renewalPolicyId: string;
  previousPolicyId: string;
  rating: RatingResult;
  term: { from: string; to: string };
  ncb: { previous: number; renewed: number; hadClaimInTerm: boolean };
}

/**
 * Renewal is deliberately not a parallel lifecycle: it's "quote a new
 * policy with a carried-forward risk + NCB progression, linked back to the
 * expiring one," reusing PolicyService.quote/bind/issue exactly as they are.
 * Only the NCB step (see @pc-core/config-engine's nextNcbTier) and the
 * one-year term roll are new — the renewal quote still goes through the
 * same bind -> issue steps, and the same rating engine, as any new business.
 *
 * "Any claim during the expiring term resets NCB" is a coarse rule — real
 * Indian motor NCB is lost only on an OWN-DAMAGE claim, not a third-party-only
 * one, and this model doesn't yet distinguish the two (see Claim.cause, a
 * free-text field). Documented here rather than silently overclaiming.
 */
export class RenewalService {
  constructor(
    private readonly policies: PolicyService,
    private readonly claims: ClaimsRepository,
  ) {}

  async quoteRenewal(policyId: string): Promise<RenewalQuoteResult> {
    const policy = await this.policies.get(policyId);
    if (policy.status !== "ISSUED") {
      throw new ServiceError("only an issued policy can be renewed", "CONFLICT");
    }

    // The risk to renew is the one actually in force at the END of the
    // expiring term, not policy.base (the risk as issued at inception) —
    // any mid-term endorsement (an IDV bump, an NCB correction, an added
    // add-on) must carry forward too. Reconstructing as-of the latest
    // transaction's effective date (or the term start, if none) picks up
    // every endorsement's cumulative effect, since nothing changes again
    // before the term ends.
    const lastKnownDate = policy.transactions.reduce(
      (max, t) => (t.effectiveFrom > max ? t.effectiveFrom : max),
      policy.term.from,
    );
    const currentSnapshot = await this.policies.getAsOf(policyId, lastKnownDate);
    if (!currentSnapshot) {
      throw new ServiceError("no slice in effect at the end of the term", "CONFLICT");
    }
    const currentRisk = currentSnapshot.risk;

    const { product } = resolveProduct(policy.productCode, policy.productVersion);
    const claimsOnPolicy = (await this.claims.list()).filter(
      (c) => c.policyId === policyId,
    );
    const hadClaimInTerm = claimsOnPolicy.length > 0;
    const previousNcb = currentRisk.policy.ncb;
    const renewedNcb = nextNcbTier(previousNcb, product.tables.ncbScale, hadClaimInTerm);

    const term = { from: policy.term.to, to: addOneYear(policy.term.to) };
    const risk: MotorRisk = {
      ...currentRisk,
      vehicle: { ...currentRisk.vehicle, age: currentRisk.vehicle.age + 1 },
      policy: { ncb: renewedNcb },
      // a renewal is never a "brand-new vehicle" 3-year TP policy, even if
      // the expiring one was
      newVehicle: false,
    };

    const cmd: QuoteCommand = {
      productCode: policy.productCode,
      version: policy.productVersion,
      term,
      risk,
      insured: policy.insured,
      customerId: policy.customerId,
      renewedFromPolicyId: policy.policyId,
    };
    const { policyId: renewalPolicyId, rating } = await this.policies.quote(cmd);

    return {
      renewalPolicyId,
      previousPolicyId: policy.policyId,
      rating,
      term,
      ncb: { previous: previousNcb, renewed: renewedNcb, hadClaimInTerm },
    };
  }
}
