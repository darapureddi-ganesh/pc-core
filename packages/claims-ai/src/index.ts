export { extractClaimFields } from "./extract.js";
export type { ExtractedFields } from "./extract.js";

export { scoreFraudRisk } from "./fraud.js";
export type { FraudInput, FraudResult } from "./fraud.js";

export {
  RegexDocumentExtractor,
  HeuristicFraudScorer,
  LlmDocumentExtractor,
  LlmFraudScorer,
  LlmTriageAdvisor,
} from "./providers.js";
export type {
  DocumentExtractor,
  FraudScorer,
  LlmClient,
  TriageAdvisor,
  TriageAdvisorInput,
  TriageAdvisorResult,
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
