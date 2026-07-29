import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SupabaseAuthService } from './supabase-auth.service';
import type { Principal } from './principal';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: SupabaseAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing authorization header');
    }

    try {
      const principal: Principal = await this.authService.verifyToken(token);
      request.user = principal;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: { headers: Record<string, string | string[] | undefined> }): string | null {
    const authorization = request.headers.authorization;
    if (!authorization || Array.isArray(authorization)) {
      return null;
    }
    if (!authorization.startsWith('Bearer ')) {
      return null;
    }
    return authorization.slice(7);
  }
}
