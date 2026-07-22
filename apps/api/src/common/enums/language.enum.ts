/**
 * Programming languages supported by the judge.
 * Values are stable API/DB strings (kept identical to the original platform).
 */
export enum Language {
  PYTHON = 'python',
  JAVASCRIPT = 'javascript',
  JAVA = 'java',
  CPP = 'cpp',
}

export const LANGUAGES = Object.values(Language);

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as string[]).includes(value);
