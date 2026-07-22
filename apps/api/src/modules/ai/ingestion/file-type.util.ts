import { extname } from 'path';
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

  const isZip =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
  const ext = extname(filename).toLowerCase();

  if (isZip && ext === '.docx') {
    return GenerationSourceType.DOCX;
  }
  if (!isZip && ext === '.md') {
    return GenerationSourceType.MD;
  }
  if (!isZip && (ext === '.txt' || ext === '')) {
    return GenerationSourceType.TXT;
  }
  throw new UnsupportedFileTypeError(filename);
}
