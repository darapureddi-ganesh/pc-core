/**
 * Coverage verification at FNOL — deterministic, explainable checks of a claim
 * against the cover in force on the incident date. No model call: each check
 * says what it looked at, so an adjuster can see why a claim is flagged.
 */

export type CoverageCheckState = "PASS" | "CHECK" | "FAIL";

export interface CoverageCheck {
  state: CoverageCheckState;
  title: string;
  detail: string;
}

export interface CoverageInput {
  cause: string;
  incidentDate: string;
  /** policy term, [from, to) */
  term: { from: string; to: string };
  /** effective date of a cancellation, if any */
  cancelledEffectiveFrom?: string;
  /** add-on codes in force on the incident date (product YAML codes) */
  addOns: string[];
  /** result of the VAHAN cross-check at FNOL, if a registry was configured */
  vehicleCheck?: "MATCHED" | "MISMATCH";
  fraudScore?: number;
}

const ENGINE_LOSS = /flood|water|submerge|engine|hydrostatic/i;
const THEFT = /theft|stolen|stole/i;

export function checkCoverage(input: CoverageInput): CoverageCheck[] {
  const checks: CoverageCheck[] = [];
  const add = (state: CoverageCheckState, title: string, detail: string) =>
    checks.push({ state, title, detail });

  const end = input.cancelledEffectiveFrom ?? input.term.to;
  const inForce = input.incidentDate >= input.term.from && input.incidentDate < end;
  add(
    inForce ? "PASS" : "FAIL",
    "Policy in force on the incident date",
    `Cover ${input.term.from} to ${end}${input.cancelledEffectiveFrom ? " (cancelled)" : ""}; incident on ${input.incidentDate}`,
  );

  if (input.vehicleCheck === "MATCHED") {
    add("PASS", "Vehicle matches the VAHAN record", "Declared chassis, engine and owner match the registry");
  } else if (input.vehicleCheck === "MISMATCH") {
    add("FAIL", "Vehicle matches the VAHAN record", "Declared vehicle details differ from the registry; see the fraud signals");
  } else {
    add("CHECK", "Vehicle matches the VAHAN record", "Not checked: no vehicle registry is configured, or it has no record for this plate");
  }

  if (ENGINE_LOSS.test(input.cause)) {
    const covered = input.addOns.includes("ENGINE_PROT");
    add(
      covered ? "PASS" : "CHECK",
      "Engine damage from water ingress",
      covered ? "Engine Protect add-on is in force" : "No Engine Protect add-on, so engine damage is excluded",
    );
  }

  if (THEFT.test(input.cause)) {
    add("CHECK", "Police FIR and non-traceable report", "Needed before a total-loss theft claim can be settled");
  }

  if (input.addOns.includes("ZERO_DEP")) {
    add("PASS", "Zero depreciation add-on", "Parts are paid without depreciation deduction");
  }

  if ((input.fraudScore ?? 0) >= 0.5) {
    add("CHECK", "Fraud score at or above 50%", "Refer to investigation before paying");
  }

  return checks;
}
