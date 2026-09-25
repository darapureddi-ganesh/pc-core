import { describe, it, expect } from "vitest";
import { productFilePath, PRIVATE_CAR_2026_1 } from "@pc-core/products";
import { loadProduct, nextNcbTier } from "../src/index.js";

const { product } = loadProduct(productFilePath(PRIVATE_CAR_2026_1));
const ncbScale = product.tables.ncbScale; // { "0":0, "20":.2, "25":.25, "35":.35, "45":.45, "50":.5 }

describe("nextNcbTier — renewal NCB progression, read from the product's own scale", () => {
  it("steps up one tier on a claim-free term", () => {
    expect(nextNcbTier(0, ncbScale, false)).toBe(20);
    expect(nextNcbTier(20, ncbScale, false)).toBe(25);
    expect(nextNcbTier(45, ncbScale, false)).toBe(50);
  });

  it("stays at the top tier once reached", () => {
    expect(nextNcbTier(50, ncbScale, false)).toBe(50);
  });

  it("resets to the bottom tier when a claim was filed during the term", () => {
    expect(nextNcbTier(50, ncbScale, true)).toBe(0);
    expect(nextNcbTier(20, ncbScale, true)).toBe(0);
  });

  it("leaves an unrecognized current NCB unchanged rather than guessing", () => {
    expect(nextNcbTier(17, ncbScale, false)).toBe(17);
  });

  it("resets to the product's OWN bottom tier, not a hardcoded 0, when the scale doesn't start at 0", () => {
    const customScale = { "10": 0.1, "30": 0.3, "60": 0.6 };
    expect(nextNcbTier(60, customScale, true)).toBe(10);
    expect(nextNcbTier(30, customScale, true)).toBe(10);
  });
});
