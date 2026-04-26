import { describe, it, expect } from "vitest";
import { costUsd, sumUsage, MODEL_PRICING_USD } from "./pricing";

describe("costUsd", () => {
  it("prices a plain Haiku call", () => {
    const c = costUsd("claude-haiku-4-5-20251001", {
      input_tokens: 1000,
      output_tokens: 500,
    });
    // 1000 * $1/M + 500 * $5/M = $0.001 + $0.0025 = $0.0035
    expect(c).toBeCloseTo(0.0035, 5);
  });

  it("prices an Opus call at 15× Haiku input, 15× Haiku output", () => {
    const opus = costUsd("claude-opus-4-7", {
      input_tokens: 1000,
      output_tokens: 500,
    });
    const haiku = costUsd("claude-haiku-4-5-20251001", {
      input_tokens: 1000,
      output_tokens: 500,
    });
    expect(opus / haiku).toBeCloseTo(15, 1);
  });

  it("applies cache_read at a discount", () => {
    const c = costUsd("claude-sonnet-4-6", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 3000,
    });
    // 3000 * $0.30/M = $0.0009
    expect(c).toBeCloseTo(0.0009, 6);
  });

  it("handles unknown models with a pessimistic fallback", () => {
    const c = costUsd("claude-unreleased-9", {
      input_tokens: 1000,
      output_tokens: 500,
    });
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(1);
  });
});

describe("sumUsage", () => {
  it("aggregates across events", () => {
    const s = sumUsage([
      { usage: { input_tokens: 100, output_tokens: 50 } },
      { usage: { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 1000 } },
      {}, // no usage
    ]);
    expect(s.input_tokens).toBe(300);
    expect(s.output_tokens).toBe(130);
    expect(s.cache_read_input_tokens).toBe(1000);
    expect(s.cache_creation_input_tokens).toBe(0);
  });
});

describe("pricing table", () => {
  it("covers every model currently in the roster", () => {
    const required = [
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-6",
      "claude-opus-4-7",
    ];
    for (const model of required) {
      expect(MODEL_PRICING_USD[model]).toBeDefined();
    }
  });
});
