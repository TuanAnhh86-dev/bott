export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
}

export interface CostCalculation {
  costUsd: number;
  costVnd: number;
  savingsUsd: number;
  savingsVnd: number;
}

// Giá Gemini 2.0 Flash / DeepSeek V3 làm chuẩn:
// Input thông thường: $0.075 / 1M tokens
// Input Cache Hit:    $0.01875 / 1M tokens
// Output:             $0.30 / 1M tokens
const DEFAULT_PRICE_INPUT_PER_M = 0.075;
const DEFAULT_PRICE_CACHE_HIT_PER_M = 0.01875;
const DEFAULT_PRICE_OUTPUT_PER_M = 0.30;
const DEFAULT_USD_TO_VND = 25400;

export function calculateTokenCost(
  usage: TokenUsage,
  customPricing?: {
    inputPerM?: number;
    cacheHitPerM?: number;
    outputPerM?: number;
    usdToVnd?: number;
  }
): CostCalculation {
  const pInput = customPricing?.inputPerM ?? DEFAULT_PRICE_INPUT_PER_M;
  const pCache = customPricing?.cacheHitPerM ?? DEFAULT_PRICE_CACHE_HIT_PER_M;
  const pOutput = customPricing?.outputPerM ?? DEFAULT_PRICE_OUTPUT_PER_M;
  const rate = customPricing?.usdToVnd ?? DEFAULT_USD_TO_VND;

  const totalPrompt = usage.promptTokens || 0;
  const cached = Math.min(usage.cachedTokens || 0, totalPrompt);
  const uncached = Math.max(0, totalPrompt - cached);
  const output = usage.completionTokens || 0;

  // Actual cost
  const costUsd =
    (uncached / 1_000_000) * pInput +
    (cached / 1_000_000) * pCache +
    (output / 1_000_000) * pOutput;

  // Cost if NO caching was used
  const costWithoutCacheUsd =
    (totalPrompt / 1_000_000) * pInput +
    (output / 1_000_000) * pOutput;

  const savingsUsd = Math.max(0, costWithoutCacheUsd - costUsd);

  return {
    costUsd,
    costVnd: costUsd * rate,
    savingsUsd,
    savingsVnd: savingsUsd * rate,
  };
}

