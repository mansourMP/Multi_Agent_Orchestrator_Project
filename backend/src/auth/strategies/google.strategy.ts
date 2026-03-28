import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Profile, Strategy } from 'passport-google-oauth20';

function backendPublicOrigin(config: ConfigService): string {
    const explicit = String(config.get('BACKEND_PUBLIC_ORIGIN') || '').trim();
    if (explicit) return explicit.replace(/\/$/, '');

    const host = String(config.get('BACKEND_PUBLIC_HOST') || 'http://localhost:4000').trim();
    return host.replace(/\/$/, '');
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    private readonly enabled: boolean;

    constructor(config: ConfigService) {
        const clientID = String(config.get('GOOGLE_CLIENT_ID') || '').trim();
        const clientSecret = String(config.get('GOOGLE_CLIENT_SECRET') || '').trim();
        const callbackURL = `${backendPublicOrigin(config)}/api/v1/auth/google/callback`;

        super({
            clientID: clientID || 'disabled-google-client-id',
            clientSecret: clientSecret || 'disabled-google-client-secret',
            callbackURL,
            scope: ['email', 'profile'],
        });

        this.enabled = Boolean(clientID && clientSecret);
    }

    authenticate(req: any, options?: any) {
        if (!this.enabled) {
            return this.fail({ message: 'Google sign-in is not configured.' }, 503);
        }
        const requestState = String(req?.query?.state || '').trim();
        const nextOptions = requestState
            ? { ...(options || {}), state: requestState }
            : options;
        return super.authenticate(req, nextOptions);
    }

    async validate(
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
    ) {
        const email = String(profile.emails?.[0]?.value || '').trim().toLowerCase();
        if (!email) {
            throw new UnauthorizedException('Google account email is missing.');
        }

        return {
            email,
            name: String(profile.displayName || profile.name?.givenName || email.split('@')[0]).trim(),
            avatarUrl: String(profile.photos?.[0]?.value || '').trim() || null,
        };
    }
}
