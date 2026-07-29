import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../../src/common/auth/auth.controller';
import { SupabaseAuthService } from '../../src/common/auth/supabase-auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: SupabaseAuthService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('GET /auth/me', () => {
    it('returns principal summary when user is attached to request', () => {
      const mockReq = {
        user: {
          sub: '12345678-1234-1234-1234-123456789abc',
          email: 'user@example.com',
          role: 'authenticated',
          aud: 'authenticated',
        },
      };

      const result = controller.me(mockReq as never);
      expect(result).toEqual({
        sub: '12345678-1234-1234-1234-123456789abc',
        email: 'user@example.com',
        role: 'authenticated',
        aud: 'authenticated',
      });
    });

    it('handles principal with empty email', () => {
      const mockReq = {
        user: {
          sub: '87654321-4321-4321-4321-cba987654321',
          email: '',
          role: 'authenticated',
          aud: 'authenticated',
        },
      };

      const result = controller.me(mockReq as never);
      expect(result).toEqual({
        sub: '87654321-4321-4321-4321-cba987654321',
        email: '',
        role: 'authenticated',
        aud: 'authenticated',
      });
    });
  });
});
