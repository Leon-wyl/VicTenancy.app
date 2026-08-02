import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../app.module';
import { correlationMiddleware } from '../common/correlation/correlation.middleware';
import { requestLoggingMiddleware } from '../common/logging/request-logging.middleware';
import { corsConfig } from '../common/cors/cors.config';

function resolveCorsOrigins(app: INestApplication): string[] {
  try {
    const configService = app.get(ConfigService);
    const origins = configService.get<string[]>('cors.origins');
    if (origins && origins.length > 0) return origins;
  } catch {
    // ConfigModule not registered (e.g. minimal test modules) — read env directly.
  }
  return corsConfig().origins;
}

export function configureApp(app: INestApplication): void {
  app.use(correlationMiddleware);
  app.use(requestLoggingMiddleware);

  const expressApp = (app as NestExpressApplication).getHttpAdapter().getInstance();
  expressApp.disable('x-powered-by');

  app.enableCors({
    origin: resolveCorsOrigins(app),
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });

  app.use(json({ limit: '16kb' }));
  app.use(urlencoded({ extended: true, limit: '16kb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );
}

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  configureApp(app);
  return app;
}
