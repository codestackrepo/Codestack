import ExcelJS from 'exceljs';

export interface XlsxGrid {
  grid: string[][];
  truncated: boolean;
  extraWorksheetsIgnored: string[];
}

/**
 * Reads the FIRST worksheet of an `.xlsx` into a raw grid of strings.
 *
 * Uses `workbook.xlsx.load()`, NOT the streaming `WorkbookReader`, and that is a
 * deliberate reversal of the obvious choice.
 *
 * The streaming reader parses zip entries in the order they physically appear,
 * and throws `Cannot read properties of undefined (reading 'sheets')` whenever a
 * worksheet entry precedes `workbook.xml` — it needs the sheet list that entry
 * populates. That ordering depends on the compressed byte layout, which depends
 * on the workbook's own embedded timestamps, so the SAME logical spreadsheet
 * fails intermittently between runs. Draining every worksheet (required in its
 * own right — skipping one leaves the zip stream mid-entry) fixes a related but
 * different failure and not this one.
 *
 * The memory argument for streaming is already covered elsewhere: the upload is
 * capped at 2 MB by multer before this is ever called, and the row cap below
 * bounds what is retained. A deterministic reader is worth more here than a
 * marginal peak-heap saving on a file that cannot exceed two megabytes.
 */
export async function readXlsxGrid(buffer: Buffer, maxRows: number): Promise<XlsxGrid> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const [first, ...rest] = workbook.worksheets;
  if (!first) return { grid: [], truncated: false, extraWorksheetsIgnored: [] };

  // Named, not dropped silently: an admin whose roster is on "Sheet2" must be
  // told why the upload looked empty.
  const extraWorksheetsIgnored = rest.map((ws, i) => ws.name ?? `Sheet${i + 2}`);

  const grid: string[][] = [];
  let truncated = false;
  // maxRows counts DATA rows; the header occupies one more.
  const limit = maxRows + 1;

  first.eachRow({ includeEmpty: false }, (row) => {
    if (grid.length >= limit) {
      truncated = true;
      return;
    }
    grid.push(readRow(row));
  });

  return { grid, truncated, extraWorksheetsIgnored };
}

/**
 * Flattens one row to strings.
 *
 * `row.values` is 1-INDEXED with a hole at [0] — an exceljs quirk that silently
 * shifts every column by one if treated as a normal array.
 */
function readRow(row: ExcelJS.Row): string[] {
  const values = row.values as unknown[];
  const cells: string[] = [];
  for (let i = 1; i < values.length; i += 1) {
    cells.push(coerceCell(values[i]));
  }
  return cells;
}

/**
 * Coerces one cell to a string.
 *
 * A worksheet cell is not a string. Depending on how it was authored it arrives
 * as a number (a roster of numeric student ids), a Date (Excel helpfully
 * "recognising" something), a formula result, rich text with per-run formatting
 * (a pasted address that kept its styling), or a hyperlink object (Excel
 * autolinks anything with an @). Missing any of these shape reads as an empty
 * cell and the row errors as `missing_email` with no explanation the admin can
 * act on.
 */
export function coerceCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return stripMailto(value.trim());
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();

  const obj = value as Record<string, unknown>;

  // Hyperlink cell: prefer the visible text, fall back to the target. Excel
  // autolinks addresses, so `ada@x.dev` becomes {text, hyperlink:'mailto:ada@x.dev'}.
  if (typeof obj.text === 'string') return stripMailto(obj.text.trim());
  if (typeof obj.hyperlink === 'string') return stripMailto(obj.hyperlink.trim());

  // Rich text: concatenate the runs, discarding formatting.
  if (Array.isArray(obj.richText)) {
    return stripMailto(
      (obj.richText as { text?: string }[])
        .map((run) => run.text ?? '')
        .join('')
        .trim(),
    );
  }

  // Formula cell: the cached result is what the admin sees on screen.
  if ('result' in obj) return coerceCell(obj.result);

  return '';
}

/** Excel autolinks addresses; the `mailto:` prefix is Excel's, not the admin's. */
function stripMailto(value: string): string {
  return value.replace(/^mailto:/i, '');
}
