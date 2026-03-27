import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveJwtSecret } from '../jwt-secret';

@Injectable()
export class HybridAuthGuard implements CanActivate {
    constructor(
        private readonly config: ConfigService,
        private readonly jwt: JwtService,
        private readonly prisma: PrismaService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const xApiKey = String(request.headers['x-api-key'] || '').trim();
        const authHeader = String(request.headers.authorization || '').trim();
        const configuredApiKey = String(
            this.config.get('ORION_API_KEY')
            || this.config.get('RUNTIME_KEY')
            || '',
        ).trim();

        if (configuredApiKey && xApiKey && xApiKey === configuredApiKey) {
            request.user = {
                id: 'service-api-key',
                email: null,
                name: 'Service API Key',
                memberships: [],
                authType: 'api_key',
                isService: true,
            };
            return true;
        }

        if (!authHeader.toLowerCase().startsWith('bearer ')) {
            throw new UnauthorizedException('Authentication required');
        }

        const token = authHeader.slice(7).trim();
        if (!token) {
            throw new UnauthorizedException('Authentication required');
        }

        const payload = await this.jwt.verifyAsync<{ sub?: string }>(token, {
            secret: resolveJwtSecret(this.config),
        }).catch(() => null);

        const userId = String(payload?.sub || '').trim();
        if (!userId) {
            throw new UnauthorizedException('Invalid bearer token');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                memberships: {
                    include: {
                        organization: true,
                    },
                },
            },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        request.user = {
            ...user,
            authType: 'bearer',
            isService: false,
        };
        return true;
    }
}
