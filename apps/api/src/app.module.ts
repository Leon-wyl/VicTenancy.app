import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { AuthModule } from './common/auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { QuotaModule } from './common/quota/quota.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { MessageModule } from './modules/message/message.module';
import { JobModule } from './modules/job/job.module';
import { CitationModule } from './modules/citation/citation.module';
import { AgentOrchestrationModule } from './modules/agent-orchestration/agent-orchestration.module';
import { JwtAuthGuard } from './common/auth/jwt.guard';
import { QuotaGuard } from './common/quota/quota.guard';
import { quotaConfig } from './common/quota/quota.config';
import { databaseConfig } from './database/database.config';
import { corsConfig } from './common/cors/cors.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [quotaConfig, databaseConfig, corsConfig],
    }),
    DatabaseModule,
    AuthModule,
    QuotaModule,
    ConversationModule,
    MessageModule,
    JobModule,
    CitationModule,
    AgentOrchestrationModule,
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
