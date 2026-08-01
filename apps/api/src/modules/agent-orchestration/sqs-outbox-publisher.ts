import { Injectable, Logger, Optional } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { SqsClient } from '../../integrations/agent-runtime';

@Injectable()
export class SqsOutboxPublisher {
  private readonly logger = new Logger(SqsOutboxPublisher.name);

  constructor(
    private readonly outboxService: OutboxService,
    @Optional() private readonly sqsClient?: SqsClient,
  ) {}

  async tryPublish(jobId: string): Promise<void> {
    if (!this.sqsClient || !this.sqsClient.isConfigured()) {
      return;
    }

    try {
      const claim = await this.outboxService.claimForDispatch(jobId);
      if (!claim) return;

      try {
        await this.sqsClient.sendMessage({
          version: 1,
          jobId: claim.agentJobId,
          conversationId: claim.conversationId,
          deliveryId: claim.deliveryId,
        });

        await this.outboxService.markPublished(
          claim.outboxId,
          claim.dispatchLeaseToken,
        );
      } catch (error) {
        await this.outboxService.releaseDispatchLease(
          claim.outboxId,
          claim.dispatchLeaseToken,
        );
        throw error;
      }
    } catch (error) {
      this.logger.warn(
        `Best-effort outbox publish failed for job ${jobId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
