import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  INestApplication,
  Post,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { configureApp } from '../../src/bootstrap/app.factory';
import { JwtAuthGuard } from '../../src/common/auth/jwt.guard';
import { QuotaGuard } from '../../src/common/quota/quota.guard';
import { SupabaseAuthService } from '../../src/common/auth/supabase-auth.service';
import { QuotaService } from '../../src/common/quota/quota.service';
import { Public } from '../../src/common/auth/public.decorator';
import type { Principal } from '../../src/common/auth/principal';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRINCIPAL: Principal = {
  sub: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  email: 'test@example.com',
  role: 'authenticated',
  aud: 'authenticated',
};

// Test-only controller that always throws 500.
@Controller('test-error')
class TestErrorController {
  @Get()
  error() {
    throw new Error('forced 500');
  }
}

// Protected test controller.
@Controller('test-protected')
class TestProtectedController {
  @Get()
  ok() {
    return { ok: true };
  }

  @Post()
  create() {
    return { ok: true };
  }
}

// Public test controller (like health).
@Controller('test-public')
class TestPublicController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}

function getXRequestId(res: request.Response): string | null {
  const value = res.headers['x-request-id'];
  return (Array.isArray(value) ? value[0] : (value as string)) ?? null;
}

describe('HTTP pipeline (X-Request-Id, auth, quota, error handling)', () => {
  let app: INestApplication;
  let mockAuthService: jest.Mocked<Pick<SupabaseAuthService, 'verifyToken'>>;
  let mockQuotaService: jest.Mocked<Pick<QuotaService, 'consume' | 'getLimits'>>;

  beforeAll(async () => {
    mockAuthService = {
      verifyToken: jest.fn(),
    };

    mockQuotaService = {
      consume: jest.fn(),
      getLimits: jest.fn().mockReturnValue({ maxPerMinute: 20, maxPerDay: 200 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        TestErrorController,
        TestProtectedController,
        TestPublicController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: QuotaGuard },
        { provide: SupabaseAuthService, useValue: mockAuthService },
        { provide: QuotaService, useValue: mockQuotaService },
      ],
    }).compile();

    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('X-Request-Id on every response', () => {
    it('sets X-Request-Id on 200', async () => {
      mockAuthService.verifyToken.mockResolvedValue(PRINCIPAL);
      mockQuotaService.consume.mockResolvedValue({
        allowed: true,
        minute_count: 1,
        day_count: 1,
        retry_after_seconds: 0,
      });

      const res = await request(app.getHttpServer())
        .get('/test-protected')
        .set('Authorization', 'Bearer valid.token');

      expect(res.status).toBe(200);
      expect(getXRequestId(res)).toMatch(UUID_RE);
    });

    it('sets X-Request-Id on 401 (unauthorized)', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-protected');

      expect(res.status).toBe(401);
      expect(getXRequestId(res)).toMatch(UUID_RE);
    });

    it('sets X-Request-Id on 429 (rate limited write)', async () => {
      mockAuthService.verifyToken.mockResolvedValue(PRINCIPAL);
      mockQuotaService.consume.mockResolvedValue({
        allowed: false,
        minute_count: 20,
        day_count: 200,
        retry_after_seconds: 45,
      });

      const res = await request(app.getHttpServer())
        .post('/test-protected')
        .set('Authorization', 'Bearer valid.token');

      expect(res.status).toBe(429);
      expect(getXRequestId(res)).toMatch(UUID_RE);
      expect(res.headers['retry-after']).toBe('45');
    });

    it('sets X-Request-Id on 413 (oversized body)', async () => {
      mockAuthService.verifyToken.mockResolvedValue(PRINCIPAL);
      mockQuotaService.consume.mockResolvedValue({
        allowed: true,
        minute_count: 1,
        day_count: 1,
        retry_after_seconds: 0,
      });

      const bigBody = JSON.stringify({ data: 'x'.repeat(20_000) });

      const res = await request(app.getHttpServer())
        .post('/test-protected')
        .set('Authorization', 'Bearer valid.token')
        .set('Content-Type', 'application/json')
        .send(bigBody);

      expect(res.status).toBe(413);
      expect(getXRequestId(res)).toMatch(UUID_RE);
    });

    it('sets X-Request-Id on 500 (internal error)', async () => {
      mockAuthService.verifyToken.mockResolvedValue(PRINCIPAL);
      mockQuotaService.consume.mockResolvedValue({
        allowed: true,
        minute_count: 1,
        day_count: 1,
        retry_after_seconds: 0,
      });

      const res = await request(app.getHttpServer())
        .get('/test-error')
        .set('Authorization', 'Bearer valid.token');

      expect(res.status).toBe(500);
      expect(getXRequestId(res)).toMatch(UUID_RE);
    });
  });

  describe('X-Request-Id input validation', () => {
    it('preserves valid client-supplied X-Request-Id', async () => {
      mockAuthService.verifyToken.mockResolvedValue(PRINCIPAL);
      mockQuotaService.consume.mockResolvedValue({
        allowed: true,
        minute_count: 1,
        day_count: 1,
        retry_after_seconds: 0,
      });

      const clientId = 'deadbeef-1234-5678-9abc-def012345678';
      const res = await request(app.getHttpServer())
        .get('/test-protected')
        .set('Authorization', 'Bearer valid.token')
        .set('X-Request-Id', clientId);

      expect(res.status).toBe(200);
      expect(getXRequestId(res)).toBe(clientId);
    });

    it('regenerates non-UUID X-Request-Id', async () => {
      mockAuthService.verifyToken.mockResolvedValue(PRINCIPAL);
      mockQuotaService.consume.mockResolvedValue({
        allowed: true,
        minute_count: 1,
        day_count: 1,
        retry_after_seconds: 0,
      });

      const res = await request(app.getHttpServer())
        .get('/test-protected')
        .set('Authorization', 'Bearer valid.token')
        .set('X-Request-Id', 'not-a-uuid');

      expect(res.status).toBe(200);
      const responseId = getXRequestId(res);
      expect(responseId).toMatch(UUID_RE);
      expect(responseId).not.toBe('not-a-uuid');
    });
  });

  describe('quota guard: authenticated write routes consume quota', () => {
    it('does not consume quota for authenticated reads', async () => {
      mockAuthService.verifyToken.mockResolvedValue(PRINCIPAL);

      const res = await request(app.getHttpServer())
        .get('/test-protected')
        .set('Authorization', 'Bearer valid.token');

      expect(res.status).toBe(200);
      expect(mockQuotaService.consume).not.toHaveBeenCalled();
    });

    it('consumes quota for authenticated write requests', async () => {
      mockAuthService.verifyToken.mockResolvedValue(PRINCIPAL);
      mockQuotaService.consume.mockResolvedValue({
        allowed: true,
        minute_count: 5,
        day_count: 10,
        retry_after_seconds: 0,
      });

      const res = await request(app.getHttpServer())
        .post('/test-protected')
        .set('Authorization', 'Bearer valid.token');

      expect(res.status).toBe(201);
      expect(mockQuotaService.consume).toHaveBeenCalledWith(PRINCIPAL.sub);
    });

    it('returns 401 without quota consumption when no token', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-protected');

      expect(res.status).toBe(401);
      expect(mockQuotaService.consume).not.toHaveBeenCalled();
    });

    it('does not check auth or quota on @Public() routes', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-public');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(mockAuthService.verifyToken).not.toHaveBeenCalled();
      expect(mockQuotaService.consume).not.toHaveBeenCalled();
    });
  });

  describe('Retry-After header on 429', () => {
    it('sets Retry-After header in seconds', async () => {
      mockAuthService.verifyToken.mockResolvedValue(PRINCIPAL);
      mockQuotaService.consume.mockResolvedValue({
        allowed: false,
        minute_count: 20,
        day_count: 200,
        retry_after_seconds: 60,
      });

      const res = await request(app.getHttpServer())
        .post('/test-protected')
        .set('Authorization', 'Bearer valid.token');

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBe('60');
    });
  });
});
