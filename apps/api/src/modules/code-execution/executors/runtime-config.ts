import { Language } from '../../../common/enums/language.enum';

export interface LanguageRuntime {
  /** Piston language identifier. */
  pistonLanguage: string;
  /** Piston runtime version. */
  version: string;
  /** Source filename sent to Piston. */
  mainFilename: string;
  /** Whether the language has a distinct compile stage (affects verdicts). */
  compiled: boolean;
}

/**
 * Static per-language Piston runtime facts. Versions come from config at
 * runtime; this shape is the language→(piston id, filename) mapping preserved
 * from the original platform.
 */
export const LANGUAGE_RUNTIMES: Record<Language, Omit<LanguageRuntime, 'version'>> = {
  [Language.PYTHON]: { pistonLanguage: 'python', mainFilename: 'main.py', compiled: false },
  [Language.JAVASCRIPT]: {
    pistonLanguage: 'javascript',
    mainFilename: 'script.js',
    compiled: false,
  },
  [Language.JAVA]: { pistonLanguage: 'java', mainFilename: 'Main.java', compiled: true },
  [Language.CPP]: { pistonLanguage: 'cpp', mainFilename: 'main.cpp', compiled: true },
};
