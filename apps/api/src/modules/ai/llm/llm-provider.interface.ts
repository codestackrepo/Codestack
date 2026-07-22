export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface StructuredOptions {
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Re-prompt-with-validation-error attempts before giving up. */
  maxRepairAttempts?: number;
  /** Abort before calling out if the projected cost exceeds this. */
  costCapUsd?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
}

export interface StructuredResult<T> {
  data: T;
  usage: LlmUsage;
  /** The raw text the model returned, for debugging/audit. */
  raw: string;
}

/**
 * Provider-agnostic LLM boundary. Concrete providers (Anthropic/OpenAI) each
 * map `generateStructured` onto their own native structured-output mechanism;
 * callers never see provider-specific request/response shapes.
 */
export interface LlmProvider {
  generateStructured<T>(
    messages: LlmMessage[],
    schema: Record<string, unknown>,
    schemaName: string,
    opts?: StructuredOptions,
  ): Promise<StructuredResult<T>>;

  generateText(
    messages: LlmMessage[],
    opts?: StructuredOptions,
  ): Promise<{ text: string; usage: LlmUsage }>;

  countTokens(messages: LlmMessage[]): Promise<number>;
}

/** The model returned JSON that never passed schema validation, even after repair attempts. */
export class LlmStructuredOutputError extends Error {
  constructor(
    message: string,
    public readonly lastRaw: string,
  ) {
    super(message);
    this.name = 'LlmStructuredOutputError';
  }
}

/** The model declined to generate (safety refusal, policy stop reason, etc). */
export class LlmRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmRefusalError';
  }
}

/** The request was aborted before calling out because it would exceed the configured cost cap. */
export class LlmCostCapExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmCostCapExceededError';
  }
}
