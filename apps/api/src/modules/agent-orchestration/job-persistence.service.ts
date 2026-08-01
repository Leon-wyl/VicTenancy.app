import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { VALID_JURISDICTIONS } from '../../integrations/agent-runtime/agent-response.types';
import type { AgentResponse } from '../../integrations/agent-runtime';
import { JobClaim } from './job-claimer.service';

@Injectable()
export class JobPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async persistSuccess(
    claim: JobClaim,
    response: AgentResponse,
  ): Promise<string> {
    const content =
      response.status === 'clarification'
        ? (response.clarification ?? '')
        : (response.answer ?? '');

    const metadata = {
      agentJobId: claim.id,
      correlationId: claim.correlationId,
      status: response.status,
      selectedJurisdiction: response.selected_jurisdiction ?? null,
      fallbackReason: response.fallback_reason ?? null,
      citationVerifiedRate: response.citation_verified_rate ?? null,
      latencyMs: response.latency_ms ?? null,
      traceId: response.trace_id ?? null,
    };

    return this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: claim.conversationId,
          authorRole: 'assistant',
          content,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      const citations = (response.verified_citations ?? [])
        .filter((label): label is string => !!label && label.trim().length > 0)
        .slice(0, 50);

      for (const label of citations) {
        let jurisdiction = 'VIC';
        if (
          response.selected_jurisdiction &&
          VALID_JURISDICTIONS.includes(
            response.selected_jurisdiction as (typeof VALID_JURISDICTIONS)[number],
          )
        ) {
          jurisdiction = response.selected_jurisdiction;
        }

        await tx.citation.create({
          data: {
            messageId: msg.id,
            label,
            jurisdiction,
            sourceChunkId: null,
          },
        });
      }

      const updated = await tx.$executeRawUnsafe(
        `UPDATE agent_jobs
         SET status = 'succeeded',
             assistant_message_id = $1::uuid,
             completed_at = now(),
             lease_token = NULL,
             lease_until = NULL,
             delivery_id = NULL,
             error_metadata = NULL
         WHERE id = $2::uuid
           AND status = 'processing'
           AND lease_token = $3::uuid
           AND delivery_id = $4::uuid`,
        msg.id,
        claim.id,
        claim.leaseToken,
        claim.deliveryId,
      );

      if (updated === 0) {
        throw new Error('Job persistence fenced update failed');
      }

      await tx.$executeRawUnsafe(
        `UPDATE conversations
         SET last_activity_at = now()
         WHERE id = $1::uuid`,
        claim.conversationId,
      );

      return msg.id;
    });
  }
}
