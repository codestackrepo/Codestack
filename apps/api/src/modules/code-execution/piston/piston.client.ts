import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'undici';
import { PistonConfig } from '../../../config/configuration';
import { PistonExecuteRequest, PistonExecuteResponse, RawRun } from './piston.types';
import { Semaphore } from './semaphore';

interface Replica {
  origin: string;
  path: string;
  pool: Pool;
  inFlight: number;
}

const MAX_TRANSPORT_RETRIES = 2;

/**
 * HTTP client for the Piston sandbox pool. Provides:
 *  - keep-alive connection pooling (undici) per replica
 *  - least-in-flight replica selection + a global concurrency semaphore
 *  - transport-only retries (never retries a real verdict)
 */
@Injectable()
export class PistonClient implements OnModuleDestroy {
  private readonly logger = new Logger(PistonClient.name);
  private readonly replicas: Replica[];
  private readonly semaphore: Semaphore;
  private readonly connectTimeoutMs: number;

  constructor(config: ConfigService) {
    const cfg = config.getOrThrow<PistonConfig>('piston');
    this.connectTimeoutMs = cfg.connectTimeoutMs;
    this.semaphore = new Semaphore(cfg.maxInflight);
    this.replicas = cfg.urls.map((url) => {
      const parsed = new URL(url);
      return {
        origin: parsed.origin,
        path: parsed.pathname,
        inFlight: 0,
        pool: new Pool(parsed.origin, {
          connections: Math.max(4, Math.ceil(cfg.maxInflight / cfg.urls.length) + 2),
          connect: { timeout: this.connectTimeoutMs },
        }),
      };
    });
  }

  get inFlight(): number {
    return this.replicas.reduce((sum, r) => sum + r.inFlight, 0);
  }

  async execute(req: PistonExecuteRequest, runTimeoutMs: number): Promise<RawRun> {
    const release = await this.semaphore.acquire();
    const start = Date.now();
    try {
      return await this.executeWithRetries(req, runTimeoutMs, start);
    } finally {
      release();
    }
  }

  private async executeWithRetries(
    req: PistonExecuteRequest,
    runTimeoutMs: number,
    start: number,
  ): Promise<RawRun> {
    let lastError = 'unknown transport error';
    for (let attempt = 0; attempt <= MAX_TRANSPORT_RETRIES; attempt++) {
      const replica = this.pickReplica();
      replica.inFlight += 1;
      try {
        const res = await replica.pool.request({
          path: replica.path,
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(req),
          headersTimeout: runTimeoutMs + 2000,
          bodyTimeout: runTimeoutMs + 2000,
        });
        if (res.statusCode >= 500) {
          lastError = `Piston HTTP ${res.statusCode}`;
          await res.body.dump();
          continue; // retry on 5xx
        }
        const data = (await res.body.json()) as PistonExecuteResponse;
        return this.normalize(data, start);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Piston attempt ${attempt + 1} failed: ${lastError}`);
      } finally {
        replica.inFlight -= 1;
      }
    }
    return {
      run: { status: null, stdout: '', stderr: '', code: null, signal: null, memory: 0 },
      wallTimeMs: Date.now() - start,
      transportError: lastError,
    };
  }

  private normalize(data: PistonExecuteResponse, start: number): RawRun {
    const run = data.run ?? { stdout: '', stderr: '', code: null, signal: null };
    return {
      compile: data.compile
        ? {
            code: data.compile.code,
            stdout: data.compile.stdout ?? '',
            stderr: data.compile.stderr ?? '',
            signal: data.compile.signal ?? null,
          }
        : undefined,
      run: {
        status: run.status ?? null,
        stdout: run.stdout ?? '',
        stderr: run.stderr ?? '',
        code: run.code ?? null,
        signal: run.signal ?? null,
        memory: run.memory ?? 0,
      },
      wallTimeMs: Date.now() - start,
    };
  }

  private pickReplica(): Replica {
    return this.replicas.reduce(
      (best, r) => (r.inFlight < best.inFlight ? r : best),
      this.replicas[0],
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.replicas.map((r) => r.pool.close()));
  }
}
