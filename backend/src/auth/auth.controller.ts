import { Controller, Post, Body, Get, UseGuards, Req, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { createPublicKey, createSign, createVerify } from 'crypto';
import { AuthService } from './auth.service';
import { SignupDto, LoginDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

function frontendAuthOrigin(): string {
    const explicit = String(process.env.FRONTEND_AUTH_ORIGIN || '').trim();
    if (explicit) return explicit.replace(/\/$/, '');

    const [firstOrigin] = String(process.env.FRONTEND_ORIGINS || 'http://localhost:3000')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    return (firstOrigin || 'http://localhost:3000').replace(/\/$/, '');
}

function backendPublicOrigin(): string {
    const explicit = String(process.env.BACKEND_PUBLIC_ORIGIN || '').trim();
    if (explicit) return explicit.replace(/\/$/, '');
    return 'http://localhost:4000';
}

function isPublicHttpsOrigin(value: string): boolean {
    try {
        const parsed = new URL(value);
        const hostname = parsed.hostname.trim().toLowerCase();
        if (parsed.protocol !== 'https:') return false;
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
        return true;
    } catch {
        return false;
    }
}

function appleConfigured(): boolean {
    return Boolean(
        String(process.env.APPLE_CLIENT_ID || '').trim()
        && String(process.env.APPLE_TEAM_ID || '').trim()
        && String(process.env.APPLE_KEY_ID || '').trim()
        && String(process.env.APPLE_PRIVATE_KEY || '').trim()
        && isPublicHttpsOrigin(backendPublicOrigin()),
    );
}

function appleCallbackUrl(): string {
    return `${backendPublicOrigin()}/api/v1/auth/apple/callback`;
}

function appleClientSecret(): string {
    const teamId = String(process.env.APPLE_TEAM_ID || '').trim();
    const clientId = String(process.env.APPLE_CLIENT_ID || '').trim();
    const keyId = String(process.env.APPLE_KEY_ID || '').trim();
    const privateKey = String(process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

    const now = Math.floor(Date.now() / 1000);
    const header = {
        alg: 'ES256',
        kid: keyId,
    };
    const payload = {
        iss: teamId,
        iat: now,
        exp: now + (60 * 60 * 24 * 180),
        aud: 'https://appleid.apple.com',
        sub: clientId,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signer = createSign('SHA256');
    signer.update(`${encodedHeader}.${encodedPayload}`);
    signer.end();
    const signature = signer.sign({
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function parseJwtPayload(token: string): Record<string, unknown> {
    const [, payloadSegment] = String(token || '').split('.', 3);
    if (!payloadSegment) {
        throw new Error('missing-payload');
    }
    return JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function parseJwtHeader(token: string): Record<string, unknown> {
    const [headerSegment] = String(token || '').split('.', 3);
    if (!headerSegment) {
        throw new Error('missing-header');
    }
    return JSON.parse(Buffer.from(headerSegment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

async function verifyAppleIdentityToken(idToken: string): Promise<Record<string, unknown>> {
    const header = parseJwtHeader(idToken);
    const payload = parseJwtPayload(idToken);
    const [headerSegment, payloadSegment, signatureSegment] = String(idToken || '').split('.', 3);
    const kid = String(header.kid || '').trim();
    const alg = String(header.alg || '').trim();
    if (!kid || alg !== 'RS256' || !signatureSegment) {
        throw new Error('invalid-header');
    }

    const response = await fetch('https://appleid.apple.com/auth/keys', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) {
        throw new Error('keys-unavailable');
    }

    const jwks = await response.json().catch(() => null) as { keys?: Array<Record<string, unknown>> } | null;
    const matchingKey = Array.isArray(jwks?.keys)
        ? jwks.keys.find((item) => String(item.kid || '').trim() === kid)
        : null;
    if (!matchingKey) {
        throw new Error('missing-key');
    }

    const key = createPublicKey({
        key: {
            kty: 'RSA',
            n: String(matchingKey.n || '').trim(),
            e: String(matchingKey.e || '').trim(),
        },
        format: 'jwk',
    });

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerSegment}.${payloadSegment}`);
    verifier.end();
    const valid = verifier.verify(key, Buffer.from(signatureSegment, 'base64url'));
    if (!valid) {
        throw new Error('invalid-signature');
    }

    return payload;
}

function serializeAuthenticatedUser(user: any) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        organizations: user.memberships.map((m: any) => ({
            id: m.organization.id,
            name: m.organization.name,
            role: m.role,
        })),
    };
}

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('signup')
    async signup(@Body() dto: SignupDto) {
        return this.authService.signup(dto);
    }

    @Post('login')
    async login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @Get('providers')
    async providers() {
        const googleConfigured = Boolean(
            String(process.env.GOOGLE_CLIENT_ID || '').trim()
            && String(process.env.GOOGLE_CLIENT_SECRET || '').trim(),
        );

        return {
            email: { enabled: true },
            google: { enabled: googleConfigured },
            apple: { enabled: appleConfigured() },
        };
    }

    @Get('google')
    @UseGuards(AuthGuard('google'))
    async googleAuth() {
        return;
    }

    @Get('google/callback')
    @UseGuards(AuthGuard('google'))
    async googleAuthCallback(@Req() request: Request, @Res() response: Response) {
        const payload = await this.authService.loginWithGoogleProfile(request.user as {
            email: string;
            name: string;
            avatarUrl?: string | null;
        });

        const state = String(request.query.state || '').trim();
        const callback = new URL('/api/control-plane/auth/google/callback', frontendAuthOrigin());
        callback.searchParams.set('token', payload.token);
        if (state) {
            callback.searchParams.set('state', state);
        }
        return response.redirect(callback.toString());
    }

    @Get('apple')
    async appleAuth(@Req() request: Request, @Res() response: Response) {
        if (!appleConfigured()) {
            return response.status(503).json({ detail: 'Apple sign-in is not configured.' });
        }

        const state = String(request.query.state || '').trim();
        const params = new URLSearchParams({
            response_type: 'code',
            response_mode: 'form_post',
            client_id: String(process.env.APPLE_CLIENT_ID || '').trim(),
            redirect_uri: appleCallbackUrl(),
            scope: 'name email',
        });
        if (state) {
            params.set('state', state);
        }
        return response.redirect(`https://appleid.apple.com/auth/authorize?${params.toString()}`);
    }

    @Post('apple/callback')
    async appleAuthCallback(@Req() request: Request, @Res() response: Response, @Body() body: Record<string, unknown>) {
        if (!appleConfigured()) {
            return response.status(503).json({ detail: 'Apple sign-in is not configured.' });
        }

        const code = String(body.code || '').trim();
        const state = String(body.state || '').trim();
        if (!code) {
            const failed = new URL('/sign-in', frontendAuthOrigin());
            failed.searchParams.set('error', 'oauth_missing_code');
            if (state) {
                failed.searchParams.set('state', state);
            }
            return response.redirect(failed.toString());
        }

        const tokenBody = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: String(process.env.APPLE_CLIENT_ID || '').trim(),
            client_secret: appleClientSecret(),
            redirect_uri: appleCallbackUrl(),
        });

        const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: tokenBody.toString(),
        }).catch(() => null);

        if (!tokenResponse?.ok) {
            const failed = new URL('/sign-in', frontendAuthOrigin());
            failed.searchParams.set('error', 'oauth_exchange_failed');
            return response.redirect(failed.toString());
        }

        const payload = await tokenResponse.json().catch(() => null) as { id_token?: string } | null;
        const idToken = String(payload?.id_token || '').trim();
        if (!idToken) {
            const failed = new URL('/sign-in', frontendAuthOrigin());
            failed.searchParams.set('error', 'oauth_missing_token');
            return response.redirect(failed.toString());
        }

        const claims = await verifyAppleIdentityToken(idToken).catch(() => null);
        if (!claims) {
            const failed = new URL('/sign-in', frontendAuthOrigin());
            failed.searchParams.set('error', 'oauth_invalid_token');
            return response.redirect(failed.toString());
        }
        const email = String(claims.email || '').trim().toLowerCase();
        const aud = String(claims.aud || '').trim();
        const iss = String(claims.iss || '').trim();
        const exp = Number(claims.exp || 0);
        if (!email || aud !== String(process.env.APPLE_CLIENT_ID || '').trim() || iss !== 'https://appleid.apple.com' || (Number.isFinite(exp) && exp <= Math.floor(Date.now() / 1000))) {
            const failed = new URL('/sign-in', frontendAuthOrigin());
            failed.searchParams.set('error', 'oauth_invalid_token');
            return response.redirect(failed.toString());
        }

        const rawUser = typeof body.user === 'string' ? body.user : '';
        let displayName = email.split('@')[0];
        if (rawUser) {
            try {
                const parsed = JSON.parse(rawUser) as { name?: { firstName?: string; lastName?: string } };
                const first = String(parsed?.name?.firstName || '').trim();
                const last = String(parsed?.name?.lastName || '').trim();
                displayName = `${first} ${last}`.trim() || displayName;
            } catch {
                displayName = email.split('@')[0];
            }
        }

        const auth = await this.authService.loginWithAppleProfile({
            email,
            name: displayName,
            avatarUrl: null,
        });

        const callback = new URL('/api/control-plane/auth/apple/callback', frontendAuthOrigin());
        callback.searchParams.set('token', auth.token);
        if (state) {
            callback.searchParams.set('state', state);
        }
        return response.redirect(callback.toString());
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getCurrentUser(@CurrentUser() user: any) {
        return {
            user: serializeAuthenticatedUser(user),
        };
    }

    @Get('status')
    @UseGuards(JwtAuthGuard)
    async getAuthStatus(@CurrentUser() user: any) {
        return {
            authenticated: true,
            user: serializeAuthenticatedUser(user),
        };
    }
}
