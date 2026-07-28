import type { MotorRisk, RiskChange } from "@pc-core/ports";

/** Apply a stored endorsement delta to a risk, returning a new risk (pure). */
export function applyChange(risk: MotorRisk, change: RiskChange): MotorRisk {
  switch (change.op) {
    case "setIdv":
      return { ...risk, vehicle: { ...risk.vehicle, idv: change.idv } };
    case "setNcb":
      return { ...risk, policy: { ...risk.policy, ncb: change.ncb } };
    case "addAddOn":
      return risk.selectedAddOns.includes(change.code)
        ? risk
        : { ...risk, selectedAddOns: [...risk.selectedAddOns, change.code] };
    case "removeAddOn":
      return {
        ...risk,
        selectedAddOns: risk.selectedAddOns.filter((c) => c !== change.code),
      };
  }
}
