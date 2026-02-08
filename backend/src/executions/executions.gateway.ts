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

    handleConnection(client: Socket) {
        if (client.handshake.auth?.type === 'bridge') {
            this.logger.log(`🔌 Bridge connected: ${client.id}`);
            this.bridgeSocket = client;
        } else {
            this.logger.log(`Client connected: ${client.id}`);
        }
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
    handleSubscribe(
        @MessageBody() data: { executionId: string },
        @ConnectedSocket() client: Socket,
    ) {
        const { executionId } = data;
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
    handleBridgeLog(@MessageBody() data: any) {
        const { executionId, output } = data;
        // Forward bridge output as standard log
        this.emitLog(executionId, output);
    }

    @SubscribeMessage('bridge_complete')
    handleBridgeComplete(@MessageBody() data: any) {
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
