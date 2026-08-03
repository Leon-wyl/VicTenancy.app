import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { QuotaGuard } from '../../src/common/quota/quota.guard';
import { QuotaService } from '../../src/common/quota/quota.service';
import type { Principal } from '../../src/common/auth/principal';
import type { Response } from 'express';

function createMockContext(
  user?: Principal,
  method = 'POST',
): ExecutionContext {
  const setHeader = jest.fn();
  const request = { user, method };
  const response = { setHeader } as unknown as Response;
  const handler = jest.fn();
  const context = {
    getHandler: () => handler,
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };
  return context as unknown as ExecutionContext;
}

describe('QuotaGuard', () => {
  let guard: QuotaGuard;
  let quotaService: jest.Mocked<QuotaService>;
  let reflectorMock: { getAllAndOverride: jest.Mock };

  const principal: Principal = {
    sub: '12345678-1234-1234-1234-123456789abc',
    email: 'user@example.com',
    role: 'authenticated',
    aud: 'authenticated',
  };

  beforeEach(async () => {
    quotaService = {
      consume: jest.fn(),
      getLimits: jest.fn(),
    } as unknown as jest.Mocked<QuotaService>;

    reflectorMock = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaGuard,
        { provide: Reflector, useValue: reflectorMock },
        { provide: QuotaService, useValue: quotaService },
      ],
    }).compile();

    guard = module.get<QuotaGuard>(QuotaGuard);
  });

  describe('@Public() bypass', () => {
    it('allows access on routes marked @Public()', async () => {
      reflectorMock.getAllAndOverride.mockReturnValue(true);
      const ctx = createMockContext(undefined);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(quotaService.consume).not.toHaveBeenCalled();
    });
  });

  describe('no principal on request', () => {
    it('allows access when request.user is undefined', async () => {
      const ctx = createMockContext(undefined);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(quotaService.consume).not.toHaveBeenCalled();
    });

    it('allows access when request.user.sub is missing', async () => {
      const ctx = createMockContext({ sub: '' } as Principal);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(quotaService.consume).not.toHaveBeenCalled();
    });
  });

  describe('safe methods', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])(
      'does not consume quota for %s requests',
      async (method) => {
        const ctx = createMockContext(principal, method);

        await expect(guard.canActivate(ctx)).resolves.toBe(true);
        expect(quotaService.consume).not.toHaveBeenCalled();
      },
    );
  });

  describe('quota consumption', () => {
    it('allows access when under quota', async () => {
      quotaService.consume.mockResolvedValue({
        allowed: true,
        minute_count: 5,
        day_count: 42,
        retry_after_seconds: 0,
      });
      const ctx = createMockContext(principal);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(quotaService.consume).toHaveBeenCalledWith(principal.sub);
    });

    it('denies with 429 and Retry-After when over quota', async () => {
      quotaService.consume.mockResolvedValue({
        allowed: false,
        minute_count: 20,
        day_count: 200,
        retry_after_seconds: 45,
      });
      const ctx = createMockContext(principal);

      await expect(guard.canActivate(ctx)).rejects.toThrow('Rate limit exceeded');

      const response = ctx.switchToHttp().getResponse<Response>();
      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '45');
    });

    it('returns 429 HttpException', async () => {
      quotaService.consume.mockResolvedValue({
        allowed: false,
        minute_count: 20,
        day_count: 10,
        retry_after_seconds: 30,
      });
      const ctx = createMockContext(principal);

      try {
        await guard.canActivate(ctx);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(429);
      }
    });
  });

  it('never emits a zero Retry-After value', async () => {
    quotaService.consume.mockResolvedValue({
      allowed: false,
      minute_count: 20,
      day_count: 200,
      retry_after_seconds: 0,
    });
    const ctx = createMockContext(principal);

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      status: 429,
    });
    const response = ctx.switchToHttp().getResponse<Response>();
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '1');
  });
});
