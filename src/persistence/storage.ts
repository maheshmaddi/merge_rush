/**
 * Safe localStorage access. Never throws: browsers can block storage
 * (private mode, sandboxed iframes, disabled cookies) and code holding a
 * Storage reference can still hit QuotaExceededError on write. All failures
 * degrade to "storage unavailable" so the game keeps running without saves.
 */

export interface SafeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Returns window.localStorage, or null when unavailable or access throws. */
export function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Wraps a Storage in a never-throwing facade. Probes writability first so a
 * read-only storage is detected up front. Returns null when unusable.
 */
export function createSafeStorage(raw: Storage | null | undefined): SafeStorage | null {
  if (!raw) return null;
  try {
    const probeKey = '__merge-rush-probe__';
    raw.setItem(probeKey, '1');
    raw.removeItem(probeKey);
  } catch {
    return null;
  }
  return {
    getItem(key) {
      try {
        return raw.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        raw.setItem(key, value);
      } catch {
        // Quota exceeded or blocked - dropping the save is acceptable.
      }
    },
    removeItem(key) {
      try {
        raw.removeItem(key);
      } catch {
        // Ignore.
      }
    },
  };
}

/** Convenience: the app's safe storage, or null. */
export function getSafeLocalStorage(): SafeStorage | null {
  return createSafeStorage(getLocalStorage());
}
