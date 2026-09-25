/** Minimal dot-path get/set — no arrays, no expressions, just nested object keys. */

/**
 * Every path here is at least partly caller-controlled (a self-serve
 * registration request, or a model's own proposal) and gets walked/written
 * with plain property access. `__proto__`/`prototype`/`constructor` segments
 * would otherwise let a crafted path reach and mutate a shared prototype
 * (e.g. `Object.prototype`) instead of a plain data property — reject them
 * outright rather than trying to sanitize around them.
 */
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function assertSafeKeys(path: string): string[] {
  const keys = path.split(".");
  if (keys.some((k) => UNSAFE_KEYS.has(k))) {
    throw new Error(`unsafe path segment in "${path}"`);
  }
  return keys;
}

export function getPath(obj: unknown, path: string): unknown {
  return assertSafeKeys(path).reduce<unknown>((cur, key) => {
    if (cur === null || typeof cur !== "object") return undefined;
    // own-property only — `in`/plain indexing would also match inherited
    // properties (e.g. a status value of "toString"), which is never a
    // real field on a JSON record.
    return Object.prototype.hasOwnProperty.call(cur, key)
      ? (cur as Record<string, unknown>)[key]
      : undefined;
  }, obj);
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = assertSafeKeys(path);
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    const existing = Object.prototype.hasOwnProperty.call(cur, key) ? cur[key] : undefined;
    if (existing === null || typeof existing !== "object" || Array.isArray(existing)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]!] = value;
}
