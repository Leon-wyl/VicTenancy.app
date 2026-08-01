import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { randomUUID } from 'crypto';

export interface JobClaim {
  id: string;
  conversationId: string;
  triggerMessageId: string;
  ownerUserId: string;
  correlationId: string;
  attempt: number;
  maxAttempts: number;
  leaseToken: string;
  deliveryId: string;
}

export interface TriggerMessageData {
  id: string;
  content: string;
  authorRole: string;
}

export interface JobWithMessage {
  job: JobClaim;
  triggerMessage: TriggerMessageData;
  conversation: { id: string; ownerUserId: string };
}

@Injectable()
export class JobClaimerService {
  constructor(private readonly prisma: PrismaService) {}

  async claimJob(
    jobId: string,
    payloadDeliveryId: string,
  ): Promise<JobWithMessage | null> {
    const leaseToken = randomUUID();
    const leaseSeconds = 120;

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRawUnsafe<
        {
          id: string;
          conversation_id: string;
          trigger_message_id: string;
          owner_user_id: string;
          correlation_id: string;
          attempt: number;
          max_attempts: number;
          lease_token: string;
          delivery_id: string;
        }[]
      >(
        `UPDATE agent_jobs
         SET status = 'processing',
             attempt = attempt + 1,
             lease_token = $1::uuid,
             lease_until = now() + ($2::int || ' seconds')::interval,
             delivery_id = $3::uuid
         WHERE id = $4::uuid
           AND status = 'queued'
           AND attempt < max_attempts
           AND delivery_id = $3::uuid
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         RETURNING id, conversation_id, trigger_message_id, owner_user_id,
                   correlation_id, attempt, max_attempts,
                   lease_token, delivery_id`,
        leaseToken,
        leaseSeconds,
        payloadDeliveryId,
        jobId,
      );

      if (claimed.length === 0) {
        return null;
      }

      const row = claimed[0];

      const message = await tx.$queryRawUnsafe<
        { id: string; content: string; author_role: string }[]
      >(
        `SELECT id, content, author_role FROM messages WHERE id = $1::uuid`,
        row.trigger_message_id,
      );

      if (message.length === 0) {
        throw new Error('Trigger message not found');
      }

      const conversation = await tx.$queryRawUnsafe<
        { id: string; owner_user_id: string }[]
      >(
        `SELECT id, owner_user_id FROM conversations WHERE id = $1::uuid`,
        row.conversation_id,
      );

      if (conversation.length === 0) {
        throw new Error('Conversation not found');
      }

      return {
        job: {
          id: row.id,
          conversationId: row.conversation_id,
          triggerMessageId: row.trigger_message_id,
          ownerUserId: row.owner_user_id,
          correlationId: row.correlation_id,
          attempt: row.attempt,
          maxAttempts: row.max_attempts,
          leaseToken: row.lease_token,
          deliveryId: row.delivery_id,
        },
        triggerMessage: {
          id: message[0].id,
          content: message[0].content,
          authorRole: message[0].author_role,
        },
        conversation: {
          id: conversation[0].id,
          ownerUserId: conversation[0].owner_user_id,
        },
      };
    });
  }
}
