import { describe, it, expect } from "vitest";
import { MockDigiLocker } from "../src/mock-digilocker.js";

describe("MockDigiLocker — synthetic consent -> fetch flow", () => {
  it("initiates consent and returns a consent URL carrying a token", async () => {
    const digilocker = new MockDigiLocker();
    const { consentUrl } = await digilocker.initiateConsent("RC", "user-123");
    expect(consentUrl).toMatch(/^https:\/\/mock-digilocker\.example\/consent\/.+/);
  });

  it("fetches a verified RC document for a valid consent token", async () => {
    const digilocker = new MockDigiLocker();
    const { consentUrl } = await digilocker.initiateConsent("RC", "user-123");
    const token = consentUrl.split("/").pop()!;

    const doc = await digilocker.fetchVerifiedDocument(token);
    expect(doc).not.toBeNull();
    expect(doc?.docType).toBe("RC");
    expect(doc?.sourceVerified).toBe(true);
    expect(doc?.fields.chassisNumber).toBe("MA3ERLF1S00123456");
  });

  it("fetches a verified DL document for a valid consent token", async () => {
    const digilocker = new MockDigiLocker();
    const { consentUrl } = await digilocker.initiateConsent("DL", "user-456");
    const token = consentUrl.split("/").pop()!;

    const doc = await digilocker.fetchVerifiedDocument(token);
    expect(doc?.docType).toBe("DL");
    expect(doc?.fields.dlNumber).toBe("KA0120210012345");
  });

  it("returns null for an unknown or expired consent token", async () => {
    const digilocker = new MockDigiLocker();
    const doc = await digilocker.fetchVerifiedDocument("never-issued-token");
    expect(doc).toBeNull();
  });
});
