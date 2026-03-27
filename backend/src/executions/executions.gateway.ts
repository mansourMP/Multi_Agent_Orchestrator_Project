import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { resolveJwtSecret } from '../auth/jwt-secret';

type GatewayActor = {
    userId: string;
    authType: 'bearer' | 'api_key' | 'bridge';
    isService: boolean;
    organizationIds: string[] | null;
};

@WebSocketGateway({
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
    },
    namespace: '/executions',
})
export class ExecutionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ExecutionsGateway.name);
    private executionRooms = new Map<string, Set<string>>(); // executionId -> Set of socket IDs

    private bridgeSocket: Socket | null = null;
    private pendingCommands = new Map<string, (result: any) => void>();

    constructor(
        private readonly config: ConfigService,
        private readonly jwt: JwtService,
        private readonly prisma: PrismaService,
    ) { }

    private isProduction(): boolean {
        return String(this.config.get('NODE_ENV') || process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
    }

    private parseCookies(rawHeader: string): Record<string, string> {
        const cookies: Record<string, string> = {};
        for (const item of String(rawHeader || '').split(';')) {
            const [name, ...rest] = item.split('=');
            const key = String(name || '').trim();
            if (!key) continue;
            cookies[key] = decodeURIComponent(rest.join('=').trim() || '');
        }
        return cookies;
    }

    private headerValue(value: string | string[] | undefined): string {
        if (Array.isArray(value)) return String(value[0] || '').trim();
        return String(value || '').trim();
    }

    private secretsMatch(left: string, right: string): boolean {
        const leftBuffer = Buffer.from(String(left || ''));
        const rightBuffer = Buffer.from(String(right || ''));
        if (leftBuffer.length !== rightBuffer.length) return false;
        return timingSafeEqual(leftBuffer, rightBuffer);
    }

    private expectedBridgeToken(): string {
        return String(
            this.config.get('CONDUCTOR_BRIDGE_TOKEN')
            || this.config.get('BRIDGE_AUTH_TOKEN')
            || this.config.get('ORION_API_KEY')
            || this.config.get('RUNTIME_KEY')
            || '',
        ).trim();
    }

    private async authenticateClient(client: Socket): Promise<GatewayActor | null> {
        const configuredApiKey = String(
            this.config.get('ORION_API_KEY')
            || this.config.get('RUNTIME_KEY')
            || '',
        ).trim();
        const authApiKey = String(client.handshake.auth?.apiKey || '').trim();
        const headerApiKey = this.headerValue(client.handshake.headers['x-api-key']);
        const apiKey = authApiKey || headerApiKey;
        if (configuredApiKey && apiKey && this.secretsMatch(apiKey, configuredApiKey)) {
            return {
                userId: 'service-api-key',
                authType: 'api_key',
                isService: true,
                organizationIds: null,
            };
        }

        const authTokenValue = String(client.handshake.auth?.token || '').trim();
        const authorizationHeader = this.headerValue(client.handshake.headers.authorization);
        const cookieHeader = this.headerValue(client.handshake.headers.cookie);
        const cookies = this.parseCookies(cookieHeader);
        const cookieToken = String(cookies.orion_cp_admin || '').trim();
        const bearerToken = (authTokenValue.toLowerCase().startsWith('bearer ') ? authTokenValue.slice(7).trim() : authTokenValue)
            || (authorizationHeader.toLowerCase().startsWith('bearer ') ? authorizationHeader.slice(7).trim() : '')
            || cookieToken;
        if (!bearerToken) {
            return null;
        }

        const payload = await this.jwt.verifyAsync<{ sub?: string }>(bearerToken, {
            secret: resolveJwtSecret(this.config),
        }).catch(() => null);
        const userId = String(payload?.sub || '').trim();
        if (!userId) {
            return null;
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                memberships: {
                    select: {
                        organizationId: true,
                    },
                },
            },
        });
        if (!user) {
            return null;
        }

        return {
            userId,
            authType: 'bearer',
            isService: false,
            organizationIds: user.memberships.map((item) => item.organizationId),
        };
    }

    private async canAccessExecution(actor: GatewayActor | null, executionId: string): Promise<boolean> {
        if (!actor) return false;
        if (actor.isService) return true;
        const execution = await this.prisma.execution.findUnique({
            where: { id: executionId },
            select: { organizationId: true },
        });
        if (!execution) return false;
        return Boolean(actor.organizationIds?.includes(execution.organizationId));
    }

    async handleConnection(client: Socket) {
        if (client.handshake.auth?.type === 'bridge') {
            const expectedToken = this.expectedBridgeToken();
            const providedToken = String(
                client.handshake.auth?.bridgeToken
                || this.headerValue(client.handshake.headers['x-bridge-token'])
                || '',
            ).trim();
            if (expectedToken) {
                if (!providedToken || !this.secretsMatch(providedToken, expectedToken)) {
                    this.logger.warn(`Rejected unauthenticated bridge socket: ${client.id}`);
                    client.disconnect(true);
                    return;
                }
            } else if (this.isProduction()) {
                this.logger.error('Rejected bridge socket because no bridge auth token is configured in production.');
                client.disconnect(true);
                return;
            } else {
                this.logger.warn('Accepting bridge socket without a bridge token because the server is not running in production.');
            }
            this.logger.log(`🔌 Bridge connected: ${client.id}`);
            client.data.actor = {
                userId: 'bridge',
                authType: 'bridge',
                isService: true,
                organizationIds: null,
            } satisfies GatewayActor;
            this.bridgeSocket = client;
            return;
        }

        const actor = await this.authenticateClient(client);
        if (!actor) {
            this.logger.warn(`Rejected unauthenticated execution socket: ${client.id}`);
            client.disconnect(true);
            return;
        }
        client.data.actor = actor;
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        if (this.bridgeSocket?.id === client.id) {
            this.logger.warn(`🔌 Bridge disconnected: ${client.id}`);
            this.bridgeSocket = null;
        }

        this.logger.log(`Client disconnected: ${client.id}`);
        // Clean up room memberships
        this.executionRooms.forEach((clients, executionId) => {
            clients.delete(client.id);
            if (clients.size === 0) {
                this.executionRooms.delete(executionId);
            }
        });
    }

    @SubscribeMessage('subscribe')
    async handleSubscribe(
        @MessageBody() data: { executionId: string },
        @ConnectedSocket() client: Socket,
    ) {
        const { executionId } = data;
        const actor = (client.data.actor || null) as GatewayActor | null;
        const allowed = await this.canAccessExecution(actor, executionId);
        if (!allowed) {
            this.logger.warn(`Socket ${client.id} attempted to subscribe to inaccessible execution ${executionId}`);
            client.disconnect(true);
            return { success: false, message: 'Execution is not accessible.' };
        }
        client.join(`execution:${executionId}`);

        if (!this.executionRooms.has(executionId)) {
            this.executionRooms.set(executionId, new Set());
        }
        this.executionRooms.get(executionId)!.add(client.id);

        this.logger.log(`Client ${client.id} subscribed to execution ${executionId}`);
        return { success: true, message: `Subscribed to execution ${executionId}` };
    }

    @SubscribeMessage('unsubscribe')
    handleUnsubscribe(
        @MessageBody() data: { executionId: string },
        @ConnectedSocket() client: Socket,
    ) {
        const { executionId } = data;
        client.leave(`execution:${executionId}`);

        if (this.executionRooms.has(executionId)) {
            this.executionRooms.get(executionId)!.delete(client.id);
        }

        this.logger.log(`Client ${client.id} unsubscribed from execution ${executionId}`);
        return { success: true };
    }

    @SubscribeMessage('bridge_log')
    handleBridgeLog(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        if (this.bridgeSocket?.id !== client.id) {
            this.logger.warn(`Rejected bridge_log event from non-bridge socket ${client.id}`);
            client.disconnect(true);
            return;
        }
        const { executionId, output } = data;
        // Forward bridge output as standard log
        this.emitLog(executionId, output);
    }

    @SubscribeMessage('bridge_complete')
    handleBridgeComplete(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        if (this.bridgeSocket?.id !== client.id) {
            this.logger.warn(`Rejected bridge_complete event from non-bridge socket ${client.id}`);
            client.disconnect(true);
            return;
        }
        const { executionId, exitCode, error } = data;
        const resolve = this.pendingCommands.get(executionId);
        if (resolve) {
            resolve({ exitCode, error });
            this.pendingCommands.delete(executionId);
        }
    }

    // Called by ExecutionsService to execute command on Bridge
    async executeOnBridge(executionId: string, command: string, cwd?: string): Promise<any> {
        if (!this.bridgeSocket) {
            this.emitLog(executionId, "❌ No Bridge Connected. Please start the 'conductor-bridge' utility.");
            return { exitCode: 1, error: "No Bridge Connected" };
        }

        return new Promise((resolve) => {
            this.pendingCommands.set(executionId, resolve);
            this.bridgeSocket!.emit('execute_command', { executionId, command, cwd });
        });
    }

    @SubscribeMessage('subscribe_global')
    handleSubscribeGlobal(@ConnectedSocket() client: Socket) {
        const actor = (client.data.actor || null) as GatewayActor | null;
        if (!actor?.isService) {
            this.logger.warn(`Socket ${client.id} attempted to subscribe to the global execution room without service access`);
            client.disconnect(true);
            return { success: false, message: 'Global subscription requires service access.' };
        }
        client.join('room:global_ops');
        this.logger.log(`Client ${client.id} joined GLOBAL OPS room`);
        return { success: true };
    }

    // Called by ExecutionsService to broadcast logs
    emitLog(executionId: string, log: string) {
        const payload = {
            executionId,
            log,
            timestamp: new Date().toISOString(),
        };
        this.server.to(`execution:${executionId}`).emit('log', payload);
        this.server.to('room:global_ops').emit('log', payload);
    }

    // Called when execution status changes
    emitStatus(executionId: string, status: string, data?: any) {
        const payload = {
            executionId,
            status,
            data,
            timestamp: new Date().toISOString(),
        };
        this.server.to(`execution:${executionId}`).emit('status', payload);
        this.server.to('room:global_ops').emit('status', payload);
    }

    // Called when execution completes
    emitComplete(executionId: string, result: any) {
        const payload = {
            executionId,
            result,
            timestamp: new Date().toISOString(),
        };
        this.server.to(`execution:${executionId}`).emit('complete', payload);
        this.server.to('room:global_ops').emit('complete', payload);
    }
}
