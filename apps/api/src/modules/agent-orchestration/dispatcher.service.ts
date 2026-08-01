import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OutboxService } from './outbox.service';
import { SqsClient } from '../../integrations/agent-runtime';
import { RETRY_SCHEDULE } from './retry-policy';

@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
    private readonly sqsClient: SqsClient,
  ) {}

  async runDueOutboxDispatch(maxJobs: number): Promise<{
    dispatched: number;
    recovered: number;
  }> {
    const recovered = await this.recoverExpiredLeases();
    const dispatched = await this.dispatchDueOutbox(maxJobs);

    return { dispatched, recovered };
  }

  async recoverExpiredLeases(): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<{
      id: string;
      attempt: number;
      max_attempts: number;
      lease_token: string;
    }[]>(
      `SELECT id, attempt, max_attempts, lease_token
       FROM agent_jobs
       WHERE status = 'processing'
         AND lease_until IS NOT NULL
         AND lease_until < now()
       LIMIT 100`,
    );

    let recovered = 0;

    for (const row of rows) {
      const didRecover = await this.prisma.$transaction(async (tx) => {
        const exhausted = row.attempt >= row.max_attempts;

        if (exhausted) {
          const updated = await tx.$executeRawUnsafe(
            `UPDATE agent_jobs
             SET status = 'failed',
                 completed_at = now(),
                 lease_token = NULL,
                 lease_until = NULL,
                 delivery_id = NULL,
                 error_metadata = '{"code":"LEASE_EXPIRED","retryable":false}'::jsonb
             WHERE id = $1::uuid
               AND status = 'processing'
               AND lease_token = $2::uuid
               AND lease_until < now()`,
            row.id,
            row.lease_token,
          );
          return updated > 0;
        }

        const backoffSec =
          RETRY_SCHEDULE[row.attempt] ?? 60;
        const nextAttemptAt = new Date(
          Date.now() + backoffSec * 1000,
        );

        const updated = await tx.$executeRawUnsafe(
          `UPDATE agent_jobs
           SET status = 'queued',
               lease_token = NULL,
               lease_until = NULL,
               delivery_id = NULL,
               next_attempt_at = $1::timestamptz
           WHERE id = $2::uuid
             AND status = 'processing'
             AND lease_token = $3::uuid
             AND lease_until < now()`,
          nextAttemptAt,
          row.id,
          row.lease_token,
        );

        if (updated === 0) return false;

        await tx.$executeRawUnsafe(
          `UPDATE agent_job_outbox
           SET published_at = NULL,
               available_at = $1::timestamptz,
               dispatch_lease_token = NULL,
               dispatch_lease_until = NULL,
               delivery_id = NULL
           WHERE agent_job_id = $2::uuid`,
          nextAttemptAt,
          row.id,
        );
        return true;
      });

      if (didRecover) recovered++;
    }

    return recovered;
  }

  async dispatchDueOutbox(maxJobs: number): Promise<number> {
    const dueRows = await this.outboxService.findDueOutboxRows(maxJobs);
    let dispatched = 0;

    for (const row of dueRows) {
      try {
        const claim = await this.outboxService.claimForDispatch(
          row.agentJobId,
        );

        if (!claim) continue;

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
          dispatched++;
        } catch (error) {
          this.logger.warn(
            `Outbox dispatch send failed for ${row.outboxId}: ${error instanceof Error ? error.message : error}`,
          );
          await this.outboxService.releaseDispatchLease(
            claim.outboxId,
            claim.dispatchLeaseToken,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Outbox claim failed for ${row.outboxId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return dispatched;
  }
}
