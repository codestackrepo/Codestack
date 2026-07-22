import { IoSpec } from '../llm/schemas/generated-problem.schema';

export class IoArityError extends Error {
  constructor(expected: number, actual: number) {
    super(`io_spec declares ${expected} param(s) but received ${actual} input value(s)`);
    this.name = 'IoArityError';
  }
}

/**
 * Canonical stdin for a testcase: one JSON-encoded value per line, one line
 * per declared param, in declaration order. Every language driver reads
 * exactly `io_spec.params.length` lines and decodes each with its own JSON
 * parser — this single encoding is shared by all four language drivers, so
 * there is exactly one place ("the codec") that can get canonicalization wrong.
 */
export function encodeStdin(ioSpec: IoSpec, inputs: unknown[]): string {
  if (inputs.length !== ioSpec.params.length) {
    throw new IoArityError(ioSpec.params.length, inputs.length);
  }
  return inputs.map((v) => JSON.stringify(v)).join('\n') + '\n';
}

/** Canonical expected stdout: a single line, the JSON encoding of the return value. */
export function encodeExpectedOutput(expected: unknown): string {
  return JSON.stringify(expected);
}
