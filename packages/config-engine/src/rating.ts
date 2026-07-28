import { Parser } from "expr-eval";
import jsonLogic from "json-logic-js";
import type { Band, Product, QuoteInput } from "./types.js";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** First band whose upper bound covers the value (max === null is the top band). */
function band(value: number, bands: Band[]): string {
  const hit = bands.find((b) => b.max === null || value <= b.max);
  if (!hit) throw new Error(`no band matches value ${value}`);
  return hit.label;
}

/** IDV as supplied, or derived from ex-showroom price via the depreciation grid. */
function resolveIdv(product: Product, input: QuoteInput, ageBand: string): number {
  if (input.vehicle.idv !== undefined) return input.vehicle.idv;
  const exShowroom = input.vehicle.exShowroomPrice;
  if (exShowroom === undefined) {
    throw new Error("provide either vehicle.idv or vehicle.exShowroomPrice");
  }
  const depreciation = product.tables.idvDepreciation[ageBand];
  if (depreciation === undefined) {
    throw new Error(`no depreciation factor for age band ${ageBand}`);
  }
  return round2(exShowroom * (1 - depreciation));
}

/** Sum the rates of every loading whose predicate holds for this risk. */
function loadingRate(product: Product, ruleContext: Record<string, number>): number {
  return product.loadings.reduce(
    (sum, l) => (jsonLogic.apply(l.when, ruleContext) === true ? sum + l.rate : sum),
    0,
  );
}

/**
 * Derive the flat rating context from the product tables and the quote input.
 * The engine does banding, table lookups and predicate evaluation; the VALUES
 * and the algorithm ORDER all live in the product YAML.
 */
function deriveContext(
  product: Product,
  input: QuoteInput,
): { context: Record<string, number>; idv: number } {
  const { tables } = product;
  const { vehicle, policy } = input;

  const ccBand = band(vehicle.cc, tables.ccBands);
  const ageBand = band(vehicle.age, tables.ageBands);
  const idv = resolveIdv(product, input, ageBand);

  const odBaseRate = tables.od_base[vehicle.rtoZone]?.[ccBand]?.[ageBand];
  if (odBaseRate === undefined) {
    throw new Error(
      `no OD base rate for zone=${vehicle.rtoZone} cc=${ccBand} age=${ageBand}`,
    );
  }

  const tpTable = input.newVehicle ? tables.tp_tariff_new_vehicle_3yr : tables.tp_tariff;
  const tpAmount = tpTable?.[ccBand];
  if (tpAmount === undefined) {
    const label = input.newVehicle ? "new-vehicle 3-year TP tariff" : "TP tariff";
    throw new Error(`no ${label} for cc band ${ccBand}`);
  }

  const addOnsRate = input.selectedAddOns.reduce((sum, code) => {
    const addOn = product.coverages.addOns[code];
    if (!addOn) throw new Error(`unknown add-on ${code}`);
    return sum + addOn.rate;
  }, 0);

  const voluntaryDeductible = input.voluntaryDeductible ?? 0;
  const ruleContext = { age: vehicle.age, cc: vehicle.cc, idv, ncb: policy.ncb };

  const context: Record<string, number> = {
    idv,
    odBaseRate,
    addOnsRate,
    ncbRate: tables.ncbScale[String(policy.ncb)] ?? 0,
    tpAmount,
    paAmount: tables.paRate,
    volDedRate: tables.volDedScale[String(voluntaryDeductible)] ?? 0,
    loadingRate: loadingRate(product, ruleContext),
    gstRate: product.rating.gstRate,
  };
  return { context, idv };
}

/**
 * Run the product's ordered rating algorithm. Each step is an arithmetic
 * expression (data, from the YAML) evaluated against the derived context plus
 * every earlier step's result. The engine holds no product knowledge.
 */
export function runRating(
  product: Product,
  input: QuoteInput,
): { breakdown: Record<string, number>; sumInsured: number } {
  const { context, idv } = deriveContext(product, input);
  const results: Record<string, number> = {};

  for (const step of product.rating.algorithm) {
    const scope = { ...context, ...results };
    const value = Parser.evaluate(step.expr, scope) as number;
    results[step.name] = round2(value);
  }

  return { breakdown: results, sumInsured: idv };
}
