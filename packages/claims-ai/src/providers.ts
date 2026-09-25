import { extractClaimFields, type ExtractedFields } from "./extract.js";
import { scoreFraudRisk, type FraudInput, type FraudResult } from "./fraud.js";

/**
 * The swappable seams. ClaimsService depends only on these interfaces, so a
 * connected company can plug a real OCR/LLM extractor or a real fraud model in
 * behind them without touching any claims logic. The built-in implementations
 * below (regex IDP, heuristic fraud) are the defaults.
 */
export interface DocumentExtractor {
  extract(rawText: string): Promise<ExtractedFields>;
}

export interface FraudScorer {
  score(input: FraudInput): Promise<FraudResult>;
}

export interface TriageAdvisorInput {
  /** FNOL free-text description (the claim's `cause`, plus any raw intake note) */
  description: string;
  /** claim amount, typically the sum insured at incident date */
  amount: number;
}

export interface TriageAdvisorResult {
  suggestedPriority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  suggestedClaimType: "MOTOR_ACCIDENT" | "MOTOR_THEFT" | "MOTOR_OTHER";
  rationale: string;
}

/**
 * The claim-queue advisory seam: purely additive, never a decision-maker.
 * Unlike FraudScorer/DocumentExtractor (which always run, model or no model),
 * a TriageAdvisor's suggestion is ADVISORY ONLY — @pc-core/claims-queue's
 * deterministic classifyClaim() always sets the real priority/claimType, and
 * the advisor's opinion is stored alongside it purely for a human reviewer to
 * compare, never applied automatically. Returning null (no opinion) is always
 * a valid, silently-skipped outcome.
 */
export interface TriageAdvisor {
  advise(input: TriageAdvisorInput): Promise<TriageAdvisorResult | null>;
}

/** Default IDP: the deterministic regex extractor, wrapped as a provider. */
export class RegexDocumentExtractor implements DocumentExtractor {
  async extract(rawText: string): Promise<ExtractedFields> {
    return extractClaimFields(rawText);
  }
}

/** Default fraud: the deterministic heuristic scorer, wrapped as a provider. */
export class HeuristicFraudScorer implements FraudScorer {
  async score(input: FraudInput): Promise<FraudResult> {
    return scoreFraudRisk(input);
  }
}

/**
 * A provider-agnostic LLM contract. Implement `complete` against Claude, GPT, a
 * local Ollama model — anything that turns a prompt into text.
 */
export interface LlmClient {
  complete(prompt: string): Promise<string>;
}

/**
 * Reference adapter showing how to put a real LLM behind `DocumentExtractor`.
 * It asks the model for strict JSON and validates the reply; any malformed or
 * partial response degrades safely to empty fields, so a bad model output can
 * never crash claim intake. This is the template a company fills in with their
 * chosen model — OpenCover itself ships no model.
 */
export class LlmDocumentExtractor implements DocumentExtractor {
  constructor(private readonly llm: LlmClient) {}

  async extract(rawText: string): Promise<ExtractedFields> {
    const prompt = [
      "You extract structured fields from an insurance claim intake note.",
      'Return ONLY strict JSON of the form:',
      '{"registrationNo"?:string,"policyNumber"?:string,"amount"?:string,"dates":string[]}',
      "Note:",
      rawText,
    ].join("\n");

    let reply: string;
    try {
      reply = await this.llm.complete(prompt);
    } catch {
      return { dates: [] };
    }
    return parseExtraction(reply);
  }
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Reference adapter showing how to put a real LLM behind `FraudScorer`,
 * reasoning over the same signals the heuristic scorer sees (prior claims on
 * the policy, days since policy inception) instead of applying fixed weights.
 * Asks for strict JSON and validates the reply; a malformed reply OR a
 * failed model call falls back to the deterministic `scoreFraudRisk` — fraud
 * detection never goes silent just because a model had a bad day, and FNOL
 * is never blocked by it. This is the template a company fills in with their
 * chosen model (Claude, GPT, a local Ollama model) — OpenCover itself ships
 * no hosted model.
 */
export class LlmFraudScorer implements FraudScorer {
  constructor(private readonly llm: LlmClient) {}

  async score(input: FraudInput): Promise<FraudResult> {
    const prompt = [
      "You are a P&C motor-insurance fraud analyst assessing a newly-filed claim.",
      "Return ONLY strict JSON of the form:",
      '{"score":number (0 to 1),"signals":string[]}',
      "Signals about this claim:",
      `- prior claims already filed on this policy: ${input.priorClaimsOnPolicy}`,
      `- days between policy inception and the incident date: ${input.daysSincePolicyStart}`,
    ].join("\n");

    let reply: string;
    try {
      reply = await this.llm.complete(prompt);
    } catch {
      return scoreFraudRisk(input);
    }
    return parseFraudResult(reply) ?? scoreFraudRisk(input);
  }
}

const VALID_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const VALID_CLAIM_TYPES = new Set(["MOTOR_ACCIDENT", "MOTOR_THEFT", "MOTOR_OTHER"]);

/**
 * Reference adapter showing how to put a real LLM behind `TriageAdvisor`.
 * Asks for strict JSON constrained to the same enum values the deterministic
 * classifier uses, and rejects anything else outright — a model can suggest
 * "HIGH", never invent a priority level that doesn't exist in the rules
 * pipeline. Degrades to no opinion (`null`) on a malformed reply or a failed
 * model call; a triage hint that isn't there is always safe, an invented one
 * wouldn't be. OpenCover itself ships no hosted model.
 */
export class LlmTriageAdvisor implements TriageAdvisor {
  constructor(private readonly llm: LlmClient) {}

  async advise(input: TriageAdvisorInput): Promise<TriageAdvisorResult | null> {
    const prompt = [
      "You are a P&C motor-insurance claims triage assistant.",
      "Suggest a priority and claim type for this newly-filed claim.",
      "Return ONLY strict JSON of the form:",
      '{"suggestedPriority":"LOW"|"MEDIUM"|"HIGH"|"CRITICAL","suggestedClaimType":"MOTOR_ACCIDENT"|"MOTOR_THEFT"|"MOTOR_OTHER","rationale":string}',
      "Claim:",
      `- description: ${input.description}`,
      `- claim amount: ${input.amount}`,
    ].join("\n");

    let reply: string;
    try {
      reply = await this.llm.complete(prompt);
    } catch {
      return null;
    }
    return parseTriageResult(reply);
  }
}

function parseTriageResult(reply: string): TriageAdvisorResult | null {
  try {
    const json = JSON.parse(isolateJson(reply)) as Partial<TriageAdvisorResult>;
    if (
      typeof json.suggestedPriority !== "string" ||
      !VALID_PRIORITIES.has(json.suggestedPriority) ||
      typeof json.suggestedClaimType !== "string" ||
      !VALID_CLAIM_TYPES.has(json.suggestedClaimType) ||
      typeof json.rationale !== "string"
    ) {
      return null;
    }
    return {
      suggestedPriority: json.suggestedPriority as TriageAdvisorResult["suggestedPriority"],
      suggestedClaimType: json.suggestedClaimType as TriageAdvisorResult["suggestedClaimType"],
      rationale: json.rationale,
    };
  } catch {
    return null;
  }
}

function parseFraudResult(reply: string): FraudResult | null {
  try {
    const json = JSON.parse(isolateJson(reply)) as Partial<FraudResult>;
    if (typeof json.score !== "number" || !Array.isArray(json.signals)) {
      return null;
    }
    const signals = json.signals.filter((s): s is string => typeof s === "string");
    return { score: clamp01(json.score), signals };
  } catch {
    return null;
  }
}

function parseExtraction(reply: string): ExtractedFields {
  try {
    const json = JSON.parse(isolateJson(reply)) as Partial<ExtractedFields>;
    const out: ExtractedFields = { dates: [] };
    if (typeof json.registrationNo === "string") out.registrationNo = json.registrationNo;
    if (typeof json.policyNumber === "string") out.policyNumber = json.policyNumber;
    if (typeof json.amount === "string") out.amount = json.amount;
    if (Array.isArray(json.dates)) {
      out.dates = json.dates.filter((d): d is string => typeof d === "string");
    }
    return out;
  } catch {
    return { dates: [] };
  }
}

/** Tolerate models that wrap JSON in prose or ```json fences. */
function isolateJson(reply: string): string {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  return start >= 0 && end > start ? reply.slice(start, end + 1) : reply;
}
