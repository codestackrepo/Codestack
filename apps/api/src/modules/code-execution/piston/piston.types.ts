/** Piston /api/v2/execute request payload. */
export interface PistonExecuteRequest {
  language: string;
  version: string;
  files: { name: string; content: string }[];
  stdin: string;
  run_timeout: number;
  run_memory_limit: number;
  compile_timeout?: number;
  compile_memory_limit?: number;
  run_cpu_time?: number;
}

/** A single stage (compile or run) in Piston's response. */
export interface PistonStage {
  stdout: string;
  stderr: string;
  output: string;
  code: number | null;
  signal: string | null;
  memory?: number;
}

export interface PistonExecuteResponse {
  language: string;
  version: string;
  run: PistonStage & { status?: string | null };
  compile?: PistonStage;
}

/** Normalized result returned by PistonClient (before verdict classification). */
export interface RawRun {
  compile?: {
    code: number | null;
    stdout: string;
    stderr: string;
    signal: string | null;
  };
  run: {
    status: string | null;
    stdout: string;
    stderr: string;
    code: number | null;
    signal: string | null;
    memory: number;
  };
  wallTimeMs: number;
  /** Set when Piston itself failed (network / 5xx / breaker open). */
  transportError?: string;
}
