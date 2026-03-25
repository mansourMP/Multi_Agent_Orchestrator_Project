export const EMPYRALIS_RUNTIME_KEY_STORAGE_KEY = 'empyralis_runtime_api_key';
export const LEGACY_ORION_RUNTIME_KEY_STORAGE_KEY = 'orion_runtime_api_key';
export const RUNTIME_KEY_STORAGE_CANDIDATES = [
  EMPYRALIS_RUNTIME_KEY_STORAGE_KEY,
  LEGACY_ORION_RUNTIME_KEY_STORAGE_KEY,
] as const;

export function readRuntimeApiKeyFromStorage(defaultValue = ''): string {
  if (typeof window === 'undefined') return defaultValue;
  for (const key of RUNTIME_KEY_STORAGE_CANDIDATES) {
    try {
      const sessionValue = window.sessionStorage.getItem(key);
      if (sessionValue && sessionValue.trim()) return sessionValue.trim();
      const legacyValue = window.localStorage.getItem(key);
      if (legacyValue && legacyValue.trim()) {
        const normalized = legacyValue.trim();
        window.sessionStorage.setItem(key, normalized);
        window.localStorage.removeItem(key);
        return normalized;
      }
    } catch {
      // Ignore storage access errors.
    }
  }
  return defaultValue;
}

export function writeRuntimeApiKeyToStorage(value: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const normalized = String(value || '').trim();
  for (const key of RUNTIME_KEY_STORAGE_CANDIDATES) {
    try {
      if (normalized) window.sessionStorage.setItem(key, normalized);
      else window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage access errors.
    }
  }
}
