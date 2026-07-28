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
 * chosen model — pc-core itself ships no model.
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
