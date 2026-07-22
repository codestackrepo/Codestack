import { useCallback, useState } from 'react';
import type { Language } from '@/types/common';

function storageKey(assignmentProblemId: string, language: Language): string {
  return `codestack:code:${assignmentProblemId}:${language}`;
}

/** Persists the editor's contents per problem+language, so switching
 * languages or navigating away and back doesn't lose in-progress work. */
export function usePersistedCode(
  assignmentProblemId: string,
  language: Language,
  starterCode: string,
) {
  const key = storageKey(assignmentProblemId, language);
  const [loadedKey, setLoadedKey] = useState(key);
  const [code, setCode] = useState(() => localStorage.getItem(key) ?? starterCode);

  // Re-derive during render when switching language/problem (not on every
  // starterCode identity change — it's derived fresh from the bootstrap
  // query each render) instead of via an effect + setState.
  if (key !== loadedKey) {
    setLoadedKey(key);
    setCode(localStorage.getItem(key) ?? starterCode);
  }

  const updateCode = useCallback(
    (next: string) => {
      setCode(next);
      localStorage.setItem(key, next);
    },
    [key],
  );

  return [code, updateCode] as const;
}
