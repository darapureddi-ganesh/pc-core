/**
 * Intelligent Document Processing — v1.
 *
 * This is a deterministic, regex-based extractor, not an OCR/LLM model — PC Core
 * ships no hosted ML. It exists to (a) prove the IDP pillar end-to-end at FNOL
 * with zero external dependencies, and (b) define the extraction *interface* a
 * connected company can swap a real OCR/LLM provider behind without touching
 * ClaimsService. The regexes target the Indian claims document mix: vehicle
 * registration numbers, policy numbers, currency amounts, and dates in both
 * ISO and DD/MM/YYYY form.
 */

export interface ExtractedFields {
  registrationNo?: string;
  policyNumber?: string;
  amount?: string;
  dates: string[];
}

// e.g. KA01AB1234, KA-01-AB-1234, MH 12 XY 5678
const REGISTRATION_RE = /\b[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{1,3}[\s-]?\d{4}\b/;
// e.g. PC-2026-000001, BETA-2026-000001
const POLICY_NO_RE = /\b[A-Z]{2,8}-\d{3,4}-\d{5,6}\b/;
// e.g. ₹6,00,000  Rs. 21642.38  INR 3416
const AMOUNT_RE = /(?:₹|Rs\.?|INR)\s?[\d,]+(?:\.\d{1,2})?/i;
// ISO (2026-03-01) and Indian DD/MM/YYYY (01/03/2026) dates
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b/g;

export function extractClaimFields(rawText: string): ExtractedFields {
  const registrationNo = rawText.match(REGISTRATION_RE)?.[0]?.replace(/[\s-]/g, "");
  const policyNumber = rawText.match(POLICY_NO_RE)?.[0];
  const amount = rawText.match(AMOUNT_RE)?.[0];
  const dates = [...rawText.matchAll(DATE_RE)].map((m) => m[0]);

  return {
    ...(registrationNo && { registrationNo }),
    ...(policyNumber && { policyNumber }),
    ...(amount && { amount }),
    dates,
  };
}
