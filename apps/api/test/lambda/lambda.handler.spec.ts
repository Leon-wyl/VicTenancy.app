/* eslint-disable @typescript-eslint/no-explicit-any */
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../../src/common/auth/auth.module';
import { QuotaModule } from '../../src/common/quota/quota.module';
import { DatabaseModule } from '../../src/database/database.module';
import { ConfigModule } from '@nestjs/config';
import { quotaConfig } from '../../src/common/quota/quota.config';
import { databaseConfig } from '../../src/database/database.config';
import { HealthController } from '../../src/health/health.controller';
import { JwtAuthGuard } from '../../src/common/auth/jwt.guard';
import { SupabaseAuthService } from '../../src/common/auth/supabase-auth.service';
import serverlessExpress from '@codegenie/serverless-express';

function buildApiGwEvent(
  method: string,
  path: string,
  headers: Record<string, string> = {},
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      ...headers,
    },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.execute-api.ap-southeast-2.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 1700000000000,
    },
    body: undefined,
    isBase64Encoded: false,
  };
}

async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: [],
        load: [quotaConfig, databaseConfig],
      }),
      DatabaseModule,
      AuthModule,
      QuotaModule,
    ],
    controllers: [HealthController],
    providers: [
      {
        provide: APP_GUARD,
        useClass: JwtAuthGuard,
      },
      {
        provide: SupabaseAuthService,
        useValue: {},
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('lambda handler — HTTP routing', () => {
  it('GET /health returns 200 with status ok', async () => {
    const app = await createTestApp();
    const expressApp = app.getHttpAdapter().getInstance();
    const wrappedHandler = serverlessExpress({ app: expressApp });

    const event = buildApiGwEvent('GET', '/health');
    const fn = wrappedHandler as any;
    const result = await fn(event, {} as any);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('ok');
    await app.close();
  });

  it('GET /auth/me without token returns 401', async () => {
    const app = await createTestApp();
    const expressApp = app.getHttpAdapter().getInstance();
    const wrappedHandler = serverlessExpress({ app: expressApp });

    const event = buildApiGwEvent('GET', '/auth/me');
    const fn = wrappedHandler as any;
    const result = await fn(event, {} as any);

    expect(result.statusCode).toBe(401);
    await app.close();
  });
});
