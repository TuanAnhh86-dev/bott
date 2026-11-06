import { describe, it, expect } from "vitest";
import { calculateTokenCost } from "@/lib/ai/costs";

describe("AI Cost & Token Calculator", () => {
  it("should calculate zero cost for zero tokens", () => {
    const cost = calculateTokenCost({ promptTokens: 0, completionTokens: 0 });
    expect(cost.costUsd).toBe(0);
    expect(cost.costVnd).toBe(0);
    expect(cost.savingsVnd).toBe(0);
  });

  it("should calculate correct cost with cached tokens discount", () => {
    // 1,000,000 prompt tokens (800,000 cached, 200,000 uncached), 100,000 output tokens
    const usage = {
      promptTokens: 1_000_000,
      cachedTokens: 800_000,
      completionTokens: 100_000,
    };

    const result = calculateTokenCost(usage);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.savingsUsd).toBeGreaterThan(0);
    expect(result.costVnd).toBe(result.costUsd * 25400);
    expect(result.savingsVnd).toBe(result.savingsUsd * 25400);
  });

  it("should yield greater savings as cache hit ratio increases", () => {
    const lowCache = calculateTokenCost({ promptTokens: 100_000, cachedTokens: 10_000, completionTokens: 5_000 });
    const highCache = calculateTokenCost({ promptTokens: 100_000, cachedTokens: 90_000, completionTokens: 5_000 });

    expect(highCache.savingsVnd).toBeGreaterThan(lowCache.savingsVnd);
    expect(highCache.costVnd).toBeLessThan(lowCache.costVnd);
  });
});

