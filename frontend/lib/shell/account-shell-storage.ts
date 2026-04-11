import type { AccountShellSnapshot } from '@/lib/shell/account-shell-store';

const ACCOUNT_SHELL_STORAGE_KEY = 'empyralis.account-shell.v2';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readAccountShellSnapshot(): AccountShellSnapshot | null {
  if (!canUseStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(ACCOUNT_SHELL_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as AccountShellSnapshot;
  } catch {
    window.localStorage.removeItem(ACCOUNT_SHELL_STORAGE_KEY);
    return null;
  }
}

export function writeAccountShellSnapshot(snapshot: AccountShellSnapshot): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(ACCOUNT_SHELL_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearAccountShellSnapshot(): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(ACCOUNT_SHELL_STORAGE_KEY);
}
