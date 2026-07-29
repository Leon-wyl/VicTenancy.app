import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt.guard';
import { SupabaseAuthService } from './supabase-auth.service';

@Module({
  controllers: [AuthController],
  providers: [
    SupabaseAuthService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [SupabaseAuthService],
})
export class AuthModule {}
