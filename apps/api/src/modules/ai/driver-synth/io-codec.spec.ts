import { IoSpec } from '../llm/schemas/generated-problem.schema';
import { encodeExpectedOutput, encodeStdin, IoArityError } from './io-codec';

const ioSpec: IoSpec = {
  params: [
    { name: 'nums', type: { array: 'int' } },
    { name: 'label', type: 'string' },
  ],
  returns: 'bool',
};

describe('io-codec', () => {
  it('encodes one JSON value per line, in param order', () => {
    const stdin = encodeStdin(ioSpec, [[1, 2, 3], 'hello']);
    expect(stdin).toBe('[1,2,3]\n"hello"\n');
  });

  it('throws IoArityError when the input count does not match io_spec.params', () => {
    expect(() => encodeStdin(ioSpec, [[1, 2, 3]])).toThrow(IoArityError);
    expect(() => encodeStdin(ioSpec, [[1, 2, 3], 'a', 'extra'])).toThrow(IoArityError);
  });

  it('encodes the expected output as a single JSON line', () => {
    expect(encodeExpectedOutput(true)).toBe('true');
    expect(encodeExpectedOutput([1, 2, 3])).toBe('[1,2,3]');
    expect(encodeExpectedOutput('hi')).toBe('"hi"');
  });
});
