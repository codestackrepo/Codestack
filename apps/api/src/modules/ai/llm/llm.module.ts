import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiConfig } from '../../../config/configuration';
import { LLM_PROVIDER } from './llm-provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ai = config.getOrThrow<AiConfig>('ai');
        return ai.provider === 'openai'
          ? new OpenAiProvider(ai.apiKey, ai.model, ai.timeoutMs)
          : new AnthropicProvider(ai.apiKey, ai.model, ai.timeoutMs);
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
