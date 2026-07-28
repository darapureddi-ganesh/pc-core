import { describe, it, expect } from "vitest";
import { productFilePath, PRIVATE_CAR_2026_1 } from "@pc-core/products";
import { loadProduct, quote } from "../src/index.js";
import type { QuoteInput } from "../src/index.js";

const { product } = loadProduct(productFilePath(PRIVATE_CAR_2026_1));

describe("PRIVATE_CAR rating — everything traces to the product YAML", () => {
  it("prices a clean risk end-to-end with the full breakdown", () => {
    const input: QuoteInput = {
      vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
      policy: { ncb: 25 },
      selectedAddOns: ["ZERO_DEP"],
      coverages: { tpSelected: true },
    };

    const result = quote(product, input);

    // odBase   = 0.030 * 600000            = 18000
    // odAddOns = 0.0015 * 600000           =   900
    // odGross  = 18900
    // ncbDisc  = 18900 * 0.25              =  4725
    // odNet    = 18900 - 4725 + 0          = 14175
    // tp = 3416, pa = 750
    // premium  = 14175 + 3416 + 750        = 18341
    // gst      = 18341 * 0.18              =  3301.38
    // total                                = 21642.38
    expect(result.breakdown.odGross).toBe(18900);
    expect(result.breakdown.ncbDisc).toBe(4725);
    expect(result.breakdown.odNet).toBe(14175);
    expect(result.breakdown.premium).toBe(18341);
    expect(result.total).toBeCloseTo(21642.38, 2);

    expect(result.referrals).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("raises an underwriting referral on an aged vehicle — from a rule, not code", () => {
    const input: QuoteInput = {
      vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 16 },
      policy: { ncb: 0 },
      selectedAddOns: [],
      coverages: { tpSelected: true },
    };

    const result = quote(product, input);
    expect(result.referrals.map((r) => r.id)).toContain("VEHICLE_AGE");
  });

  it("blocks removing statutory third-party cover", () => {
    const input: QuoteInput = {
      vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
      policy: { ncb: 25 },
      selectedAddOns: [],
      coverages: { tpSelected: false },
    };

    const result = quote(product, input);
    expect(result.errors.map((e) => e.id)).toContain("TP_STATUTORY");
  });

  it("changing the NCB in the input moves the discount — proving it's data-driven", () => {
    const base: QuoteInput = {
      vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
      policy: { ncb: 50 },
      selectedAddOns: [],
      coverages: { tpSelected: true },
    };

    const result = quote(product, base);
    // odGross here = 18000 (no add-ons); ncbDisc = 18000 * 0.50 = 9000
    expect(result.breakdown.ncbDisc).toBe(9000);
  });
});

describe("PRIVATE_CAR rating — depth (P2)", () => {
  const baseRisk: QuoteInput = {
    vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
    policy: { ncb: 25 },
    selectedAddOns: [],
    coverages: { tpSelected: true },
  };

  it("applies a voluntary-deductible discount to OD", () => {
    const result = quote(product, { ...baseRisk, voluntaryDeductible: 5000 });
    // odGross 18000; volDedDisc = 18000 * 0.05 = 900
    expect(result.breakdown.volDedDisc).toBe(900);
    // odNet = 18000 - 4500 (ncb 25) + 0 - 900 = 12600
    expect(result.breakdown.odNet).toBe(12600);
  });

  it("adds a loading for an older vehicle — from config, not code", () => {
    const result = quote(product, {
      ...baseRisk,
      vehicle: { ...baseRisk.vehicle, age: 12 },
      policy: { ncb: 0 },
    });
    // age 12 -> ">5y" od_base 0.045; odGross = 27000; OLD_VEHICLE loading 0.10
    expect(result.breakdown.loading).toBe(2700);
    expect(result.referrals).toHaveLength(0); // age 12 < 15 -> no referral
  });

  it("derives IDV from ex-showroom price via the depreciation grid", () => {
    const result = quote(product, {
      vehicle: { cc: 1200, rtoZone: "A", age: 2, exShowroomPrice: 750_000 },
      policy: { ncb: 25 },
      selectedAddOns: [],
      coverages: { tpSelected: true },
    });
    // age 2 -> "0-3y" depreciation 0.20 -> IDV 600000 -> odBase 0.030 * 600000
    expect(result.breakdown.odBase).toBe(18000);
  });

  it("prices a brand-new vehicle's TP as the mandatory 3-year lump sum, not the annual tariff", () => {
    const result = quote(product, { ...baseRisk, newVehicle: true });
    // 1200cc -> "1000-1500" band -> 3-year single premium, not the annual 3416
    expect(result.breakdown.tp).toBe(10640);
  });

  it("still uses the annual TP tariff when newVehicle is not set", () => {
    const result = quote(product, baseRisk);
    expect(result.breakdown.tp).toBe(3416);
  });
});
