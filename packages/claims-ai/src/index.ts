export { extractClaimFields } from "./extract.js";
export type { ExtractedFields } from "./extract.js";

export { scoreFraudRisk } from "./fraud.js";
export type { FraudInput, FraudResult } from "./fraud.js";

export {
  RegexDocumentExtractor,
  HeuristicFraudScorer,
  LlmDocumentExtractor,
  LlmFraudScorer,
} from "./providers.js";
export type {
  DocumentExtractor,
  FraudScorer,
  LlmClient,
} from "./providers.js";

export { OllamaLlmClient } from "./ollama.js";
export type { OllamaClientOptions } from "./ollama.js";

export { OpenAiCompatibleLlmClient } from "./openai-compatible.js";
export type { OpenAiCompatibleClientOptions } from "./openai-compatible.js";

export { checkVehicleDetails } from "./vehicle-verification.js";
export type {
  DeclaredVehicleDetails,
  RegistryVehicleDetails,
  VehicleVerificationResult,
} from "./vehicle-verification.js";
