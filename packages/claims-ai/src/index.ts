export { extractClaimFields } from "./extract.js";
export type { ExtractedFields } from "./extract.js";

export { scoreFraudRisk } from "./fraud.js";
export type { FraudInput, FraudResult } from "./fraud.js";

export {
  RegexDocumentExtractor,
  HeuristicFraudScorer,
  LlmDocumentExtractor,
} from "./providers.js";
export type {
  DocumentExtractor,
  FraudScorer,
  LlmClient,
} from "./providers.js";

export { OllamaLlmClient } from "./ollama.js";
export type { OllamaClientOptions } from "./ollama.js";
