import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { randomUUID } from 'crypto';

export interface OutboxClaim {
  outboxId: string;
  agentJobId: string;
  conversationId: string;
  deliveryId: string;
  dispatchLeaseToken: string;
}

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async claimForDispatch(agentJobId: string): Promise<OutboxClaim | null> {
    const leaseToken = randomUUID();
    const leaseSeconds = 90;

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<{
        id: string;
        agent_job_id: string;
        delivery_id: string;
      }[]>(
        `UPDATE agent_job_outbox o
         SET dispatch_lease_token = $1::uuid,
             dispatch_lease_until = now() + ($2::int || ' seconds')::interval,
             delivery_id = gen_random_uuid(),
             dispatch_count = dispatch_count + 1
         FROM agent_jobs j
         WHERE o.id = (
           SELECT candidate.id
           FROM agent_job_outbox candidate
           JOIN agent_jobs candidate_job ON candidate_job.id = candidate.agent_job_id
           WHERE candidate.agent_job_id = $3::uuid
             AND candidate.published_at IS NULL
             AND candidate.available_at <= now()
             AND (candidate.dispatch_lease_until IS NULL OR candidate.dispatch_lease_until < now())
             AND candidate_job.status = 'queued'
           LIMIT 1
           FOR UPDATE OF candidate SKIP LOCKED
         )
           AND j.id = o.agent_job_id
           AND j.status = 'queued'
         RETURNING o.id, o.agent_job_id, o.delivery_id`,
        leaseToken,
        leaseSeconds,
        agentJobId,
      );

      if (rows.length === 0) return null;

      const claim = rows[0];
      const jobs = await tx.$queryRawUnsafe<{ conversation_id: string }[]>(
        `SELECT conversation_id
         FROM agent_jobs
         WHERE id = $1::uuid AND status = 'queued'`,
        agentJobId,
      );
      if (jobs.length === 0) {
        throw new Error('Outbox job disappeared during claim');
      }

      const jobUpdate = await tx.$executeRawUnsafe(
        `UPDATE agent_jobs
         SET delivery_id = $1::uuid
         WHERE id = $2::uuid
           AND status = 'queued'
         AND EXISTS (
             SELECT 1 FROM agent_job_outbox
             WHERE id = $3::uuid
               AND dispatch_lease_token = $4::uuid
           )`,
        claim.delivery_id,
        agentJobId,
        claim.id,
        leaseToken,
      );

      if (jobUpdate === 0) {
        throw new Error('Outbox dispatch fence failed');
      }

      return {
        outboxId: claim.id,
        agentJobId: claim.agent_job_id,
        conversationId: jobs[0].conversation_id,
        deliveryId: claim.delivery_id,
        dispatchLeaseToken: leaseToken,
      };
    });
  }

  async markPublished(outboxId: string, leaseToken: string): Promise<boolean> {
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE agent_job_outbox
       SET published_at = now(),
           dispatch_lease_token = NULL,
           dispatch_lease_until = NULL
       WHERE id = $1::uuid
         AND dispatch_lease_token = $2::uuid`,
      outboxId,
      leaseToken,
    );
    return result > 0;
  }

  async releaseDispatchLease(outboxId: string, leaseToken: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE agent_job_outbox
       SET dispatch_lease_token = NULL,
           dispatch_lease_until = NULL,
           delivery_id = NULL
       WHERE id = $1::uuid
         AND dispatch_lease_token = $2::uuid`,
      outboxId,
      leaseToken,
    );
  }

  async findDueOutboxRows(
    limit: number,
  ): Promise<{ outboxId: string; agentJobId: string; conversationId: string }[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      { id: string; agent_job_id: string; conversation_id: string }[]
    >(
      `SELECT o.id, o.agent_job_id, j.conversation_id
       FROM agent_job_outbox o
       JOIN agent_jobs j ON j.id = o.agent_job_id
       WHERE o.published_at IS NULL
         AND o.available_at <= now()
         AND (o.dispatch_lease_until IS NULL OR o.dispatch_lease_until < now())
         AND j.status = 'queued'
       ORDER BY o.available_at
       LIMIT $1::int`,
      limit,
    );
    return rows.map((r) => ({
      outboxId: r.id,
      agentJobId: r.agent_job_id,
      conversationId: r.conversation_id,
    }));
  }

  async resetForRetry(
    agentJobId: string,
    nextAttemptAt: Date,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE agent_job_outbox
       SET published_at = NULL,
           available_at = $2::timestamptz,
           dispatch_lease_token = NULL,
           dispatch_lease_until = NULL,
           delivery_id = NULL
       WHERE agent_job_id = $1::uuid`,
      agentJobId,
      nextAttemptAt,
    );
  }
}
