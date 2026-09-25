import { describe, it, expect } from "vitest";
import { getPath, setPath } from "../src/paths.js";

describe("getPath / setPath — safe against prototype pollution and inherited properties", () => {
  it("gets a nested value", () => {
    expect(getPath({ a: { b: "x" } }, "a.b")).toBe("x");
  });

  it("returns undefined for a missing own property, never an inherited one", () => {
    expect(getPath({}, "toString")).toBeUndefined(); // "toString" itself isn't a reserved key
  });

  it("rejects __proto__/prototype/constructor segments in getPath outright", () => {
    expect(() => getPath({}, "__proto__.polluted")).toThrow(/unsafe path segment/);
    expect(() => getPath({}, "constructor.prototype")).toThrow(/unsafe path segment/);
    expect(() => getPath({}, "constructor")).toThrow(/unsafe path segment/);
  });

  it("rejects __proto__/prototype/constructor segments in setPath, never mutating a shared prototype", () => {
    const obj: Record<string, unknown> = {};
    expect(() => setPath(obj, "__proto__.polluted", "evil")).toThrow(/unsafe path segment/);
    expect(() => setPath(obj, "a.constructor.prototype.polluted", "evil")).toThrow(
      /unsafe path segment/,
    );
    // and, whatever happened, Object.prototype itself was never touched
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("sets a nested value, creating intermediate objects", () => {
    const obj: Record<string, unknown> = {};
    setPath(obj, "a.b.c", "x");
    expect(obj).toEqual({ a: { b: { c: "x" } } });
  });
});
