import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language } from '../../../common/enums/language.enum';
import { RuntimeConfig } from '../../../config/configuration';
import { PistonClient } from '../piston/piston.client';
import { RawRun } from '../piston/piston.types';
import { LANGUAGE_RUNTIMES, LanguageRuntime } from './runtime-config';

export interface ExecOptions {
  timeoutMs: number;
  memoryLimitBytes: number;
  maxProcessCount: number;
}

/**
 * Resolves a language to its Piston runtime and drives a single execution.
 * Stateless and thin — all HTTP concerns live in PistonClient.
 */
@Injectable()
export class ExecutorService {
  private readonly runtime: RuntimeConfig;

  constructor(
    config: ConfigService,
    private readonly piston: PistonClient,
  ) {
    this.runtime = config.getOrThrow<RuntimeConfig>('runtime');
  }

  getRuntime(language: Language): LanguageRuntime {
    const base = LANGUAGE_RUNTIMES[language];
    return { ...base, version: this.versionFor(language) };
  }

  defaultOptions(): ExecOptions {
    return {
      timeoutMs: this.runtime.defaultTimeoutMs,
      memoryLimitBytes: this.runtime.defaultMemoryLimit,
      maxProcessCount: this.runtime.defaultMaxProcessCount,
    };
  }

  async execute(
    language: Language,
    fullCode: string,
    stdin: string,
    opts: ExecOptions,
  ): Promise<RawRun> {
    const rt = this.getRuntime(language);
    return this.piston.execute(
      {
        language: rt.pistonLanguage,
        version: rt.version,
        files: [{ name: rt.mainFilename, content: fullCode }],
        stdin,
        run_timeout: opts.timeoutMs,
        run_memory_limit: opts.memoryLimitBytes,
        compile_timeout: 10000,
      },
      opts.timeoutMs,
    );
  }

  private versionFor(language: Language): string {
    switch (language) {
      case Language.PYTHON:
        return this.runtime.pythonVersion;
      case Language.JAVASCRIPT:
        return this.runtime.jsVersion;
      case Language.JAVA:
        return this.runtime.javaVersion;
      case Language.CPP:
        return this.runtime.cppVersion;
    }
  }
}
