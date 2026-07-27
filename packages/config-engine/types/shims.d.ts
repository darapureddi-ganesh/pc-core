// json-logic-js ships no types of its own; we only use `apply`.
declare module "json-logic-js" {
  const jsonLogic: {
    apply(rule: unknown, data?: unknown): unknown;
  };
  export default jsonLogic;
}
