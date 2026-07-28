export {
  classifyClaim,
  DEFAULT_COMPANY_RULES,
  type ClassifyInput,
  type ClassifyResult,
  type CompanyRules,
} from "./classify.js";

export {
  computeSla,
  DEFAULT_SLA_WINDOWS,
  type SlaResult,
  type SlaWindows,
} from "./sla.js";

export { scoreHandler, rankHandlers, type HandlerScore } from "./assign.js";

export type {
  ClaimType,
  Priority,
  Complexity,
  Handler,
  HandlersRepository,
  AssignmentLogEntry,
  AssignmentLogRepository,
} from "./types.js";
