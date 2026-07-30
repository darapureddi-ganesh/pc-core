import { randomUUID } from "node:crypto";
import type { DocumentVerificationPort, VerifiedDocument } from "@pc-core/ports";

/**
 * MOCK ONLY — real integration requires DigiLocker Partner API onboarding
 * (api.digilocker.gov.in). No Aadhaar/UIDAI integration is implemented or
 * planned in this repo. This simulates the consent -> fetch flow with fake
 * data, so the seam is provable end-to-end without touching a live
 * UIDAI-linked system.
 */
export class MockDigiLocker implements DocumentVerificationPort {
  private readonly pendingConsents = new Map<
    string,
    { docType: "RC" | "DL"; userRef: string }
  >();

  async initiateConsent(
    docType: "RC" | "DL",
    userRef: string,
  ): Promise<{ consentUrl: string }> {
    const consentToken = randomUUID();
    this.pendingConsents.set(consentToken, { docType, userRef });
    return { consentUrl: `https://mock-digilocker.example/consent/${consentToken}` };
  }

  async fetchVerifiedDocument(consentToken: string): Promise<VerifiedDocument | null> {
    const pending = this.pendingConsents.get(consentToken);
    if (!pending) return null;

    const fields: Record<string, string> =
      pending.docType === "RC"
        ? {
            regNo: "KA01AB1234",
            ownerName: "A. Sharma",
            chassisNumber: "MA3ERLF1S00123456",
            engineNumber: "K12MN1234567",
          }
        : {
            dlNumber: "KA0120210012345",
            holderName: "A. Sharma",
            validUntil: "2041-01-01",
          };

    return {
      docType: pending.docType,
      issuedBy: "Transport Department",
      issuedDate: "2024-01-01",
      fields,
      sourceVerified: true,
    };
  }
}
