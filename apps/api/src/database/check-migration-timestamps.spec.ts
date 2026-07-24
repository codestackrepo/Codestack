import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { findTimestampConflicts } from './check-migration-timestamps';

describe('findTimestampConflicts', () => {
  it('reports no conflicts for a clean set', () => {
    expect(
      findTimestampConflicts([
        { file: '1785400000000-A.ts', content: 'export class A1785400000000 {}' },
        { file: '1785410000000-B.ts', content: `export class B1785410000000 { name = 'B1785410000000'; }` },
      ]),
    ).toEqual([]);
  });

  it('detects a duplicate timestamp across two migrations', () => {
    const conflicts = findTimestampConflicts([
      { file: '1785400000000-A.ts', content: 'export class A1785400000000 {}' },
      { file: '1785400000000-B.ts', content: 'export class B1785400000000 {}' },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('duplicate');
    expect(conflicts[0].files).toEqual(['1785400000000-A.ts', '1785400000000-B.ts']);
  });

  it('detects a filename/classname timestamp mismatch', () => {
    const conflicts = findTimestampConflicts([
      { file: '1785400000000-A.ts', content: 'export class A1785409999999 {}' },
    ]);
    expect(conflicts.some((c) => c.type === 'mismatch')).toBe(true);
  });
});

describe('the real migrations directory', () => {
  it('has unique, consistent timestamps (the #61 guard)', () => {
    const dir = join(__dirname, 'migrations');
    const entries = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .map((file) => ({ file, content: readFileSync(join(dir, file), 'utf8') }));
    expect(entries.length).toBeGreaterThan(0);
    expect(findTimestampConflicts(entries)).toEqual([]);
  });
});
