interface PriceTier {
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * Ordered most-specific-prefix-first (e.g. "gpt-4o-mini" before "gpt-4o") so
 * `.find` picks the tightest match. Unknown/future model ids fall back to
 * DEFAULT_PRICE — deliberately pessimistic so an unrecognized model never
 * silently under-reports spend against a cost cap.
 */
const PRICE_TABLE: Array<{ prefix: string; price: PriceTier }> = [
  { prefix: 'claude-opus-4', price: { inputPerMillion: 15, outputPerMillion: 75 } },
  { prefix: 'claude-sonnet-5', price: { inputPerMillion: 3, outputPerMillion: 15 } },
  { prefix: 'claude-sonnet', price: { inputPerMillion: 3, outputPerMillion: 15 } },
  { prefix: 'claude-haiku', price: { inputPerMillion: 0.8, outputPerMillion: 4 } },
  { prefix: 'claude-fable', price: { inputPerMillion: 1, outputPerMillion: 5 } },
  { prefix: 'gpt-4o-mini', price: { inputPerMillion: 0.15, outputPerMillion: 0.6 } },
  { prefix: 'gpt-4o', price: { inputPerMillion: 2.5, outputPerMillion: 10 } },
  { prefix: 'gpt-5', price: { inputPerMillion: 5, outputPerMillion: 15 } },
];

const DEFAULT_PRICE: PriceTier = { inputPerMillion: 15, outputPerMillion: 75 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const tier = PRICE_TABLE.find((t) => model.startsWith(t.prefix))?.price ?? DEFAULT_PRICE;
  return (
    (inputTokens / 1_000_000) * tier.inputPerMillion +
    (outputTokens / 1_000_000) * tier.outputPerMillion
  );
}

/**
 * Fast, provider-agnostic pre-flight estimate (chars/4) used only to enforce
 * `costCapUsd` before calling out. The real, billed usage always comes from
 * the provider's own response and is what gets persisted.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
