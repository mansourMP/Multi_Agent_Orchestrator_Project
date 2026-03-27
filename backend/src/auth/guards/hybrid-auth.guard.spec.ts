import { UnauthorizedException } from '@nestjs/common';
import { HybridAuthGuard } from './hybrid-auth.guard';

const createConfig = (values: Record<string, string | undefined> = {}) => ({
  get: jest.fn((key: string) => values[key]),
});

const createJwt = () => ({
  verifyAsync: jest.fn(),
});

const createPrisma = () => ({
  user: {
    findUnique: jest.fn(),
  },
});

const createContext = (request: Record<string, unknown>) => ({
  switchToHttp: () => ({
    getRequest: () => request,
  }),
});

describe('HybridAuthGuard service-key fallback', () => {
  it('accepts X-API-Key when only RUNTIME_KEY is configured', async () => {
    const config = createConfig({ RUNTIME_KEY: 'service-secret' });
    const jwt = createJwt();
    const prisma = createPrisma();
    const guard = new HybridAuthGuard(config as never, jwt as never, prisma as never);
    const request: Record<string, unknown> = {
      headers: {
        'x-api-key': 'service-secret',
        authorization: '',
      },
    };

    await expect(guard.canActivate(createContext(request) as never)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      id: 'service-api-key',
      authType: 'api_key',
      isService: true,
    });
  });

  it('still rejects unauthenticated requests when no service key matches', async () => {
    const config = createConfig({ RUNTIME_KEY: 'service-secret' });
    const jwt = createJwt();
    const prisma = createPrisma();
    const guard = new HybridAuthGuard(config as never, jwt as never, prisma as never);
    const request: Record<string, unknown> = {
      headers: {
        'x-api-key': 'wrong-secret',
        authorization: '',
      },
    };

    await expect(guard.canActivate(createContext(request) as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
