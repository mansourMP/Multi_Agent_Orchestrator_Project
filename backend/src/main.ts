import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        logger: ['error', 'warn', 'log', 'debug'],
    });
    const frontendOrigins = (process.env.FRONTEND_ORIGINS || 'http://127.0.0.1:3000,http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    // Global validation pipe
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true,
        }),
    );

    // CORS
    app.enableCors({
        origin: frontendOrigins,
        credentials: true,
    });

    // API prefix
    app.setGlobalPrefix('api/v1');

    const port = process.env.PORT || 4000;
    await app.listen(port);

    console.log(`🚀 Empyralis Backend running on http://localhost:${port}`);
}

bootstrap();
