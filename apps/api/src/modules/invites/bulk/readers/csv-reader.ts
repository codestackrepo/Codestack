import Papa from 'papaparse';

/**
 * Reads a CSV into a raw grid of strings — no header interpretation at all.
 *
 * `header: false` is deliberate and load-bearing. With `header: true` papaparse
 * builds an object per row keyed by column name, so two columns that normalize to
 * the same key (`Email` and `E-Mail`, say) COLLAPSE silently: the second
 * overwrites the first and the duplicate-column error the parser promises becomes
 * undetectable. Reading the grid and mapping headers ourselves keeps that
 * detectable.
 *
 * `skipEmptyLines: 'greedy'` drops rows that are entirely empty or whitespace —
 * the trailing newline every spreadsheet export leaves behind would otherwise be
 * a `missing_email` error on the last row of every upload.
 */
export function readCsvGrid(
  buffer: Buffer,
  maxRows: number,
): { grid: string[][]; truncated: boolean } {
  // Strip a UTF-8 BOM. Excel writes one, and left in place it becomes part of the
  // first header cell, so `email` stops matching and every row errors.
  const text = buffer.toString('utf8').replace(/^﻿/, '');

  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
    // Papa's own transform would run before we can see the raw cell; we trim in
    // the parser so CSV and XLSX go through identical coercion.
  });

  const grid = (parsed.data ?? []).filter((row) => Array.isArray(row));
  // maxRows counts DATA rows, so the cap is maxRows + 1 including the header.
  const limit = maxRows + 1;
  return { grid: grid.slice(0, limit), truncated: grid.length > limit };
}
