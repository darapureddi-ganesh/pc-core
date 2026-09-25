/** A document verified via a source-of-truth digital locker, not just
 * uploaded/self-declared by the claimant. */
export interface VerifiedDocument {
  docType: "RC" | "DL";
  issuedBy: string;
  issuedDate: string;
  fields: Record<string, string>;
  /** always true — this type only exists to represent a document that came
   * back verified from the source, not a self-uploaded scan */
  sourceVerified: true;
}

/**
 * The document-verification contract — modeled on DigiLocker's issuer-pull
 * consent flow (a user consents, then the requesting party fetches the
 * document from the issuing department, not from the user's own upload).
 * Part of the Connector SDK, same "swappable provider, no hosted service
 * shipped" shape as claims-ai's FraudScorer/DocumentExtractor. Real
 * integration requires DigiLocker Partner API onboarding
 * (api.digilocker.gov.in); no Aadhaar/UIDAI integration is implemented or
 * planned in this repo. See @pc-core/adapters's MockDigiLocker for a
 * synthetic reference adapter simulating the consent -> fetch flow.
 */
export interface DocumentVerificationPort {
  initiateConsent(docType: "RC" | "DL", userRef: string): Promise<{ consentUrl: string }>;
  fetchVerifiedDocument(consentToken: string): Promise<VerifiedDocument | null>;
}
