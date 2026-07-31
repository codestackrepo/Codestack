/**
 * Container sniffing shared by every upload path.
 *
 * Extracted from `modules/ai/ingestion/file-type.util.ts` rather than forked:
 * two copies of a magic-byte predicate drift, and the one that drifts is the one
 * that stops rejecting something.
 */

/**
 * True for a ZIP container. `.xlsx` and `.docx` are both ZIPs, so this
 * distinguishes the CONTAINER, never the format — the caller disambiguates.
 *
 * The three third bytes are ZIP's local-file-header (03), empty-archive (05) and
 * spanned-archive (07) variants. An `.xlsx` in the wild is always 03, but the
 * others are still ZIPs and must not be mistaken for text.
 */
export function isZip(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 && // 'P'
    buffer[1] === 0x4b && // 'K'
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  );
}

/**
 * True for an OLE2 Compound File — the legacy `.xls` (BIFF8) container, and also
 * `.doc`/`.ppt`.
 *
 * Detected purely so it can be REJECTED with actionable guidance. Reading it
 * would mean the npm `xlsx` package, frozen at 0.18.5 with two unpatchable
 * advisories and CDN-only thereafter, which breaks `pnpm install
 * --frozen-lockfile`.
 */
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export function isOle2(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(OLE_SIGNATURE);
}

/**
 * True when the head of the buffer contains a NUL byte.
 *
 * A text format never does, so this catches binaries that are neither ZIP nor
 * OLE — a PDF, an image, a compiled object — before a parser tries to read
 * megabytes of it as UTF-8 and produces thousands of nonsense "rows".
 */
export function hasNullByte(buffer: Buffer, sampleBytes = 8192): boolean {
  return buffer.subarray(0, Math.min(buffer.length, sampleBytes)).includes(0x00);
}
