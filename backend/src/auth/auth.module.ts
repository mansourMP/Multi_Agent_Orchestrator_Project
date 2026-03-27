import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { HybridAuthGuard } from './guards/hybrid-auth.guard';
import { resolveJwtSecret } from './jwt-secret';

@Module({
    imports: [
        PrismaModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: resolveJwtSecret(config),
                signOptions: {
                    expiresIn: config.get('JWT_EXPIRATION') || '7d',
                },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, HybridAuthGuard],
    exports: [AuthService, JwtStrategy, HybridAuthGuard, PassportModule, JwtModule],
})
export class AuthModule { }
