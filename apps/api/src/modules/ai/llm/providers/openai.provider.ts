import OpenAI from 'openai';
import {
  LlmMessage,
  LlmProvider,
  LlmRefusalError,
  LlmStructuredOutputError,
  LlmUsage,
  StructuredOptions,
  StructuredResult,
} from '../llm-provider.interface';
import { estimateCostUsd } from '../pricing';

const DEFAULT_MAX_OUTPUT_TOKENS = 8000;

export class OpenAiProvider implements LlmProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly defaultTimeoutMs: number,
  ) {
    this.client = new OpenAI({ apiKey, maxRetries: 2 });
  }

  async generateStructured<T>(
    messages: LlmMessage[],
    schema: Record<string, unknown>,
    schemaName: string,
    opts: StructuredOptions = {},
  ): Promise<StructuredResult<T>> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        max_tokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        response_format: {
          type: 'json_schema',
          json_schema: { name: schemaName, schema, strict: true },
        },
      },
      { timeout: opts.timeoutMs ?? this.defaultTimeoutMs },
    );

    const choice = response.choices[0];
    if (choice?.message.refusal) {
      throw new LlmRefusalError(choice.message.refusal);
    }
    const raw = choice?.message.content;
    if (!raw) {
      throw new LlmStructuredOutputError('OpenAI returned an empty message content', raw ?? '');
    }

    let data: T;
    try {
      data = JSON.parse(raw) as T;
    } catch {
      throw new LlmStructuredOutputError('OpenAI response content was not valid JSON', raw);
    }

    return {
      data,
      usage: this.toUsage(
        response.usage?.prompt_tokens ?? 0,
        response.usage?.completion_tokens ?? 0,
      ),
      raw,
    };
  }

  async generateText(
    messages: LlmMessage[],
    opts: StructuredOptions = {},
  ): Promise<{ text: string; usage: LlmUsage }> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        max_tokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      },
      { timeout: opts.timeoutMs ?? this.defaultTimeoutMs },
    );

    const text = response.choices[0]?.message.content ?? '';
    return {
      text,
      usage: this.toUsage(
        response.usage?.prompt_tokens ?? 0,
        response.usage?.completion_tokens ?? 0,
      ),
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async countTokens(messages: LlmMessage[]): Promise<number> {
    const text = messages.map((m) => m.content).join('\n');
    return Math.ceil(text.length / 4);
  }

  private toUsage(inputTokens: number, outputTokens: number): LlmUsage {
    return {
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(this.model, inputTokens, outputTokens),
      model: this.model,
    };
  }
}
