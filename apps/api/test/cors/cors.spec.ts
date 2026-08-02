import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import type { ExecutionContext } from '@nestjs/common';
import { CitationModule } from '../../src/modules/citation/citation.module';
import { DatabaseModule } from '../../src/database/database.module';
import { PrismaService } from '../../src/database/prisma.service';
import { corsConfig } from '../../src/common/cors/cors.config';
import { correlationMiddleware } from '../../src/common/correlation/correlation.middleware';
import type { Principal } from '../../src/common/auth/principal';

const PRINCIPAL: Principal = {
  sub: 'user-1',
  email: 'a@b.com',
  role: 'authenticated',
  aud: 'authenticated',
};

const mockJwtGuard = {
  canActivate: jest.fn().mockImplementation((ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user: Principal }>();
    req.user = PRINCIPAL;
    return true;
  }),
};

const mockQuotaGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

describe('corsConfig', () => {
  const ORIGINAL = process.env.CORS_ORIGINS;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = ORIGINAL;
    }
  });

  it('defaults to http://localhost:3000 when CORS_ORIGINS is unset', () => {
    delete process.env.CORS_ORIGINS;
    expect(corsConfig().origins).toEqual(['http://localhost:3000']);
  });

  it('normalizes entries: trims whitespace, strips trailing slash, lowercases host', () => {
    process.env.CORS_ORIGINS =
      ' https://APP.Example.com/ , http://localhost:3000/ ';
    expect(corsConfig().origins).toEqual([
      'https://app.example.com',
      'http://localhost:3000',
    ]);
  });

  it('fails fast on a malformed entry', () => {
    process.env.CORS_ORIGINS = 'not-a-url';
    expect(() => corsConfig()).toThrow(/not a valid origin/);
  });

  it('fails fast when an entry includes a path', () => {
    process.env.CORS_ORIGINS = 'http://localhost:3000/app';
    expect(() => corsConfig()).toThrow(/must not include a path/);
  });

  it('fails fast on a non-http(s) scheme', () => {
    process.env.CORS_ORIGINS = 'ftp://example.com';
    expect(() => corsConfig()).toThrow(/http or https/);
  });

  it('fails fast on an empty entry', () => {
    process.env.CORS_ORIGINS = 'http://localhost:3000,,http://localhost:3001';
    expect(() => corsConfig()).toThrow(/empty entry/);
  });
});

describe('CORS headers (http)', () => {
  let app: INestApplication;

  const convId = '00000000-0000-0000-0000-000000000001';
  const messageId = '00000000-0000-0000-0000-000000000002';

  beforeAll(async () => {
    process.env.CORS_ORIGINS = 'http://localhost:3000';

    const prismaMock = {
      conversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: convId,
          ownerUserId: 'user-1',
        }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue({
          id: messageId,
          conversationId: convId,
        }),
      },
      citation: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [corsConfig] }),
        DatabaseModule,
        CitationModule,
      ],
      providers: [
        { provide: APP_GUARD, useValue: mockJwtGuard },
        { provide: APP_GUARD, useValue: mockQuotaGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(correlationMiddleware);

    // Mirror the production CORS setup from bootstrap/app.factory.ts.
    const configService = app.get(ConfigService);
    const origins = configService.get<string[]>('cors.origins') ?? [
      'http://localhost:3000',
    ];
    app.enableCors({
      origin: origins,
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'Idempotency-Key',
        'X-Request-Id',
      ],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        stopAtFirstError: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    delete process.env.CORS_ORIGINS;
    await app.close();
  });

  it('answers preflight with allow-origin and the chat request headers', async () => {
    const res = await request(app.getHttpServer())
      .options(
        `/v1/conversations/${convId}/messages/${messageId}/citations`,
      )
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .set(
        'Access-Control-Request-Headers',
        'authorization,content-type,idempotency-key,x-request-id',
      );

    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    const allowHeaders = res.headers['access-control-allow-headers'] ?? '';
    expect(allowHeaders.toLowerCase()).toContain('authorization');
    expect(allowHeaders.toLowerCase()).toContain('content-type');
    expect(allowHeaders.toLowerCase()).toContain('idempotency-key');
    expect(allowHeaders.toLowerCase()).toContain('x-request-id');
  });

  it('exposes X-Request-Id and Retry-After on actual responses', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/conversations/${convId}/messages/${messageId}/citations`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    const exposeHeaders = res.headers['access-control-expose-headers'] ?? '';
    expect(exposeHeaders.toLowerCase()).toContain('x-request-id');
    expect(exposeHeaders.toLowerCase()).toContain('retry-after');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('does not allow a non-configured origin', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/conversations/${convId}/messages/${messageId}/citations`)
      .set('Origin', 'https://evil.example.com')
      .set('Authorization', 'Bearer test-token');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
