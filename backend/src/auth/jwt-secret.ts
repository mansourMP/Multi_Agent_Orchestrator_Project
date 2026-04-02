import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

let cachedPersistedJwtSecret: string | null = null;
let warnedPersistedJwtSecret = false;

function normalizeSecret(raw: unknown): string {
  return String(raw || '').trim();
}

function stateHome(config: ConfigService): string {
  const configured = normalizeSecret(
    config.get('EMPYRALIS_STATE_HOME')
    || process.env.EMPYRALIS_STATE_HOME,
  );
  return configured || join(homedir(), '.empyralis', 'state');
}

function jwtSecretFile(config: ConfigService): string {
  const configured = normalizeSecret(
    config.get('EMPYRALIS_JWT_SECRET_FILE')
    || process.env.EMPYRALIS_JWT_SECRET_FILE,
  );
  return configured || join(stateHome(config), 'auth', 'jwt_secret');
}

function explicitSecret(config: ConfigService): string {
  for (const value of [
    config.get('JWT_SECRET'),
    config.get('ORION_JWT_SECRET'),
  ]) {
    const normalized = normalizeSecret(value);
    if (normalized) return normalized;
  }
  return '';
}

function legacySeedSecret(config: ConfigService): string {
  for (const value of [
    config.get('ORION_API_KEY'),
    config.get('RUNTIME_KEY'),
    process.env.ORION_API_KEY,
    process.env.RUNTIME_KEY,
  ]) {
    const normalized = normalizeSecret(value);
    if (normalized) return normalized;
  }
  return '';
}

function readPersistedSecret(filePath: string): string {
  try {
    return normalizeSecret(readFileSync(filePath, 'utf8'));
  } catch {
    return '';
  }
}

function persistSecret(filePath: string, secret: string): string {
  const normalized = normalizeSecret(secret);
  if (!normalized) {
    throw new Error('JWT secret is empty.');
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${normalized}\n`, { mode: 0o600, encoding: 'utf8' });
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Ignore chmod failures on platforms that do not support POSIX modes.
  }
  return normalized;
}

function ensurePersistedSecret(config: ConfigService): string {
  if (cachedPersistedJwtSecret) return cachedPersistedJwtSecret;

  const filePath = jwtSecretFile(config);
  const persisted = readPersistedSecret(filePath);
  if (persisted) {
    cachedPersistedJwtSecret = persisted;
    return cachedPersistedJwtSecret;
  }

  const seeded = legacySeedSecret(config);
  if (seeded) {
    cachedPersistedJwtSecret = persistSecret(filePath, seeded);
    return cachedPersistedJwtSecret;
  }

  cachedPersistedJwtSecret = persistSecret(filePath, randomBytes(48).toString('base64url'));
  if (!warnedPersistedJwtSecret) {
    Logger.warn(
      `JWT secret is not configured; generated a persistent secret at ${filePath}.`,
      'Auth',
    );
    warnedPersistedJwtSecret = true;
  }
  return cachedPersistedJwtSecret;
}

export function resolveJwtSecret(config: ConfigService): string {
  const configured = explicitSecret(config);
  if (configured) {
    return configured;
  }
  return ensurePersistedSecret(config);
}
