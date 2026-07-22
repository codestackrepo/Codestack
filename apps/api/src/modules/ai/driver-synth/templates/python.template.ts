import { IoSpec } from '../../llm/schemas/generated-problem.schema';

/**
 * Python's `json` module handles the entire bounded io type set (int/long as
 * int, double as float, string, bool, and arbitrarily-nested arrays) without
 * per-type casts, so this driver is fully generic over io_spec.
 */
export function pythonDriver(functionName: string, ioSpec: IoSpec): string {
  const argNames = ioSpec.params.map((_, i) => `__arg${i}`);
  const reads = argNames.map((name) => `    ${name} = json.loads(input())`).join('\n');

  return [
    'import json',
    '',
    '{{user_code}}',
    '',
    'def __main():',
    reads,
    `    __result = ${functionName}(${argNames.join(', ')})`,
    '    print(json.dumps(__result))',
    '',
    '__main()',
    '',
  ].join('\n');
}
