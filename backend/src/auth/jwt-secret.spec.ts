import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from './jwt-secret';

describe('resolveJwtSecret', () => {
  function config(values: Record<string, string | undefined>) {
    return {
      get(key: string) {
        return values[key];
      },
    } as unknown as ConfigService;
  }

  it('prefers JWT_SECRET when configured', () => {
    expect(resolveJwtSecret(config({ JWT_SECRET: 'jwt-secret', NODE_ENV: 'production' }))).toBe('jwt-secret');
  });

  it('falls back to ORION_JWT_SECRET when JWT_SECRET is absent', () => {
    expect(resolveJwtSecret(config({ ORION_JWT_SECRET: 'runtime-secret', NODE_ENV: 'production' }))).toBe('runtime-secret');
  });

  it('throws in production when no JWT secret is configured', () => {
    expect(() => resolveJwtSecret(config({ NODE_ENV: 'production' }))).toThrow(
      'JWT secret is not configured. Set JWT_SECRET or ORION_JWT_SECRET.',
    );
  });
});
