import { describe, it, expect } from "vitest";
import { rankHandlers } from "../src/index.js";
import type { Handler } from "../src/index.js";

const baseHandler = (overrides: Partial<Handler>): Handler => ({
  handlerId: "h",
  name: "Handler",
  expertise: [],
  currentWorkload: 0,
  maxCapacity: 10,
  isAvailable: true,
  avgHandlingDays: 5,
  experienceYears: 5,
  ...overrides,
});

describe("rankHandlers — weighted assignment scoring", () => {
  it("ranks an expert, available, lightly-loaded handler above a generalist", () => {
    const expert = baseHandler({ handlerId: "expert", expertise: ["MOTOR_THEFT"] });
    const generalist = baseHandler({ handlerId: "generalist", expertise: [] });
    const ranked = rankHandlers("MOTOR_THEFT", [generalist, expert]);
    expect(ranked[0]?.handlerId).toBe("expert");
  });

  it("pushes an unavailable handler to the bottom even with a higher raw score", () => {
    const busy = baseHandler({
      handlerId: "busy-unavailable",
      expertise: ["MOTOR_THEFT"],
      isAvailable: false,
      experienceYears: 10,
      avgHandlingDays: 1,
    });
    const available = baseHandler({ handlerId: "available", expertise: [] });
    const ranked = rankHandlers("MOTOR_THEFT", [busy, available]);
    expect(ranked[0]?.handlerId).toBe("available");
    expect(ranked[1]?.handlerId).toBe("busy-unavailable");
  });

  it("prefers a handler with more workload headroom", () => {
    const full = baseHandler({ handlerId: "full", currentWorkload: 9, maxCapacity: 10 });
    const open = baseHandler({ handlerId: "open", currentWorkload: 1, maxCapacity: 10 });
    const ranked = rankHandlers("MOTOR_OTHER", [full, open]);
    expect(ranked[0]?.handlerId).toBe("open");
  });
});
