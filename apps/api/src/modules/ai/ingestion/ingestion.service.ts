import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as mammoth from 'mammoth';
import { join } from 'path';
import { AiConfig } from '../../../config/configuration';
import { GenerationSourceType } from '../enums/ai.enums';
import { detectSourceType } from './file-type.util';
import { loadPdfJs } from './pdf-loader';

const MIN_TEXT_CHARS = 200;
const MAX_PDF_PAGES = 50;

export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface IngestedMaterial {
  text: string;
  sourceType: GenerationSourceType;
  /** SHA-256 of the raw upload — stored instead of the file content itself. */
  sourceRef: string;
}

/**
 * Turns an uploaded file (or raw pasted text) into plain study-material text
 * for the LLM prompt. Never persists the raw file: only a content hash is
 * kept as `sourceRef`, for dedup/audit.
 */
@Injectable()
export class IngestionService {
  private readonly ai: AiConfig;

  constructor(config: ConfigService) {
    this.ai = config.getOrThrow<AiConfig>('ai');
  }

  async ingestFile(file: UploadedFileLike): Promise<IngestedMaterial> {
    if (file.size > this.ai.maxFileBytes) {
      throw new PayloadTooLargeException(
        `File exceeds the ${this.ai.maxFileBytes}-byte upload limit`,
      );
    }

    const sourceType = detectSourceType(file.buffer, file.originalname);
    const text = await this.extract(sourceType, file.buffer);
    return this.finalize(text, sourceType, file.buffer);
  }

  async ingestPrompt(text: string): Promise<IngestedMaterial> {
    return this.finalize(text, GenerationSourceType.PROMPT, Buffer.from(text, 'utf-8'));
  }

  private finalize(text: string, sourceType: GenerationSourceType, raw: Buffer): IngestedMaterial {
    const trimmed = text.trim();
    if (trimmed.length < MIN_TEXT_CHARS) {
      throw new BadRequestException(
        `Extracted material is too short (need at least ${MIN_TEXT_CHARS} characters of usable text) — the file may be a scanned image or contain no selectable text.`,
      );
    }
    return {
      text: trimmed,
      sourceType,
      sourceRef: createHash('sha256').update(raw).digest('hex'),
    };
  }

  private async extract(type: GenerationSourceType, buffer: Buffer): Promise<string> {
    switch (type) {
      case GenerationSourceType.PDF:
        return this.extractPdf(buffer);
      case GenerationSourceType.DOCX:
        return this.extractDocx(buffer);
      case GenerationSourceType.TXT:
      case GenerationSourceType.MD:
        return buffer.toString('utf-8');
      case GenerationSourceType.PROMPT:
        return buffer.toString('utf-8');
    }
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      standardFontDataUrl:
        join(require.resolve('pdfjs-dist/package.json'), '..', 'standard_fonts') + '/',
    }).promise;

    const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
    const pages: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      pages.push(line);
    }
    return pages.join('\n\n');
  }

  private async extractDocx(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
}
