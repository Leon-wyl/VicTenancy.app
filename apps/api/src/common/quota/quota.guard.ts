import { Injectable, CanActivate, ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response, Request } from 'express';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { QuotaService } from './quota.service';
import type { Principal } from '../auth/principal';

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly quotaService: QuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // The chat UI uses several idempotent read endpoints for its initial
    // hydration and Realtime reconciliation. Charging those reads to the same
    // small budget as writes can prevent a user from loading their own history
    // before they have performed any costly action. This guard deliberately
    // protects state changes (in particular message submission, which creates
    // an agent job); read traffic is deliberately not charged to this
    // per-user write budget.
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    const principal = request.user as Principal | undefined;

    if (!principal?.sub) {
      return true;
    }

    const result = await this.quotaService.consume(principal.sub);

    if (!result.allowed) {
      const response = context.switchToHttp().getResponse<Response>();
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil(result.retry_after_seconds))));
      throw new HttpException('Rate limit exceeded', 429);
    }

    return true;
  }
}
