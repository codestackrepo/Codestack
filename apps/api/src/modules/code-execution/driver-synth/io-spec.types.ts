/**
 * The bounded I/O type set that every generated/synthesized judge driver is
 * built from. These are the canonical, dependency-free definitions used by the
 * driver synthesizer, its codec, and its type-mapping helpers.
 *
 * Historically these types were `z.infer`red from the AI module's Zod schema
 * (`ai/llm/schemas/generated-problem.schema.ts`). driver-synth was lifted out of
 * the AI module (M0 — "Disable & hide AI + Billing") so the deterministic
 * synthesizer survives AI being disabled; the types moved with it and now live
 * here, at the synthesizer's home, so nothing in code-execution depends on the
 * (disabled) AI module. The AI schema's `z.infer` output remains structurally
 * identical, and the materializer call site type-checks the two against each
 * other — so the Zod contract and these hand-authored types cannot silently drift.
 *
 * The set is intentionally small and non-recursive beyond one level (primitive |
 * array-of-primitive | matrix-of-primitive), which keeps every per-language
 * (de)serializer finite.
 */
export type IoPrimitive = 'int' | 'long' | 'double' | 'string' | 'bool';

export type IoType = IoPrimitive | { array: IoPrimitive } | { matrix: IoPrimitive };

export interface IoParam {
  name: string;
  type: IoType;
}

export interface IoSpec {
  params: IoParam[];
  returns: IoType;
}
