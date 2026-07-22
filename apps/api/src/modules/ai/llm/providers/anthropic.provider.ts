import Anthropic from '@anthropic-ai/sdk';
import {
  LlmMessage,
  LlmProvider,
  LlmRefusalError,
  LlmUsage,
  StructuredOptions,
  StructuredResult,
} from '../llm-provider.interface';
import { estimateCostUsd } from '../pricing';

const DEFAULT_MAX_OUTPUT_TOKENS = 8000;

export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly defaultTimeoutMs: number,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async generateStructured<T>(
    messages: LlmMessage[],
    schema: Record<string, unknown>,
    schemaName: string,
    opts: StructuredOptions = {},
  ): Promise<StructuredResult<T>> {
    const { system, rest } = this.splitSystem(messages);

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        system,
        messages: rest,
        tools: [
          {
            name: schemaName,
            description: `Emit the ${schemaName} payload as tool input, conforming exactly to the provided schema.`,
            input_schema: schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: schemaName },
      },
      { timeout: opts.timeoutMs ?? this.defaultTimeoutMs },
    );

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) {
      throw new LlmRefusalError(
        `Anthropic returned no tool_use block (stop_reason=${response.stop_reason})`,
      );
    }

    const usage = this.toUsage(response.usage.input_tokens, response.usage.output_tokens);
    return { data: toolUse.input as T, usage, raw: JSON.stringify(toolUse.input) };
  }

  async generateText(
    messages: LlmMessage[],
    opts: StructuredOptions = {},
  ): Promise<{ text: string; usage: LlmUsage }> {
    const { system, rest } = this.splitSystem(messages);

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        system,
        messages: rest,
      },
      { timeout: opts.timeoutMs ?? this.defaultTimeoutMs },
    );

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return { text, usage: this.toUsage(response.usage.input_tokens, response.usage.output_tokens) };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async countTokens(messages: LlmMessage[]): Promise<number> {
    const text = messages.map((m) => m.content).join('\n');
    return Math.ceil(text.length / 4);
  }

  private splitSystem(messages: LlmMessage[]): {
    system: string | undefined;
    rest: Anthropic.MessageParam[];
  } {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const rest = messages
      .filter((m): m is LlmMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
    return { system: system || undefined, rest };
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
