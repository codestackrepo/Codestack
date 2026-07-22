import { Language } from '@/types/common';

/** Human-friendly labels for the language <Select>. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  [Language.PYTHON]: 'Python',
  [Language.JAVASCRIPT]: 'JavaScript',
  [Language.JAVA]: 'Java',
  [Language.CPP]: 'C++',
};

/** Monaco language ids keyed by our Language enum. */
export const MONACO_LANGUAGE: Record<Language, string> = {
  [Language.PYTHON]: 'python',
  [Language.JAVASCRIPT]: 'javascript',
  [Language.JAVA]: 'java',
  [Language.CPP]: 'cpp',
};

/** Tiny per-language hello-world so the editor is never blank. */
export const LANGUAGE_STARTERS: Record<Language, string> = {
  [Language.PYTHON]: `print("Hello, CodeStack!")\n`,
  [Language.JAVASCRIPT]: `console.log("Hello, CodeStack!");\n`,
  [Language.JAVA]: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, CodeStack!");
    }
}
`,
  [Language.CPP]: `#include <iostream>

int main() {
    std::cout << "Hello, CodeStack!" << std::endl;
    return 0;
}
`,
};
