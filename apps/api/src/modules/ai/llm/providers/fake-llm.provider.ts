import {
  LlmMessage,
  LlmProvider,
  LlmUsage,
  StructuredOptions,
  StructuredResult,
} from '../llm-provider.interface';

const ZERO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'fake' };

/**
 * Deterministic test double for LlmProvider — no network, no API key. Tests
 * queue up the exact structured payload they want returned (mirroring how
 * FakeExecutorService stubs Piston for the judge e2e tests), so the
 * self-validation loop and generation pipeline can be exercised without a
 * real LLM call.
 */
export class FakeLlmProvider implements LlmProvider {
  private structuredQueue: unknown[] = [];
  private textQueue: string[] = [];
  public readonly calls: { messages: LlmMessage[]; schemaName?: string }[] = [];

  queueStructuredResponse(data: unknown): void {
    this.structuredQueue.push(data);
  }

  queueTextResponse(text: string): void {
    this.textQueue.push(text);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async generateStructured<T>(
    messages: LlmMessage[],
    _schema: Record<string, unknown>,
    schemaName: string,
    _opts?: StructuredOptions,
  ): Promise<StructuredResult<T>> {
    this.calls.push({ messages, schemaName });
    if (this.structuredQueue.length === 0) {
      throw new Error('FakeLlmProvider.generateStructured called with an empty response queue');
    }
    const data = this.structuredQueue.shift() as T;
    return { data, usage: ZERO_USAGE, raw: JSON.stringify(data) };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async generateText(
    messages: LlmMessage[],
    _opts?: StructuredOptions,
  ): Promise<{ text: string; usage: LlmUsage }> {
    this.calls.push({ messages });
    const text = this.textQueue.shift() ?? '';
    return { text, usage: ZERO_USAGE };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async countTokens(messages: LlmMessage[]): Promise<number> {
    return Math.ceil(messages.map((m) => m.content).join('\n').length / 4);
  }
}
