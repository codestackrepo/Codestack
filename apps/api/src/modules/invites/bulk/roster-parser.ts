import { BadRequestException } from '@nestjs/common';
import { readCsvGrid } from './readers/csv-reader';
import { readXlsxGrid } from './readers/xlsx-reader';
import { detectRosterFileType } from './roster-file-type.util';
import { ParsedRoster, ParsedRosterRow, RosterReason, RosterRowError } from './roster.types';

/** Hard cap on data rows. Bounds both memory and the staged Redis payload. */
export const MAX_ROSTER_ROWS = 2000;

/**
 * Accepted spellings per logical column.
 *
 * Compared AFTER normalization (BOM strip, trim, lowercase, any run of
 * whitespace/underscore/dot/hyphen collapsed to one space), so `First_Name`,
 * `first-name` and ` FIRST NAME ` are one key and only the canonical spellings
 * need listing.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  email: ['email', 'email address', 'e mail', 'mail', 'student email'],
  firstName: ['first name', 'firstname', 'given name', 'forename'],
  lastName: ['last name', 'lastname', 'surname', 'family name'],
  name: ['name', 'full name', 'student name', 'display name'],
  role: ['role'],
};

/** Deliberately permissive — the mail server is the real validator. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalizes a header cell so alias matching is spelling-insensitive. */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/^﻿/, '') // BOM, if the reader did not already strip it
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, ' ')
    .trim();
}

interface ColumnMap {
  email: number;
  firstName?: number;
  lastName?: number;
  name?: number;
  role?: number;
  unknown: string[];
}

/**
 * Maps the header row to column indexes.
 *
 * Throws rather than degrading: a roster whose email column we cannot find is not
 * a roster, and guessing would silently invite the wrong people.
 */
export function mapHeaders(header: string[]): ColumnMap {
  const seen = new Map<string, number>();
  const unknown: string[] = [];
  const duplicates: string[] = [];

  header.forEach((raw, index) => {
    const normalized = normalizeHeader(raw);
    if (!normalized) return;

    const logical = Object.entries(HEADER_ALIASES).find(([, aliases]) =>
      aliases.includes(normalized),
    )?.[0];

    if (!logical) {
      unknown.push(raw.trim());
      return;
    }
    // Two columns mapping to one logical field is ambiguous, and picking either
    // one silently mails the wrong set of people. This is exactly the case
    // `header: false` in the CSV reader exists to keep visible.
    if (seen.has(logical)) duplicates.push(logical);
    else seen.set(logical, index);
  });

  if (duplicates.length) {
    throw new BadRequestException({
      reason: 'duplicate_columns',
      columns: duplicates,
      message: `The file has more than one ${duplicates.join(', ')} column. Remove the extra one and upload again.`,
    });
  }

  const email = seen.get('email');
  if (email === undefined) {
    throw new BadRequestException({
      reason: 'missing_email_column',
      message:
        'The file needs an "email" column. Download the template to see the expected format.',
    });
  }

  const hasFirst = seen.has('firstName');
  const hasLast = seen.has('lastName');
  const hasName = seen.has('name');
  if (!hasName && !(hasFirst || hasLast)) {
    throw new BadRequestException({
      reason: 'missing_name_column',
      message: 'The file needs either a "name" column, or "first name" and "last name" columns.',
    });
  }

  return {
    email,
    firstName: seen.get('firstName'),
    lastName: seen.get('lastName'),
    name: seen.get('name'),
    role: seen.get('role'),
    unknown,
  };
}

/** Splits a single `name` column into first/last on the LAST space. */
function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { firstName: '', lastName: '' };
  const cut = trimmed.lastIndexOf(' ');
  if (cut === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, cut), lastName: trimmed.slice(cut + 1) };
}

/**
 * Parses an uploaded roster into rows and per-row errors.
 *
 * Row-level problems never abort the file — the admin gets one preview listing
 * every bad row rather than fixing them one upload at a time. Only structural
 * problems (no email column, duplicate columns, unreadable file) throw.
 */
export async function parseRoster(
  buffer: Buffer,
  maxRows = MAX_ROSTER_ROWS,
): Promise<ParsedRoster> {
  const type = detectRosterFileType(buffer); // magic bytes; throws on .xls/binary

  const { grid, truncated, extraWorksheetsIgnored } =
    type === 'xlsx'
      ? await readXlsxGrid(buffer, maxRows)
      : { ...readCsvGrid(buffer, maxRows), extraWorksheetsIgnored: [] as string[] };

  if (!grid.length) {
    throw new BadRequestException({
      reason: 'empty_file',
      message: 'That file has no rows.',
    });
  }

  const columns = mapHeaders(grid[0]);
  const rows: ParsedRosterRow[] = [];
  const errors: RosterRowError[] = [];

  for (let i = 1; i < grid.length; i += 1) {
    const cells = grid[i];
    // 1-based INCLUDING the header, so the first data row is 2 — what the admin
    // reads off Excel's gutter. Anything else makes every message point one line
    // off, which is worse than no line number.
    const rowNumber = i + 1;

    const at = (index?: number): string =>
      index === undefined ? '' : (cells[index] ?? '').toString().trim();

    const email = at(columns.email).toLowerCase();
    if (!email) {
      // A wholly blank row is skipped, not reported — trailing blanks are an
      // artifact of every spreadsheet export, not something the admin did.
      if (cells.every((c) => !c?.toString().trim())) continue;
      errors.push({
        rowNumber,
        email: null,
        reason: RosterReason.MISSING_EMAIL,
        message: 'This row has no email address.',
      });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      errors.push({
        rowNumber,
        email,
        reason: RosterReason.INVALID_EMAIL,
        message: `"${email}" is not a valid email address.`,
      });
      continue;
    }

    // Parsed and REJECTED, never applied. Silently discarding `role: admin` would
    // let an admin believe they had minted admins — the file said so and nothing
    // contradicted it. Bulk mints students only; staff onboarding is a SuperAdmin
    // operation on the single-invite path.
    const role = columns.role !== undefined ? at(columns.role).toLowerCase() : '';
    if (role && role !== 'student') {
      errors.push({
        rowNumber,
        email,
        reason: RosterReason.ROLE_NOT_ALLOWED,
        message: `Bulk upload can only invite students. Remove "${role}" from the role column, or invite that person individually.`,
      });
      continue;
    }

    let firstName = at(columns.firstName);
    let lastName = at(columns.lastName);
    if (!firstName && !lastName && columns.name !== undefined) {
      ({ firstName, lastName } = splitName(at(columns.name)));
    }

    if (!firstName && !lastName) {
      errors.push({
        rowNumber,
        email,
        reason: RosterReason.MISSING_NAME,
        message: 'This row has no name.',
      });
      continue;
    }

    rows.push({ rowNumber, email, firstName, lastName, ...(role ? { role } : {}) });
  }

  return {
    rows,
    errors,
    warnings: { extraWorksheetsIgnored, truncated, unknownColumns: columns.unknown },
  };
}
