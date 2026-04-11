'use client';

export const ACCOUNT_PROFILE_STORAGE_KEY = 'empyralis_account_profile_v1';

export type AccountProfilePreferences = {
  displayName: string;
  photoUrl: string;
};

const EMPTY_PREFERENCES: AccountProfilePreferences = {
  displayName: '',
  photoUrl: '',
};

export function displayNameFromEmail(email: string, fallback = 'Workspace account'): string {
  const localPart = String(email || '').trim().split('@')[0] || '';
  if (!localPart) return fallback;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export function readAccountProfilePreferences(): AccountProfilePreferences {
  if (typeof window === 'undefined') return EMPTY_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_PROFILE_STORAGE_KEY);
    if (!raw) return EMPTY_PREFERENCES;
    const saved = JSON.parse(raw) as Partial<AccountProfilePreferences>;
    return {
      displayName: typeof saved.displayName === 'string' ? saved.displayName.trim() : '',
      photoUrl: typeof saved.photoUrl === 'string' ? saved.photoUrl.trim() : '',
    };
  } catch {
    return EMPTY_PREFERENCES;
  }
}

export function writeAccountProfilePreferences(next: AccountProfilePreferences): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    ACCOUNT_PROFILE_STORAGE_KEY,
    JSON.stringify({
      displayName: String(next.displayName || '').trim(),
      photoUrl: String(next.photoUrl || '').trim(),
    }),
  );
}
