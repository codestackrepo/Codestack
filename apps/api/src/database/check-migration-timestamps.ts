/* eslint-disable no-console */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * #61 — Guards the single monotonic migration timeline. TypeORM orders and
 * dedupes migrations by their numeric timestamp; two migrations sharing a
 * timestamp run in nondeterministic order (and a transaction=false one can't
 * safely interleave). This fails the build on either a DUPLICATE timestamp or a
 * filename/classname timestamp MISMATCH (a common copy-paste slip).
 *
 * Pure `findTimestampConflicts` is unit-tested; the `require.main` block is the
 * CLI (`pnpm --filter @codestack/api check:migrations`) and is skipped on import.
 */
export interface MigrationEntry {
  file: string;
  content: string;
}

export interface TimestampConflict {
  type: 'duplicate' | 'mismatch' | 'unparseable';
  files: string[];
  detail: string;
}

export function findTimestampConflicts(entries: MigrationEntry[]): TimestampConflict[] {
  const conflicts: TimestampConflict[] = [];
  const byTimestamp = new Map<string, string[]>();

  for (const { file, content } of entries) {
    const fileTs = file.match(/^(\d{13,})-/)?.[1];
    if (!fileTs) {
      conflicts.push({
        type: 'unparseable',
        files: [file],
        detail: `filename has no leading <timestamp>- prefix`,
      });
      continue;
    }
    byTimestamp.set(fileTs, [...(byTimestamp.get(fileTs) ?? []), file]);

    // The class name (…Name<ts>) and/or the `name = '…<ts>'` property must agree.
    const classTs = content.match(/export class\s+[A-Za-z][A-Za-z0-9]*?(\d{13,})\b/)?.[1];
    const nameTs = content.match(/name\s*=\s*['"][A-Za-z][A-Za-z0-9]*?(\d{13,})['"]/)?.[1];
    for (const [label, ts] of [
      ['class name', classTs],
      ['name property', nameTs],
    ] as const) {
      if (ts && ts !== fileTs) {
        conflicts.push({
          type: 'mismatch',
          files: [file],
          detail: `filename timestamp ${fileTs} != ${label} timestamp ${ts}`,
        });
      }
    }
  }

  for (const [ts, files] of byTimestamp) {
    if (files.length > 1) {
      conflicts.push({
        type: 'duplicate',
        files: files.sort(),
        detail: `timestamp ${ts} is used by ${files.length} migrations`,
      });
    }
  }
  return conflicts;
}

function readMigrations(dir: string): MigrationEntry[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((file) => ({ file, content: readFileSync(join(dir, file), 'utf8') }));
}

if (require.main === module) {
  const dir = join(__dirname, 'migrations');
  const entries = readMigrations(dir);
  const conflicts = findTimestampConflicts(entries);
  if (conflicts.length) {
    console.error(`✖ migration timestamp check failed (${conflicts.length}):`);
    for (const c of conflicts)
      console.error(`  - [${c.type}] ${c.detail}  {${c.files.join(', ')}}`);
    process.exit(1);
  }
  console.log(`✔ ${entries.length} migrations — all timestamps unique and consistent`);
}
