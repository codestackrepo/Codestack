import { BadRequestException } from '@nestjs/common';
import type { IoSpec } from '../code-execution/driver-synth/io-spec.types';

/**
 * `functionName` and `ioSpec` are all-or-nothing.
 *
 * `Problem.isJudgeReady` is `!!ioSpec && !!functionName`, so a row carrying exactly
 * one of them is not "partially specified" — it is indistinguishable from a
 * prose-only problem, while looking authored to whoever set the one field. The
 * synthesizer needs both (the name to call, the signature to marshal), and there is
 * no useful behaviour for the half state.
 *
 * Rejecting it at the boundary is what keeps `isJudgeReady` a trustworthy flag rather
 * than something every consumer has to re-derive defensively.
 *
 * Duplicate parameter names are refused here too: they pass field-level validation
 * one at a time, but the driver declares each parameter as a variable, so two called
 * `n` generate source that does not compile — a failure every solver would see and
 * only the author could fix.
 */
export function assertJudgeSpec(
  functionName: string | null | undefined,
  ioSpec: IoSpec | null | undefined,
): void {
  const hasName = !!functionName;
  const hasSpec = !!ioSpec;

  if (hasName !== hasSpec) {
    throw new BadRequestException({
      reason: 'incomplete_judge_spec',
      message:
        'functionName and ioSpec must be provided together — a problem with only one of them ' +
        'cannot be judged. Send both, or neither for a prose-only problem.',
    });
  }

  if (!ioSpec) return;

  const names = ioSpec.params.map((p) => p.name);
  const duplicate = names.find((n, i) => names.indexOf(n) !== i);
  if (duplicate) {
    throw new BadRequestException({
      reason: 'duplicate_param_name',
      message: `Parameter name '${duplicate}' is used more than once; each must be unique.`,
    });
  }
}
