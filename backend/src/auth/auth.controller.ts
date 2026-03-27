import { Controller, Post, Body, Get, UseGuards, Req, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
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
            apple: { enabled: false },
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

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getCurrentUser(@CurrentUser() user: any) {
        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                organizations: user.memberships.map((m: any) => ({
                    id: m.organization.id,
                    name: m.organization.name,
                    role: m.role,
                })),
            },
        };
    }
}
