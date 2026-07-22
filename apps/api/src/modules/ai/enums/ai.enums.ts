export enum GenerationStatus {
  QUEUED = 'queued',
  GENERATING = 'generating',
  VALIDATING = 'validating',
  READY = 'ready',
  FAILED = 'failed',
}

export enum GenerationSourceType {
  PROMPT = 'prompt',
  PDF = 'pdf',
  TXT = 'txt',
  MD = 'md',
  DOCX = 'docx',
}

export enum GeneratedProblemLinkStatus {
  VALIDATED = 'validated',
  DISCARDED = 'discarded',
  SAVED = 'saved',
}
