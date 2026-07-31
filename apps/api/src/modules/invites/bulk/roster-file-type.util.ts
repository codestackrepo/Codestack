import { BadRequestException } from '@nestjs/common';
import { hasNullByte, isOle2, isZip } from '../../../common/files/magic-bytes.util';

export type RosterFileType = 'csv' | 'xlsx';

/**
 * Decides how to parse a roster upload — by MAGIC BYTES, never by the filename
 * or the client-supplied mimetype.
 *
 * Both of those are attacker-controlled and routinely wrong even from honest
 * clients: Excel on Windows sends `application/vnd.ms-excel` for a `.csv`, and a
 * user who renames `roster.xlsx` to `roster.csv` gets a ZIP with a `.csv` name.
 * The extension/mimetype check in the controller's `fileFilter` is a cheap early
 * reject; THIS is the authoritative one.
 */
export function detectRosterFileType(buffer: Buffer): RosterFileType {
  // A ZIP container. `.xlsx` is the only ZIP the roster path accepts, and magic
  // beats a `.csv` filename.
  if (isZip(buffer)) return 'xlsx';

  // Legacy `.xls` (BIFF8, an OLE2 compound file). Detected only to reject it with
  // instructions, because parsing it would mean the npm `xlsx` package — frozen
  // at 0.18.5 with two unpatchable advisories, CDN-only thereafter, which breaks
  // `pnpm install --frozen-lockfile`. Deliberate, signed-off scope call.
  if (isOle2(buffer)) {
    throw new BadRequestException({
      reason: 'unsupported_file_type',
      detected: 'xls',
      message:
        'Legacy .xls files are not supported. Open the file in Excel and choose ' +
        'File > Save As > Excel Workbook (.xlsx), then upload it again.',
    });
  }

  // Anything binary that is neither ZIP nor OLE. Without this, a PDF parses as
  // UTF-8 into thousands of garbage "rows" and the admin gets a wall of
  // invalid_email errors instead of "this is not a spreadsheet".
  if (hasNullByte(buffer)) {
    throw new BadRequestException({
      reason: 'unsupported_file_type',
      detected: 'binary',
      message: 'That file is not a CSV or Excel workbook. Upload a .csv or .xlsx file.',
    });
  }

  return 'csv';
}
