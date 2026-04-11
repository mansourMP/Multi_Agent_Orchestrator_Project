import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { SignupDto, LoginDto } from './dto';

type ExternalAuthProfile = {
    email: string;
    name: string;
    avatarUrl?: string | null;
};

type SignInMethodKey = 'empyralis_password' | 'google_oauth' | 'apple_oauth' | 'provider_oauth';

type AuthMethodRow = {
    id: string;
    user_id: string;
    method: string;
    label: string;
    status: string;
    is_primary: number;
    created_at: string | Date;
    updated_at: string | Date;
};

type SerializedSignInMethod = {
    id: string;
    method: string;
    provider: string;
    kind: 'password' | 'oauth' | 'sso';
    label: string;
    status: 'active' | 'disconnected';
    is_primary: boolean;
    can_disconnect: boolean;
    disconnect_reason: string | null;
    created_at: string | null;
    updated_at: string | null;
};

@Injectable()
export class AuthService {
    private accountAccessStorageReady: Promise<void> | null = null;

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
        await this.ensurePasswordSignInMethod(user.id);

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

        await this.ensurePasswordSignInMethod(user.id);

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
        return this.loginWithExternalProfile(profile, 'google_oauth');
    }

    async loginWithAppleProfile(profile: ExternalAuthProfile) {
        return this.loginWithExternalProfile(profile, 'apple_oauth');
    }

    async updateProfile(userId: string, patch: { name?: string | null; avatarUrl?: string | null }) {
        const nextName = typeof patch.name === 'string' ? patch.name.trim() : undefined;
        const nextAvatarUrl = typeof patch.avatarUrl === 'string' ? patch.avatarUrl.trim() : undefined;
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: {
                ...(nextName !== undefined ? { name: nextName || null } : {}),
                ...(nextAvatarUrl !== undefined ? { avatarUrl: nextAvatarUrl || null } : {}),
            },
            include: {
                memberships: {
                    include: {
                        organization: {
                            include: {
                                workspaces: true,
                            },
                        },
                    },
                },
            },
        });

        return {
            user,
            accountAccess: await this.getAccountAccess(user.id, user.email),
        };
    }

    async getAccountAccess(userId: string, emailHint?: string | null) {
        await this.ensureAccountAccessStorage();
        const methods = await this.listSerializedSignInMethods(userId);
        const activeMethods = methods.filter((item) => item.status === 'active');
        const primaryMethod = activeMethods.find((item) => item.is_primary) || activeMethods[0] || null;
        const hasPassword = activeMethods.some((item) => item.method === 'empyralis_password');
        const hasBackupSignInMethod = hasPassword || activeMethods.length > 1;
        const warnings: string[] = [];
        if (!hasBackupSignInMethod) {
            warnings.push('Add another sign-in method before disconnecting your current one so you do not lose access to this account.');
        }
        if (!hasPassword) {
            warnings.push('Add an email + password backup so your Empyralis account stays recoverable even if a provider session changes.');
        }

        return {
            account_owner: 'empyralis',
            account_id: userId,
            email: String(emailHint || '').trim().toLowerCase() || null,
            sign_in_methods: methods,
            summary: {
                primary_sign_in_method: primaryMethod,
                active_sign_in_method_count: activeMethods.length,
                has_password: hasPassword,
                has_backup_sign_in_method: hasBackupSignInMethod,
            },
            recovery: {
                state: hasBackupSignInMethod ? 'protected' : 'action_required',
                has_backup_sign_in_method: hasBackupSignInMethod,
                warnings,
                recommended_actions: [
                    !hasPassword ? 'Add email + password backup' : null,
                    !hasBackupSignInMethod ? 'Keep at least one additional sign-in method before disconnecting anything' : null,
                ].filter((item): item is string => Boolean(item)),
            },
            messaging: {
                account_owner: 'Your Empyralis account owns your workspaces, runs, artifacts, notifications, and billing state.',
                provider_boundary: 'OpenAI is a connected provider, not the sole owner of this account.',
                unlink_safety: 'You cannot remove the last viable sign-in method from this account.',
            },
        };
    }

    async setPasswordForUser(userId: string, password: string) {
        const normalizedPassword = String(password || '');
        if (normalizedPassword.length < 8) {
            throw new BadRequestException('Password must be at least 8 characters.');
        }

        const passwordHash = await bcrypt.hash(normalizedPassword, 10);
        await this.prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
        });
        await this.ensurePasswordSignInMethod(userId);
        return this.getAccountAccess(userId);
    }

    async disconnectSignInMethod(userId: string, method: string) {
        await this.ensureAccountAccessStorage();
        const normalizedMethod = this.normalizeSignInMethod(method);
        const rows = await this.listRawAuthMethodRows(userId);
        const target = rows.find((item) => item.method === normalizedMethod && this.normalizeMethodStatus(item.status) === 'active');
        if (!target) {
            throw new ConflictException('That sign-in method is not currently active.');
        }

        const activeRows = rows.filter((item) => this.normalizeMethodStatus(item.status) === 'active');
        if (activeRows.length <= 1) {
            throw new ConflictException('Add another sign-in method before removing the last way back into this account.');
        }

        await this.prisma.$executeRawUnsafe(
            `
            UPDATE user_auth_methods
            SET status = 'disconnected', is_primary = 0, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND method = ?
            `,
            userId,
            normalizedMethod,
        );

        if (normalizedMethod === 'empyralis_password') {
            await this.prisma.user.update({
                where: { id: userId },
                data: { passwordHash: null },
            });
        }

        const remainingRows = activeRows.filter((item) => item.method !== normalizedMethod);
        const nextPrimary = remainingRows.find((item) => item.is_primary) || remainingRows[0] || null;
        await this.normalizePrimarySignInMethod(userId, nextPrimary?.method || null);
        return this.getAccountAccess(userId);
    }

    private async loginWithExternalProfile(profile: ExternalAuthProfile, authMethod: SignInMethodKey) {
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

        await this.ensureExternalSignInMethod(user.id, authMethod);

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

    private async ensureAccountAccessStorage() {
        if (!this.accountAccessStorageReady) {
            this.accountAccessStorageReady = (async () => {
                await this.prisma.$executeRawUnsafe(`
                    CREATE TABLE IF NOT EXISTS user_auth_methods (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        method TEXT NOT NULL,
                        label TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'active',
                        is_primary INTEGER NOT NULL DEFAULT 0,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(user_id, method)
                    )
                `);
                await this.prisma.$executeRawUnsafe(`
                    CREATE INDEX IF NOT EXISTS idx_user_auth_methods_user
                    ON user_auth_methods(user_id, is_primary DESC, created_at ASC)
                `);
            })();
        }
        return this.accountAccessStorageReady;
    }

    private normalizeSignInMethod(method: string): SignInMethodKey {
        const token = String(method || '').trim().toLowerCase();
        if (token === 'empyralis_password' || token === 'password' || token === 'email' || token === 'email_password') {
            return 'empyralis_password';
        }
        if (token === 'provider' || token === 'provider_oauth' || token === 'external_oauth') {
            return 'provider_oauth';
        }
        if (token === 'google' || token === 'google_oauth') return 'google_oauth';
        if (token === 'apple' || token === 'apple_oauth') return 'apple_oauth';
        throw new BadRequestException('Unsupported sign-in method.');
    }

    private normalizeMethodStatus(status: string | null | undefined): 'active' | 'disconnected' {
        return String(status || '').trim().toLowerCase() === 'disconnected' ? 'disconnected' : 'active';
    }

    private methodLabel(method: string): string {
        switch (this.normalizeSignInMethod(method)) {
            case 'provider_oauth':
                return 'Provider sign-in';
            case 'google_oauth':
                return 'Google sign-in';
            case 'apple_oauth':
                return 'Apple sign-in';
            default:
                return 'Email + password';
        }
    }

    private methodProvider(method: string): string {
        switch (this.normalizeSignInMethod(method)) {
            case 'provider_oauth':
                return 'external';
            case 'google_oauth':
                return 'google';
            case 'apple_oauth':
                return 'apple';
            default:
                return 'empyralis';
        }
    }

    private methodKind(method: string): 'password' | 'oauth' | 'sso' {
        return this.normalizeSignInMethod(method) === 'empyralis_password' ? 'password' : 'oauth';
    }

    private timestampValue(value: string | Date): string | null {
        if (value instanceof Date) return value.toISOString();
        const normalized = String(value || '').trim();
        if (!normalized) return null;
        const parsed = new Date(normalized);
        if (Number.isNaN(parsed.getTime())) return normalized;
        return parsed.toISOString();
    }

    private async listRawAuthMethodRows(userId: string): Promise<AuthMethodRow[]> {
        await this.ensureAccountAccessStorage();
        let rows = await this.prisma.$queryRawUnsafe<AuthMethodRow[]>(
            `
            SELECT id, user_id, method, label, status, is_primary, created_at, updated_at
            FROM user_auth_methods
            WHERE user_id = ?
            ORDER BY is_primary DESC, created_at ASC
            `,
            userId,
        );
        if (rows.length === 0) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { passwordHash: true, emailVerified: true },
            });
            if (user?.passwordHash) {
                await this.insertAuthMethodRecord(userId, 'empyralis_password', true);
            } else if (user?.emailVerified) {
                await this.insertAuthMethodRecord(userId, 'provider_oauth', true);
            }
            rows = await this.prisma.$queryRawUnsafe<AuthMethodRow[]>(
                `
                SELECT id, user_id, method, label, status, is_primary, created_at, updated_at
                FROM user_auth_methods
                WHERE user_id = ?
                ORDER BY is_primary DESC, created_at ASC
                `,
                userId,
            );
        }
        return rows;
    }

    private async insertAuthMethodRecord(userId: string, method: SignInMethodKey, shouldBePrimary: boolean) {
        await this.prisma.$executeRawUnsafe(
            `
            INSERT INTO user_auth_methods (id, user_id, method, label, status, is_primary, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, method) DO UPDATE SET
                label = excluded.label,
                status = 'active',
                is_primary = excluded.is_primary,
                updated_at = CURRENT_TIMESTAMP
            `,
            randomUUID(),
            userId,
            method,
            this.methodLabel(method),
            shouldBePrimary ? 1 : 0,
        );
    }

    private async upsertSignInMethod(userId: string, method: SignInMethodKey, options?: { shouldBePrimary?: boolean }) {
        await this.ensureAccountAccessStorage();
        const existingRows = await this.listRawAuthMethodRows(userId);
        const existing = existingRows.find((item) => item.method === method) || null;
        const activeRows = existingRows.filter((item) => this.normalizeMethodStatus(item.status) === 'active');
        const shouldBePrimary = Boolean(options?.shouldBePrimary) || activeRows.length === 0;

        await this.prisma.$executeRawUnsafe(
            `
            INSERT INTO user_auth_methods (id, user_id, method, label, status, is_primary, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, method) DO UPDATE SET
                label = excluded.label,
                status = 'active',
                is_primary = excluded.is_primary,
                updated_at = CURRENT_TIMESTAMP
            `,
            existing?.id || randomUUID(),
            userId,
            method,
            this.methodLabel(method),
            shouldBePrimary ? 1 : 0,
        );

        await this.normalizePrimarySignInMethod(userId, shouldBePrimary ? method : null);
    }

    private async normalizePrimarySignInMethod(userId: string, preferredMethod: string | null) {
        const rows = await this.listRawAuthMethodRows(userId);
        const activeRows = rows.filter((item) => this.normalizeMethodStatus(item.status) === 'active');
        if (activeRows.length === 0) return;
        const nextPrimary = activeRows.find((item) => item.method === preferredMethod)
            || activeRows.find((item) => Boolean(item.is_primary))
            || activeRows[0];
        await this.prisma.$executeRawUnsafe(
            `
            UPDATE user_auth_methods
            SET is_primary = CASE WHEN method = ? AND status = 'active' THEN 1 ELSE 0 END,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            `,
            nextPrimary.method,
            userId,
        );
    }

    private async ensurePasswordSignInMethod(userId: string) {
        await this.upsertSignInMethod(userId, 'empyralis_password');
    }

    private async ensureExternalSignInMethod(userId: string, method: SignInMethodKey) {
        const rows = await this.listRawAuthMethodRows(userId);
        const activeRows = rows.filter((item) => this.normalizeMethodStatus(item.status) === 'active');
        const hasOnlyLegacyProviderMethod = activeRows.length === 1 && activeRows[0].method === 'provider_oauth';
        await this.upsertSignInMethod(userId, method, { shouldBePrimary: activeRows.length === 0 || hasOnlyLegacyProviderMethod });
        if (hasOnlyLegacyProviderMethod) {
            await this.prisma.$executeRawUnsafe(
                `
                UPDATE user_auth_methods
                SET status = 'disconnected', is_primary = 0, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND method = 'provider_oauth'
                `,
                userId,
            );
            await this.normalizePrimarySignInMethod(userId, method);
        }
    }

    private async listSerializedSignInMethods(userId: string): Promise<SerializedSignInMethod[]> {
        const rows = await this.listRawAuthMethodRows(userId);
        const activeRows = rows.filter((item) => this.normalizeMethodStatus(item.status) === 'active');
        return rows.map((row) => {
            const status = this.normalizeMethodStatus(row.status);
            const wouldBeLastMethod = status === 'active' && activeRows.length <= 1;
            return {
                id: row.id,
                method: row.method,
                provider: this.methodProvider(row.method),
                kind: this.methodKind(row.method),
                label: row.label || this.methodLabel(row.method),
                status,
                is_primary: Boolean(row.is_primary),
                can_disconnect: status === 'active' && !wouldBeLastMethod,
                disconnect_reason: wouldBeLastMethod
                    ? 'Add another sign-in method before removing the last way back into this account.'
                    : null,
                created_at: this.timestampValue(row.created_at),
                updated_at: this.timestampValue(row.updated_at),
            };
        });
    }
}
