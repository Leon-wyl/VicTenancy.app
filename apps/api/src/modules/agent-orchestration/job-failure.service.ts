import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { JobClaim } from './job-claimer.service';
import { AgentRuntimeError } from '../../integrations/agent-runtime';
import {
  retryBackoffSeconds,
  isExhausted,
} from './retry-policy';

@Injectable()
export class JobFailureService {
  constructor(private readonly prisma: PrismaService) {}

  async handleTerminalFailure(
    claim: JobClaim,
    error: AgentRuntimeError,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE agent_jobs
       SET status = 'failed',
           completed_at = now(),
           lease_token = NULL,
           lease_until = NULL,
           delivery_id = NULL,
           error_metadata = $1::jsonb
       WHERE id = $2::uuid
         AND status = 'processing'
         AND lease_token = $3::uuid
         AND delivery_id = $4::uuid`,
      JSON.stringify({
        code: error.name,
        retryable: false,
        httpStatus: error.statusCode,
        message: error.message.substring(0, 500),
      }),
      claim.id,
      claim.leaseToken,
      claim.deliveryId,
    );
  }

  async handleRetryableFailure(
    claim: JobClaim,
    attempt: number,
  ): Promise<void> {
    if (isExhausted(attempt)) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE agent_jobs
         SET status = 'failed',
             completed_at = now(),
             lease_token = NULL,
             lease_until = NULL,
             delivery_id = NULL,
             error_metadata = $1::jsonb
         WHERE id = $2::uuid
           AND status = 'processing'
           AND lease_token = $3::uuid
           AND delivery_id = $4::uuid`,
        JSON.stringify({
          code: 'MAX_ATTEMPTS_EXHAUSTED',
          retryable: false,
          attempt,
        }),
        claim.id,
        claim.leaseToken,
        claim.deliveryId,
      );
      return;
    }

    const backoffSeconds = retryBackoffSeconds(attempt);
    const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000);

    await this.prisma.$transaction(async (tx) => {
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
           AND delivery_id = $4::uuid`,
        nextAttemptAt,
        claim.id,
        claim.leaseToken,
        claim.deliveryId,
      );

      if (updated === 0) {
        return;
      }

      await tx.$executeRawUnsafe(
        `UPDATE agent_job_outbox
         SET published_at = NULL,
             available_at = $1::timestamptz,
             dispatch_lease_token = NULL,
             dispatch_lease_until = NULL,
             delivery_id = NULL
         WHERE agent_job_id = $2::uuid`,
        nextAttemptAt,
        claim.id,
      );
    });
  }
}
