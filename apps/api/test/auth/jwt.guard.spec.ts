import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../src/common/auth/jwt.guard';
import { SupabaseAuthService } from '../../src/common/auth/supabase-auth.service';
import type { Principal } from '../../src/common/auth/principal';

function createMockContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers };
  const handler = jest.fn();
  const context = {
    getHandler: () => handler,
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
  return context as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let authService: jest.Mocked<SupabaseAuthService>;
  let reflectorMock: { getAllAndOverride: jest.Mock };

  beforeEach(async () => {
    authService = {
      verifyToken: jest.fn(),
    } as unknown as jest.Mocked<SupabaseAuthService>;

    reflectorMock = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: Reflector, useValue: reflectorMock },
        { provide: SupabaseAuthService, useValue: authService },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  describe('missing or malformed Authorization header', () => {
    it('rejects when Authorization header is missing', async () => {
      const ctx = createMockContext({});
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toThrow('Missing authorization header');
    });

    it('rejects when Authorization is not Bearer', async () => {
      const ctx = createMockContext({ authorization: 'Basic dGVzdDp0ZXN0' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when Authorization is empty string', async () => {
      const ctx = createMockContext({ authorization: '' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('token verification failures', () => {
    it('rejects expired tokens with 401', async () => {
      authService.verifyToken.mockRejectedValue(new Error('token expired'));
      const ctx = createMockContext({ authorization: 'Bearer expired.token.here' });
      await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired token');
    });

    it('rejects tokens with wrong issuer', async () => {
      authService.verifyToken.mockRejectedValue(new Error('unexpected issuer'));
      const ctx = createMockContext({ authorization: 'Bearer wrong.issuer.token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired token');
    });

    it('rejects tokens with wrong audience', async () => {
      authService.verifyToken.mockRejectedValue(new Error('unexpected audience'));
      const ctx = createMockContext({ authorization: 'Bearer wrong.aud.token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired token');
    });

    it('rejects tokens with wrong role', async () => {
      authService.verifyToken.mockRejectedValue(new Error('unexpected role'));
      const ctx = createMockContext({ authorization: 'Bearer wrong.role.token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired token');
    });

    it('rejects unverifiable JWKS tokens', async () => {
      authService.verifyToken.mockRejectedValue(new Error('no matching key'));
      const ctx = createMockContext({ authorization: 'Bearer unverifiable.token.here' });
      await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired token');
    });
  });

  describe('valid token', () => {
    it('attaches principal to request and allows access', async () => {
      const principal: Principal = {
        sub: '12345678-1234-1234-1234-123456789abc',
        email: 'user@example.com',
        role: 'authenticated',
        aud: 'authenticated',
      };
      authService.verifyToken.mockResolvedValue(principal);

      const ctx = createMockContext({ authorization: 'Bearer valid.token.here' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      const request = ctx.switchToHttp().getRequest();
      expect(request.user).toEqual(principal);
    });
  });

  describe('@Public() bypass', () => {
    it('allows access on routes marked @Public()', async () => {
      reflectorMock.getAllAndOverride.mockReturnValue(true);
      const ctx = createMockContext({});

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(authService.verifyToken).not.toHaveBeenCalled();
    });
  });
});
