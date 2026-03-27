import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const INSECURE_DEV_JWT_SECRET = 'dev-secret-change-in-production';
let warnedInsecureJwtFallback = false;

export function resolveJwtSecret(config: ConfigService): string {
    const configured = String(
        config.get('JWT_SECRET')
        || config.get('ORION_JWT_SECRET')
        || '',
    ).trim();
    if (configured) {
        return configured;
    }

    const nodeEnv = String(config.get('NODE_ENV') || process.env.NODE_ENV || '').trim().toLowerCase();
    if (nodeEnv === 'production') {
        throw new Error('JWT secret is not configured. Set JWT_SECRET or ORION_JWT_SECRET.');
    }

    if (!warnedInsecureJwtFallback) {
        Logger.warn(
            'JWT secret is not configured; using the insecure development fallback. Set JWT_SECRET or ORION_JWT_SECRET.',
            'Auth',
        );
        warnedInsecureJwtFallback = true;
    }
    return INSECURE_DEV_JWT_SECRET;
}

