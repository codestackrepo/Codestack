import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { ALL_MIGRATIONS } from '../../test/utils/all-migrations';

/**
 * #101 — drift guard for the e2e schema.
 *
 * `test-app.ts` lists every migration STATICALLY (no glob) so ts-jest treats them
 * like any other module. The cost is that adding a migration and forgetting the
 * list is invisible: the suite boots happily against a stale schema and the first
 * symptom is a 42703 from an entity column no test mentions. That is exactly how
 * the list came to stop at `AddGamification1785300000000`, nine migrations behind.
 *
 * This is a UNIT spec, deliberately: CI runs `pnpm test`, never `test:e2e`
 * (Docker), so a guard living in the e2e suite would never fire on a PR. It
 * imports `test/utils/all-migrations.ts` rather than `test-app.ts` for the same
 * reason — `test-app.ts` pulls in testcontainers, which needs the e2e setup file's
 * polyfills and throws `ReferenceError: File is not defined` under unit jest.
 *
 * It compares CLASS NAMES from the exported array against the class names parsed
 * out of the directory. A substring search over `test-app.ts`'s text would pass on
 * a dangling `import` with no array entry — which is the actual failure mode,
 * since `noUnusedLocals` makes the reverse (an entry with no import) a compile
 * error rather than a silent one.
 */
const MIGRATIONS_DIR = join(__dirname, 'migrations');

interface OnDiskMigration {
  file: string;
  className: string;
  timestamp: number;
}

function readOnDiskMigrations(): OnDiskMigration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((file) => {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const className =
        /export class\s+([A-Za-z][A-Za-z0-9]*)\s+implements\s+MigrationInterface/.exec(
          content,
        )?.[1];
      if (!className) {
        throw new Error(`${file} declares no "export class X implements MigrationInterface"`);
      }
      const timestamp = Number(/^(\d{13,})-/.exec(file)?.[1]);
      if (!timestamp) throw new Error(`${file} has no leading <timestamp>- prefix`);
      return { file, className, timestamp };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

describe('e2e migration coverage', () => {
  const onDisk = readOnDiskMigrations();
  const registered = ALL_MIGRATIONS.map((m) => m.name);

  it('registers every migration on disk in ALL_MIGRATIONS', () => {
    const missing = onDisk.map((m) => m.className).filter((n) => !registered.includes(n));
    // Named assertion, not a bare length check: the failure output must say WHICH
    // migration to add, or the next person re-derives it by hand.
    expect(missing).toEqual([]);
  });

  it('registers nothing that is not on disk', () => {
    const onDiskNames = onDisk.map((m) => m.className);
    const stale = registered.filter((n) => !onDiskNames.includes(n));
    expect(stale).toEqual([]);
  });

  it('lists them in timeline order, matching the directory exactly', () => {
    // TypeORM sorts by timestamp itself, so order is not load-bearing at runtime —
    // but a list that reads in a different order than the directory is how an
    // entry gets duplicated or dropped during a rebase.
    expect(registered).toEqual(onDisk.map((m) => m.className));
  });

  it('agrees with each filename timestamp (guards a copy-paste class rename)', () => {
    for (const { file, className, timestamp } of onDisk) {
      expect(className.endsWith(String(timestamp))).toBe(true);
      expect(file.startsWith(`${timestamp}-`)).toBe(true);
    }
  });
});
