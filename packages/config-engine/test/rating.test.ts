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
