import { BadRequestException } from '@nestjs/common';
import { detectRosterFileType } from './roster-file-type.util';

const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const csv = Buffer.from('email,name\na@x.dev,Ada L\n', 'utf8');

describe('detectRosterFileType', () => {
  it('reads plain text as csv', () => {
    expect(detectRosterFileType(csv)).toBe('csv');
  });

  // The whole point of magic bytes: a renamed .xlsx must not be fed to the CSV
  // parser, which would produce a screenful of binary garbage "rows".
  it('reads a ZIP as xlsx even when the filename said .csv', () => {
    expect(detectRosterFileType(zip)).toBe('xlsx');
  });

  // Detected only to REJECT: reading it means the npm `xlsx` package, frozen at
  // 0.18.5 with two unpatchable advisories and CDN-only after that, which breaks
  // `pnpm install --frozen-lockfile`.
  it('rejects legacy .xls with Save-As guidance, not a generic parse error', () => {
    try {
      detectRosterFileType(ole);
      throw new Error('expected a throw');
    } catch (err) {
      const body = (err as BadRequestException).getResponse() as Record<string, string>;
      expect(body).toMatchObject({ reason: 'unsupported_file_type', detected: 'xls' });
      expect(body.message).toContain('Save As');
      expect(body.message).toContain('.xlsx');
    }
  });

  it('rejects a binary that is neither ZIP nor OLE', () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from([0x00, 0x01, 0x02])]);
    try {
      detectRosterFileType(pdf);
      throw new Error('expected a throw');
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toMatchObject({ detected: 'binary' });
    }
  });

  it('does not mistake UTF-8 accents for binary', () => {
    expect(detectRosterFileType(Buffer.from('email,name\na@x.dev,Zoë Müller\n', 'utf8'))).toBe(
      'csv',
    );
  });

  it('tolerates a buffer shorter than the signatures', () => {
    expect(detectRosterFileType(Buffer.from('a', 'utf8'))).toBe('csv');
  });
});
