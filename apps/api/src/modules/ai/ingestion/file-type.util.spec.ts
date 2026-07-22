import { GenerationSourceType } from '../enums/ai.enums';
import { detectSourceType, UnsupportedFileTypeError } from './file-type.util';

describe('detectSourceType', () => {
  it('detects PDF from the %PDF- magic bytes regardless of extension', () => {
    const buf = Buffer.from('%PDF-1.4\n...rest of file', 'latin1');
    expect(detectSourceType(buf, 'notes.bin')).toBe(GenerationSourceType.PDF);
  });

  it('detects DOCX from ZIP magic bytes + a .docx extension', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(detectSourceType(buf, 'notes.docx')).toBe(GenerationSourceType.DOCX);
  });

  it('rejects a ZIP-magic file whose extension is not .docx (never trusts a bare ZIP as DOCX)', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    expect(() => detectSourceType(buf, 'archive.zip')).toThrow(UnsupportedFileTypeError);
  });

  it('detects TXT and MD by extension for non-magic plain text', () => {
    const buf = Buffer.from('plain study notes', 'utf-8');
    expect(detectSourceType(buf, 'notes.txt')).toBe(GenerationSourceType.TXT);
    expect(detectSourceType(buf, 'notes.md')).toBe(GenerationSourceType.MD);
  });

  it('never trusts the extension over magic bytes — a .txt-named PDF is still classified as PDF', () => {
    const buf = Buffer.from('%PDF-1.4\n...', 'latin1');
    expect(detectSourceType(buf, 'fake.txt')).toBe(GenerationSourceType.PDF);
  });

  it('rejects an unrecognized extension with no matching magic bytes', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(() => detectSourceType(buf, 'weird.exe')).toThrow(UnsupportedFileTypeError);
  });
});
