import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../app.module';
import { correlationMiddleware } from '../common/correlation/correlation.middleware';
import { requestLoggingMiddleware } from '../common/logging/request-logging.middleware';

export function configureApp(app: INestApplication): void {
  app.use(correlationMiddleware);
  app.use(requestLoggingMiddleware);

  const expressApp = (app as NestExpressApplication).getHttpAdapter().getInstance();
  expressApp.disable('x-powered-by');

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
