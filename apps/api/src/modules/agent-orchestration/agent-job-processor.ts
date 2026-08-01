import { Injectable, Logger } from '@nestjs/common';
import { JobClaimerService } from './job-claimer.service';
import { JobPersistenceService } from './job-persistence.service';
import { JobFailureService } from './job-failure.service';
import { AgentRuntimeClient } from '../../integrations/agent-runtime';
import { AgentRuntimeError } from '../../integrations/agent-runtime';

export type ProcessResult = 'succeeded' | 'noop' | 'failed' | 'requeued';

@Injectable()
export class AgentJobProcessor {
  private readonly logger = new Logger(AgentJobProcessor.name);

  constructor(
    private readonly claimer: JobClaimerService,
    private readonly persistence: JobPersistenceService,
    private readonly failure: JobFailureService,
    private readonly client: AgentRuntimeClient,
  ) {}

  async processJob(
    jobId: string,
    deliveryId: string,
  ): Promise<ProcessResult> {
    const claimed = await this.claimer.claimJob(jobId, deliveryId);
    if (!claimed) {
      return 'noop';
    }

    this.logger.log(`Processing job ${jobId} attempt ${claimed.job.attempt}`);

    try {
      const response = await this.client.invoke({
        question: claimed.triggerMessage.content,
        requestId: claimed.job.correlationId,
        threadId: claimed.job.conversationId,
        userId: claimed.job.ownerUserId,
        conversationId: claimed.job.conversationId,
        messageId: claimed.job.triggerMessageId,
      });

      await this.persistence.persistSuccess(claimed.job, response);
      this.logger.log(`Job ${jobId} succeeded`);
      return 'succeeded';
    } catch (error: unknown) {
      const classified = error instanceof AgentRuntimeError
        ? error
        : new AgentRuntimeError(
            error instanceof Error ? error.message : 'Unknown error',
            true,
          );

      if (!classified.retryable) {
        await this.failure.handleTerminalFailure(claimed.job, classified);
        this.logger.warn(`Job ${jobId} failed with terminal error`);
        return 'failed';
      }

      await this.failure.handleRetryableFailure(
        claimed.job,
        claimed.job.attempt,
      );
      this.logger.log(
        `Job ${jobId} requeued for retry (attempt ${claimed.job.attempt})`,
      );
      return 'requeued';
    }
  }
}
