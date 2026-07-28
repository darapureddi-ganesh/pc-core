import { describe, it, expect } from "vitest";
import { extractClaimFields } from "../src/index.js";

describe("extractClaimFields — IDP v1 (regex-based)", () => {
  it("pulls registration no, policy no, amount and dates from free text", () => {
    const text = `
      FNOL received via WhatsApp. Insured's vehicle KA01AB1234 met with an
      accident on 2026-03-01 near Whitefield. Policy PC-2026-000001. Estimated
      repair cost ₹45,000. Surveyor visit scheduled for 05/03/2026.
    `;
    const fields = extractClaimFields(text);
    expect(fields.registrationNo).toBe("KA01AB1234");
    expect(fields.policyNumber).toBe("PC-2026-000001");
    expect(fields.amount).toBe("₹45,000");
    expect(fields.dates).toEqual(["2026-03-01", "05/03/2026"]);
  });

  it("tolerates a spaced/hyphenated registration number", () => {
    const fields = extractClaimFields("Vehicle MH-12-XY-5678 was damaged.");
    expect(fields.registrationNo).toBe("MH12XY5678");
  });

  it("returns an empty dates array and omits fields it can't find", () => {
    const fields = extractClaimFields("No structured details in this note.");
    expect(fields.dates).toEqual([]);
    expect(fields.registrationNo).toBeUndefined();
    expect(fields.policyNumber).toBeUndefined();
    expect(fields.amount).toBeUndefined();
  });
});
