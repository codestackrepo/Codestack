import { DriverMergeService } from './driver-merge.service';

describe('DriverMergeService', () => {
  let merge: DriverMergeService;

  beforeEach(() => {
    merge = new DriverMergeService();
  });

  it('replaces the {{ user_code }} placeholder (spaced form)', () => {
    const result = merge.merge('before\n{{ user_code }}\nafter', 'MY_CODE');
    expect(result).toBe('before\nMY_CODE\nafter');
  });

  it('replaces the {{user_code}} placeholder (tight form)', () => {
    const result = merge.merge('before\n{{user_code}}\nafter', 'MY_CODE');
    expect(result).toBe('before\nMY_CODE\nafter');
  });

  it('replaces every occurrence of the placeholder', () => {
    const result = merge.merge('{{user_code}} and {{ user_code }}', 'X');
    expect(result).toBe('X and X');
  });

  it('runs the user code directly when the driver has no placeholder', () => {
    const result = merge.merge('', 'print(1)');
    expect(result).toBe('print(1)');
  });

  it('runs the user code directly when driverCode is only whitespace/lacks the token', () => {
    const result = merge.merge('# no placeholder here', 'print(1)');
    expect(result).toBe('print(1)');
  });

  // Injection-safety: the merge must be a single literal substitution, not a
  // template re-evaluation — student code containing template-looking syntax
  // must not be interpreted, and must not corrupt the driver structure.
  describe('injection safety', () => {
    it('treats user code containing {{ }} sequences as inert literal text', () => {
      const userCode = 'print("{{ user_code }}")'; // student code that echoes the token itself
      const result = merge.merge('{{user_code}}', userCode);
      expect(result).toBe('print("{{ user_code }}")');
    });

    it('does not re-scan substituted text for more matches (single-pass replace, no recursion)', () => {
      const driver = 'A: {{user_code}} | B: {{user_code}}';
      const userCode = 'XXX{{user_code}}YYY';
      const result = merge.merge(driver, userCode);
      // If the merge recursively re-processed its own output, the inner
      // {{user_code}} inside the substituted text would get replaced too.
      // It must not be — each placeholder is replaced exactly once.
      expect(result).toBe('A: XXX{{user_code}}YYY | B: XXX{{user_code}}YYY');
    });
  });
});
