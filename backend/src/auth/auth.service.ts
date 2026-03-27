import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { SignupDto, LoginDto } from './dto';

type ExternalAuthProfile = {
    email: string;
    name: string;
    avatarUrl?: string | null;
};

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
    ) { }

    async signup(dto: SignupDto) {
        // Check if user exists
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });

        if (existingUser) {
            throw new ConflictException('Email already in use');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(dto.password, 10);

        // Create user
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                name: dto.name,
                passwordHash,
            },
        });

        await this.createDefaultWorkspace(user.id, dto.email, dto.name);

        // Generate token
        const token = await this.signToken(user.id, user.email);

        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                createdAt: user.createdAt,
            },
            token,
        };
    }

    async login(dto: LoginDto) {
        // Find user
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });

        if (!user || !user.passwordHash) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Verify password
        const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!passwordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Generate token
        const token = await this.signToken(user.id, user.email);

        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
            token,
        };
    }

    async validateUser(userId: string) {
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

        return user;
    }

    async signToken(userId: string, email: string): Promise<string> {
        const payload = {
            sub: userId,
            email,
        };

        return this.jwt.signAsync(payload);
    }

    async loginWithGoogleProfile(profile: ExternalAuthProfile) {
        return this.loginWithExternalProfile(profile);
    }

    async loginWithAppleProfile(profile: ExternalAuthProfile) {
        return this.loginWithExternalProfile(profile);
    }

    private async loginWithExternalProfile(profile: ExternalAuthProfile) {
        const email = profile.email.trim().toLowerCase();
        const displayName = profile.name.trim() || email.split('@')[0];
        const avatarUrl = String(profile.avatarUrl || '').trim() || null;

        let user = await this.prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    email,
                    name: displayName,
                    avatarUrl,
                    emailVerified: true,
                },
            });

            await this.createDefaultWorkspace(user.id, email, displayName);
        } else {
            user = await this.prisma.user.update({
                where: { id: user.id },
                data: {
                    name: user.name || displayName,
                    avatarUrl: user.avatarUrl || avatarUrl,
                    emailVerified: true,
                },
            });
        }

        const token = await this.signToken(user.id, user.email);
        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
            },
            token,
        };
    }

    private async createDefaultWorkspace(userId: string, email: string, displayName: string) {
        const org = await this.prisma.organization.create({
            data: {
                name: `${displayName}'s Workspace`,
                slug: `${email.split('@')[0]}-${Date.now()}`,
                members: {
                    create: {
                        userId,
                        role: 'owner',
                    },
                },
            },
        });

        await this.prisma.workspace.create({
            data: {
                organizationId: org.id,
                name: 'Default Workspace',
                description: 'Your first workspace',
            },
        });
    }
}
