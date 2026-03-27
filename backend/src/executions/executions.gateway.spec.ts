import { ExecutionsGateway } from './executions.gateway';

type MockSocket = {
  id: string;
  handshake: {
    auth?: Record<string, unknown>;
    headers?: Record<string, string | string[] | undefined>;
  };
  data: Record<string, unknown>;
  disconnect: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
  emit: jest.Mock;
};

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
  execution: {
    findUnique: jest.fn(),
  },
});

const createSocket = (overrides: Partial<MockSocket> = {}): MockSocket => ({
  id: 'socket-1',
  handshake: {
    auth: {},
    headers: {},
  },
  data: {},
  disconnect: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  emit: jest.fn(),
  ...overrides,
});

describe('ExecutionsGateway security hardening', () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  it('rejects unauthenticated non-bridge sockets', async () => {
    const config = createConfig({ NODE_ENV: 'production' });
    const jwt = createJwt();
    const prisma = createPrisma();
    const gateway = new ExecutionsGateway(config as never, jwt as never, prisma as never);
    const client = createSocket();

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.data.actor).toBeUndefined();
  });

  it('accepts service API key sockets', async () => {
    const config = createConfig({
      NODE_ENV: 'production',
      ORION_API_KEY: 'service-secret',
    });
    const jwt = createJwt();
    const prisma = createPrisma();
    const gateway = new ExecutionsGateway(config as never, jwt as never, prisma as never);
    const client = createSocket({
      handshake: {
        auth: { apiKey: 'service-secret' },
        headers: {},
      },
    });

    await gateway.handleConnection(client as never);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.actor).toMatchObject({
      authType: 'api_key',
      isService: true,
      userId: 'service-api-key',
    });
  });

  it('accepts service API key sockets when only RUNTIME_KEY is configured', async () => {
    const config = createConfig({
      NODE_ENV: 'production',
      RUNTIME_KEY: 'service-secret',
    });
    const jwt = createJwt();
    const prisma = createPrisma();
    const gateway = new ExecutionsGateway(config as never, jwt as never, prisma as never);
    const client = createSocket({
      handshake: {
        auth: { apiKey: 'service-secret' },
        headers: {},
      },
    });

    await gateway.handleConnection(client as never);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.actor).toMatchObject({
      authType: 'api_key',
      isService: true,
      userId: 'service-api-key',
    });
  });

  it('rejects bridge sockets without a token in production', async () => {
    const config = createConfig({
      NODE_ENV: 'production',
      CONDUCTOR_BRIDGE_TOKEN: 'bridge-secret',
    });
    const jwt = createJwt();
    const prisma = createPrisma();
    const gateway = new ExecutionsGateway(config as never, jwt as never, prisma as never);
    const client = createSocket({
      handshake: {
        auth: { type: 'bridge' },
        headers: {},
      },
    });

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('accepts bridge sockets with the configured token', async () => {
    const config = createConfig({
      NODE_ENV: 'production',
      CONDUCTOR_BRIDGE_TOKEN: 'bridge-secret',
    });
    const jwt = createJwt();
    const prisma = createPrisma();
    const gateway = new ExecutionsGateway(config as never, jwt as never, prisma as never);
    const client = createSocket({
      id: 'bridge-1',
      handshake: {
        auth: { type: 'bridge', bridgeToken: 'bridge-secret' },
        headers: {},
      },
    });

    await gateway.handleConnection(client as never);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.actor).toMatchObject({
      authType: 'bridge',
      isService: true,
      userId: 'bridge',
    });
  });

  it('rejects execution subscriptions outside the actor organization', async () => {
    const config = createConfig();
    const jwt = createJwt();
    const prisma = createPrisma();
    prisma.execution.findUnique.mockResolvedValue({ organizationId: 'org-b' });
    const gateway = new ExecutionsGateway(config as never, jwt as never, prisma as never);
    const client = createSocket({
      data: {
        actor: {
          userId: 'user-1',
          authType: 'bearer',
          isService: false,
          organizationIds: ['org-a'],
        },
      },
    });

    const result = await gateway.handleSubscribe({ executionId: 'exec-1' }, client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(result).toEqual({ success: false, message: 'Execution is not accessible.' });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects global subscriptions without service access', () => {
    const config = createConfig();
    const jwt = createJwt();
    const prisma = createPrisma();
    const gateway = new ExecutionsGateway(config as never, jwt as never, prisma as never);
    const client = createSocket({
      data: {
        actor: {
          userId: 'user-1',
          authType: 'bearer',
          isService: false,
          organizationIds: ['org-a'],
        },
      },
    });

    const result = gateway.handleSubscribeGlobal(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(result).toEqual({ success: false, message: 'Global subscription requires service access.' });
  });

  it('rejects bridge log events from non-bridge sockets', () => {
    const config = createConfig();
    const jwt = createJwt();
    const prisma = createPrisma();
    const gateway = new ExecutionsGateway(config as never, jwt as never, prisma as never);
    const client = createSocket({ id: 'user-socket' });

    gateway.handleBridgeLog({ executionId: 'exec-1', output: 'hello' }, client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});
