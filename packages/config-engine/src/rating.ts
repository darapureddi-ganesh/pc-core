import { Parser } from "expr-eval";
import type { Band, Product, QuoteInput } from "./types.js";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** First band whose upper bound covers the value (max === null is the top band). */
function band(value: number, bands: Band[]): string {
  const hit = bands.find((b) => b.max === null || value <= b.max);
  if (!hit) throw new Error(`no band matches value ${value}`);
  return hit.label;
}

/**
 * Derive the flat rating context from the product tables and the quote input.
 *
 * This is the engine's job: banding, table lookups, scale resolution. The
 * VALUES it reads (rates, bands, the NCB scale) and the ORDER of the algorithm
 * all live in the product YAML — so a rate change never touches this file.
 */
function deriveContext(
  product: Product,
  input: QuoteInput,
): Record<string, number> {
  const { tables } = product;
  const { vehicle, policy } = input;

  const ccBand = band(vehicle.cc, tables.ccBands);
  const ageBand = band(vehicle.age, tables.ageBands);

  const odBaseRate = tables.od_base[vehicle.rtoZone]?.[ccBand]?.[ageBand];
  if (odBaseRate === undefined) {
    throw new Error(
      `no OD base rate for zone=${vehicle.rtoZone} cc=${ccBand} age=${ageBand}`,
    );
  }

  const tpAmount = tables.tp_tariff[ccBand];
  if (tpAmount === undefined) {
    throw new Error(`no TP tariff for cc band ${ccBand}`);
  }

  const addOnsRate = input.selectedAddOns.reduce((sum, code) => {
    const addOn = product.coverages.addOns[code];
    if (!addOn) throw new Error(`unknown add-on ${code}`);
    return sum + addOn.rate;
  }, 0);

  return {
    idv: vehicle.idv,
    odBaseRate,
    addOnsRate,
    ncbRate: tables.ncbScale[String(policy.ncb)] ?? 0,
    tpAmount,
    paAmount: tables.paRate,
    loadings: 0,
    gstRate: product.rating.gstRate,
  };
}

/**
 * Run the product's ordered rating algorithm. Each step is an arithmetic
 * expression (data, from the YAML) evaluated against the derived context plus
 * every earlier step's result. The engine holds no product knowledge.
 */
export function runRating(
  product: Product,
  input: QuoteInput,
): Record<string, number> {
  const context = deriveContext(product, input);
  const results: Record<string, number> = {};

  for (const step of product.rating.algorithm) {
    const scope = { ...context, ...results };
    const value = Parser.evaluate(step.expr, scope) as number;
    results[step.name] = round2(value);
  }

  return results;
}
