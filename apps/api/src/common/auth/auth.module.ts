import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt.guard';
import { SupabaseAuthService } from './supabase-auth.service';

@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthService, JwtAuthGuard],
  exports: [SupabaseAuthService, JwtAuthGuard],
})
export class AuthModule {}
