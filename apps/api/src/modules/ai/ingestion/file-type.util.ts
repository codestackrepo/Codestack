import { extname } from 'path';
import { isZip } from '../../../common/files/magic-bytes.util';
import { GenerationSourceType } from '../enums/ai.enums';

export class UnsupportedFileTypeError extends Error {
  constructor(filename: string) {
    super(`Unsupported or unrecognized file type: ${filename}`);
    this.name = 'UnsupportedFileTypeError';
  }
}

/**
 * Classifies the upload by magic bytes, never by the client-supplied MIME
 * type (which is attacker-controlled and routinely wrong). The file
 * extension is only consulted to disambiguate a bare ZIP container (used by
 * both .docx and plain .zip) and to tell .txt from .md, both of which are
 * indistinguishable at the byte level.
 */
export function detectSourceType(buffer: Buffer, filename: string): GenerationSourceType {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return GenerationSourceType.PDF;
  }

  // Shared with the roster upload guard (#106) — one predicate, so a fix to
  // either path fixes both.
  const zip = isZip(buffer);
  const ext = extname(filename).toLowerCase();

  if (zip && ext === '.docx') {
    return GenerationSourceType.DOCX;
  }
  if (!zip && ext === '.md') {
    return GenerationSourceType.MD;
  }
  if (!zip && (ext === '.txt' || ext === '')) {
    return GenerationSourceType.TXT;
  }
  throw new UnsupportedFileTypeError(filename);
}
