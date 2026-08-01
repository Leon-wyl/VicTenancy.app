import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { AgentRuntimeClient } from '../../integrations/agent-runtime';
import { SqsClient } from '../../integrations/agent-runtime';
import { OutboxService } from './outbox.service';
import { JobClaimerService } from './job-claimer.service';
import { AgentJobProcessor } from './agent-job-processor';
import { JobPersistenceService } from './job-persistence.service';
import { JobFailureService } from './job-failure.service';
import { DispatcherService } from './dispatcher.service';
import { TerminalizerService } from './terminalizer.service';
import { SqsOutboxPublisher } from './sqs-outbox-publisher';

@Global()
@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [
    AgentRuntimeClient,
    SqsClient,
    OutboxService,
    JobClaimerService,
    JobPersistenceService,
    JobFailureService,
    AgentJobProcessor,
    DispatcherService,
    TerminalizerService,
    SqsOutboxPublisher,
  ],
  exports: [
    AgentRuntimeClient,
    SqsClient,
    OutboxService,
    AgentJobProcessor,
    DispatcherService,
    TerminalizerService,
    SqsOutboxPublisher,
  ],
})
export class AgentOrchestrationModule {}
