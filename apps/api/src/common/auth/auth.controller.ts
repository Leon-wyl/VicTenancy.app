import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from './principal';

@Controller('auth')
export class AuthController {
  @Get('me')
  me(@Req() req: Request) {
    const principal = req.user as Principal;
    return {
      sub: principal.sub,
      email: principal.email,
      role: principal.role,
      aud: principal.aud,
    };
  }
}
