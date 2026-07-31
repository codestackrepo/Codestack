import { BadRequestException } from '@nestjs/common';
import { GOLDEN_ROWS, makeXlsx } from './__fixtures__/make-xlsx';
import { coerceCell } from './readers/xlsx-reader';
import { mapHeaders, normalizeHeader, parseRoster } from './roster-parser';
import { RosterReason } from './roster.types';

const csv = (text: string): Buffer => Buffer.from(text, 'utf8');

describe('normalizeHeader', () => {
  it('folds every separator, case and surrounding whitespace to one key', () => {
    for (const raw of ['First Name', 'first_name', 'FIRST-NAME', ' first.name ', 'First   Name']) {
      expect(normalizeHeader(raw)).toBe('first name');
    }
  });

  it('strips a UTF-8 BOM — Excel writes one and it otherwise joins the first header', () => {
    expect(normalizeHeader('﻿email')).toBe('email');
  });
});

describe('mapHeaders', () => {
  it('accepts first/last name columns', () => {
    expect(mapHeaders(['email', 'first name', 'last name'])).toMatchObject({ email: 0 });
  });

  it('accepts a single name column instead', () => {
    expect(mapHeaders(['email', 'name'])).toMatchObject({ email: 0, name: 1 });
  });

  // Exactly what `header: false` in the CSV reader exists to keep visible. With
  // papaparse's header mode the second column would overwrite the first and this
  // would be undetectable.
  it('rejects two columns that normalize to the same field', () => {
    expect(() => mapHeaders(['Email', 'E-Mail', 'name'])).toThrow(BadRequestException);
  });

  it('rejects a file with no email column rather than guessing', () => {
    expect(() => mapHeaders(['name', 'student id'])).toThrow(BadRequestException);
  });

  it('rejects a file with no name column at all', () => {
    expect(() => mapHeaders(['email'])).toThrow(BadRequestException);
  });

  it('reports unknown columns instead of failing on them', () => {
    expect(mapHeaders(['email', 'name', 'Cohort']).unknown).toEqual(['Cohort']);
  });
});

describe('parseRoster — CSV', () => {
  it('parses rows and numbers them as Excel does, header included', async () => {
    const out = await parseRoster(
      csv('email,first name,last name\nada@x.dev,Ada,Lovelace\ngrace@x.dev,Grace,Hopper\n'),
    );
    expect(out.rows).toHaveLength(2);
    // The first DATA row is 2 — the number in Excel's gutter. Off-by-one here
    // makes every error message point at the wrong line.
    expect(out.rows[0]).toMatchObject({ rowNumber: 2, email: 'ada@x.dev', firstName: 'Ada' });
    expect(out.rows[1].rowNumber).toBe(3);
  });

  it('lowercases addresses so the classifier can key on them', async () => {
    const out = await parseRoster(csv('email,name\nADA@X.DEV,Ada Lovelace\n'));
    expect(out.rows[0].email).toBe('ada@x.dev');
  });

  it('splits a single name column on the LAST space', async () => {
    const out = await parseRoster(csv('email,name\na@x.dev,Ada King Lovelace\n'));
    expect(out.rows[0]).toMatchObject({ firstName: 'Ada King', lastName: 'Lovelace' });
  });

  it('strips a BOM so the first header still matches', async () => {
    const out = await parseRoster(csv('﻿email,name\na@x.dev,Ada L\n'));
    expect(out.rows).toHaveLength(1);
  });

  // Every spreadsheet export ends with one. Reporting it as missing_email would
  // put a spurious error on every single upload.
  it('ignores a trailing blank line rather than erroring on it', async () => {
    const out = await parseRoster(csv('email,name\na@x.dev,Ada L\n\n'));
    expect(out.rows).toHaveLength(1);
    expect(out.errors).toHaveLength(0);
  });

  it('collects bad rows without aborting the file', async () => {
    const out = await parseRoster(
      csv('email,name\ngood@x.dev,Good One\nnot-an-email,Bad One\n,No Email\n'),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.errors.map((e) => e.reason)).toEqual([
      RosterReason.INVALID_EMAIL,
      RosterReason.MISSING_EMAIL,
    ]);
    expect(out.errors[0].rowNumber).toBe(3);
  });

  it('errors a row with an address but no name', async () => {
    const out = await parseRoster(csv('email,name\na@x.dev,\n'));
    expect(out.errors[0].reason).toBe(RosterReason.MISSING_NAME);
  });

  // Silently discarding `role: admin` would let an admin believe they had minted
  // admins — the file said so and nothing contradicted it.
  it('REJECTS a role column value other than student, rather than ignoring it', async () => {
    const out = await parseRoster(csv('email,name,role\na@x.dev,Ada L,admin\n'));
    expect(out.rows).toHaveLength(0);
    expect(out.errors[0].reason).toBe(RosterReason.ROLE_NOT_ALLOWED);
    expect(out.errors[0].message).toContain('students');
  });

  it('accepts a blank or explicitly-student role column', async () => {
    const out = await parseRoster(csv('email,name,role\na@x.dev,Ada L,\nb@x.dev,Bo B,student\n'));
    expect(out.rows).toHaveLength(2);
  });

  it('caps at maxRows and flags the truncation', async () => {
    const body = Array.from({ length: 10 }, (_, i) => `u${i}@x.dev,User ${i}`).join('\n');
    const out = await parseRoster(csv(`email,name\n${body}\n`), 4);
    expect(out.rows).toHaveLength(4);
    expect(out.warnings.truncated).toBe(true);
  });

  it('rejects an empty file', async () => {
    await expect(parseRoster(csv(''))).rejects.toThrow(BadRequestException);
  });
});

describe('parseRoster — XLSX', () => {
  let golden: Buffer;

  beforeAll(async () => {
    golden = await makeXlsx([{ name: 'Roster', rows: GOLDEN_ROWS }]);
  });

  it('detects xlsx by magic bytes, not by name, and parses it', async () => {
    const out = await parseRoster(golden);
    expect(out.rows.map((r) => r.email)).toContain('new.student@x.dev');
    expect(out.errors.map((e) => e.reason)).toContain(RosterReason.INVALID_EMAIL);
  });

  it('reads only the first worksheet and names the rest', async () => {
    const twoSheets = await makeXlsx([
      {
        name: 'Roster',
        rows: [
          ['email', 'name'],
          ['a@x.dev', 'Ada L'],
        ],
      },
      { name: 'Notes', rows: [['ignore', 'me']] },
    ]);
    const out = await parseRoster(twoSheets);
    expect(out.rows).toHaveLength(1);
    expect(out.warnings.extraWorksheetsIgnored).toEqual(['Notes']);
  });

  it('handles a numeric cell without dropping the row', async () => {
    const book = await makeXlsx([
      {
        name: 'R',
        rows: [
          ['email', 'first name', 'last name'],
          ['a@x.dev', 12345, 'Student'],
        ],
      },
    ]);
    const out = await parseRoster(book);
    expect(out.rows[0].firstName).toBe('12345');
  });
});

describe('coerceCell', () => {
  it('passes strings through, trimmed', () => {
    expect(coerceCell('  ada@x.dev ')).toBe('ada@x.dev');
  });

  it('renders a numeric cell — a roster of numeric ids must not read as empty', () => {
    expect(coerceCell(12345)).toBe('12345');
  });

  // Excel autolinks anything with an @, so this is the SHAPE most addresses
  // arrive in from a hand-authored workbook.
  it('unwraps a hyperlink cell and strips the mailto Excel added', () => {
    expect(coerceCell({ text: 'ada@x.dev', hyperlink: 'mailto:ada@x.dev' })).toBe('ada@x.dev');
    expect(coerceCell({ hyperlink: 'mailto:ada@x.dev' })).toBe('ada@x.dev');
  });

  it('flattens rich text from a pasted, styled address', () => {
    expect(coerceCell({ richText: [{ text: 'ada@' }, { text: 'x.dev' }] })).toBe('ada@x.dev');
  });

  it('takes a formula cell’s cached result — what the admin sees on screen', () => {
    expect(coerceCell({ formula: 'CONCAT(A1,B1)', result: 'ada@x.dev' })).toBe('ada@x.dev');
  });

  it('renders null and undefined as empty, never as the string "null"', () => {
    expect(coerceCell(null)).toBe('');
    expect(coerceCell(undefined)).toBe('');
  });
});
