import ExcelJS from 'exceljs';

/**
 * Builds an .xlsx in memory for the reader specs.
 *
 * Generated in `beforeAll` rather than committed: a binary fixture cannot be
 * reviewed in a diff, and a regenerated one shows up as an opaque blob change
 * that nobody can evaluate. Fixtures also live INSIDE src/ because
 * `jest.config.js` sets `rootDir: 'src'`.
 */
export async function makeXlsx(
  sheets: { name: string; rows: (string | number | null)[][] }[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) ws.addRow(row);
  }
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** The canonical roster used by the golden-fixture specs. */
export const GOLDEN_ROWS: (string | number | null)[][] = [
  ['Email', 'First Name', 'Last Name'],
  ['new.student@x.dev', 'New', 'Student'],
  ['NEW.STUDENT@X.DEV', 'Dupe', 'Row'], // duplicate after normalization
  ['member@x.dev', 'Already', 'Member'],
  ['inactive.member@x.dev', 'Inactive', 'Member'],
  ['unassigned@x.dev', 'Unassigned', 'Student'],
  ['other.org@x.dev', 'Other', 'Org'],
  ['pending@x.dev', 'Pending', 'Invite'],
  ['not-an-email', 'Bad', 'Address'],
];
