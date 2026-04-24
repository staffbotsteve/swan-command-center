// Per-million-token rates for the Anthropic models we run.
// Verify against https://www.anthropic.com/pricing before trusting
// in financial reports. Numbers here are current best-estimate as
// of 2026-04-24; update when Anthropic moves.
//
// Rate = (input_tokens * input_per_M + output_tokens * output_per_M) / 1_000_000

export interface ModelRate {
  input: number;   // USD per million input tokens
  output: number;  // USD per million output tokens
  cache_read?: number;  // 90%-off on cached prompts (Anthropic default)
}

export const MODEL_PRICING_USD: Record<string, ModelRate> = {
  "claude-haiku-4-5-20251001": { input: 1.00,  output: 5.00,  cache_read: 0.10 },
  "claude-sonnet-4-6":         { input: 3.00,  output: 15.00, cache_read: 0.30 },
  "claude-opus-4-7":           { input: 15.00, output: 75.00, cache_read: 1.50 },
};

/** Default fallback when model isn't in the table. Pessimistic on purpose. */
const FALLBACK: ModelRate = { input: 5.00, output: 25.00, cache_read: 0.50 };

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function costUsd(model: string, usage: TokenUsage): number {
  const rate = MODEL_PRICING_USD[model] ?? FALLBACK;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheReadRate = rate.cache_read ?? rate.input * 0.1;
  // Cache creation is 25% more than base input, per Anthropic's published pricing
  const cacheCreationRate = rate.input * 1.25;
  return (
    (input * rate.input) / 1_000_000 +
    (output * rate.output) / 1_000_000 +
    (cacheRead * cacheReadRate) / 1_000_000 +
    (cacheCreation * cacheCreationRate) / 1_000_000
  );
}

/** Sum usage across a list of events (from runTurn or listEvents). */
export function sumUsage(
  events: { usage?: TokenUsage }[]
): Required<TokenUsage> {
  const out: Required<TokenUsage> = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  for (const e of events) {
    if (!e.usage) continue;
    out.input_tokens += e.usage.input_tokens ?? 0;
    out.output_tokens += e.usage.output_tokens ?? 0;
    out.cache_creation_input_tokens += e.usage.cache_creation_input_tokens ?? 0;
    out.cache_read_input_tokens += e.usage.cache_read_input_tokens ?? 0;
  }
  return out;
}
