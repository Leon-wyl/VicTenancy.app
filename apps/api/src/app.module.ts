import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { AuthModule } from './common/auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { QuotaModule } from './common/quota/quota.module';
import { JwtAuthGuard } from './common/auth/jwt.guard';
import { QuotaGuard } from './common/quota/quota.guard';
import { quotaConfig } from './common/quota/quota.config';
import { databaseConfig } from './database/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [quotaConfig, databaseConfig],
    }),
    DatabaseModule,
    AuthModule,
    QuotaModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: QuotaGuard,
    },
  ],
})
export class AppModule {}
