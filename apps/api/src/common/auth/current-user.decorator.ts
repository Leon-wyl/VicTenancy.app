import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Principal } from './principal';

export const CurrentUser = createParamDecorator(
  (data: keyof Principal | undefined, ctx: ExecutionContext): Principal | string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as Principal;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
