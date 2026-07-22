import { IoSpec } from '../../llm/schemas/generated-problem.schema';

/**
 * `JSON.parse`/`JSON.stringify` cover the entire bounded io type set, so this
 * driver is fully generic over io_spec — no per-type branching needed.
 */
export function javascriptDriver(functionName: string, ioSpec: IoSpec): string {
  const argNames = ioSpec.params.map((_, i) => `__arg${i}`);
  const reads = argNames.map((name, i) => `const ${name} = JSON.parse(__lines[${i}]);`).join('\n');

  return [
    "const __lines = require('fs').readFileSync(0, 'utf8').split('\\n');",
    '',
    '{{user_code}}',
    '',
    reads,
    `const __result = ${functionName}(${argNames.join(', ')});`,
    'console.log(JSON.stringify(__result));',
    '',
  ].join('\n');
}
