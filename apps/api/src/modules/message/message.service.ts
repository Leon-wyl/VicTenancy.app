import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AuthorRole, JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageSummaryDto } from './dto/message-summary.dto';
import { JobSummaryDto } from './dto/job-summary.dto';
import { CreateMessageResponseDto } from './dto/create-message-response.dto';
import { PageResponse } from '../../common/pagination/page-response.dto';
import {
  decodeMessageCursor,
  encodeCursor,
} from '../../common/pagination/cursor-codec';
import { SqsOutboxPublisher } from '../agent-orchestration/sqs-outbox-publisher';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 50;

function isIdempotencyUniqueViolation(
  e: unknown,
): e is Prisma.PrismaClientKnownRequestError {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== 'P2002') return false;
  const target = (e.meta?.target as string[] | undefined) ?? [];
  if (!Array.isArray(target)) return false;
  const hasOwnerUserId =
    target.includes('ownerUserId') || target.includes('owner_user_id');
  const hasIdempotencyKey =
    target.includes('idempotencyKey') || target.includes('idempotency_key');
  return hasOwnerUserId && hasIdempotencyKey;
}

function isSerializationConflict(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034'
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CreateParams {
  userId: string;
  conversationId: string;
  content: string;
  idempotencyKey: string;
  correlationId: string;
}

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly outboxPublisher?: SqsOutboxPublisher,
  ) {}

  async findAllByConversation(
    userId: string,
    conversationId: string,
    limit: number,
    cursor?: string,
  ): Promise<PageResponse<MessageSummaryDto>> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, ownerUserId: userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const where: Record<string, unknown> = { conversationId };
    if (cursor) {
      const { createdAt, id } = decodeMessageCursor(cursor);
      where.OR = [
        { createdAt: { gt: new Date(createdAt) } },
        {
          AND: [
            { createdAt: { equals: new Date(createdAt) } },
            { id: { gt: id } },
          ],
        },
      ];
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map(
      MessageSummaryDto.fromEntity,
    );

    let nextCursor: string | null = null;
    if (hasMore) {
      const lastRow = rows[limit - 1];
      nextCursor = encodeCursor({
        createdAt: lastRow.createdAt.toISOString(),
        id: lastRow.id,
      });
    }

    return new PageResponse(data, nextCursor);
  }

  async create(
    userId: string,
    conversationId: string,
    dto: CreateMessageDto,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<{
    result: CreateMessageResponseDto;
    isReplay: boolean;
  }> {
    const content = dto.content.trim();
    if (content.length < 1 || content.length > 4000) {
      throw new BadRequestException('Content must be 1-4000 characters');
    }

    try {
      const result = await this.executeCreate({
        userId,
        conversationId,
        content,
        idempotencyKey,
        correlationId,
      });

      if (this.outboxPublisher) {
        void this.outboxPublisher.tryPublish(result.job.id);
      }

      return { result, isReplay: false };
    } catch (e: unknown) {
      if (!isIdempotencyUniqueViolation(e)) throw e;

      const existing = await this.lookupExistingJob(userId, idempotencyKey);

      if (!existing) throw e;

      if (
        existing.ownerUserId === userId &&
        existing.conversationId === conversationId &&
        existing.triggerMessage?.authorRole === 'user' &&
        existing.triggerMessage?.content === content
      ) {
        return {
          result: {
            message: MessageSummaryDto.fromEntity(existing.triggerMessage),
            job: JobSummaryDto.fromEntity({
              id: existing.id,
              conversationId: existing.conversationId,
              triggerMessageId: existing.triggerMessageId,
              status: existing.status,
              correlationId: existing.correlationId,
              createdAt: existing.createdAt,
            }),
          },
          isReplay: true,
        };
      }

      throw new ConflictException(
        'Idempotency key reused with different parameters',
      );
    }
  }

  private async executeCreate(
    params: CreateParams,
  ): Promise<CreateMessageResponseDto> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const conversation = await tx.conversation.findFirst({
              where: {
                id: params.conversationId,
                ownerUserId: params.userId,
              },
            });
            if (!conversation) {
              throw new NotFoundException('Conversation not found');
            }

            const message = await tx.message.create({
              data: {
                conversationId: params.conversationId,
                authorRole: AuthorRole.user,
                content: params.content,
              },
            });

            const activityUpdate = await tx.conversation.updateMany({
              where: {
                id: params.conversationId,
                ownerUserId: params.userId,
              },
              data: { lastActivityAt: new Date() },
            });
            if (activityUpdate.count !== 1) {
              throw new NotFoundException('Conversation not found');
            }

            const job = await tx.agentJob.create({
              data: {
                conversationId: params.conversationId,
                triggerMessageId: message.id,
                ownerUserId: params.userId,
                status: JobStatus.queued,
                idempotencyKey: params.idempotencyKey,
                correlationId: params.correlationId,
              },
            });

            await tx.agentJobOutbox.create({
              data: {
                agentJobId: job.id,
              },
            });

            return {
              message: MessageSummaryDto.fromEntity(message),
              job: JobSummaryDto.fromEntity(job),
            };
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (e: unknown) {
        lastError = e;
        if (isSerializationConflict(e) && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw e;
      }
    }

    throw lastError;
  }

  private async lookupExistingJob(
    userId: string,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    ownerUserId: string;
    conversationId: string;
    triggerMessageId: string;
    status: string;
    correlationId: string;
    createdAt: Date;
    triggerMessage: {
      authorRole: string;
      content: string;
      id: string;
      conversationId: string;
      metadata: unknown;
      createdAt: Date;
    } | null;
  } | null> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const existing = await this.prisma.agentJob.findUnique({
        where: {
          ownerUserId_idempotencyKey: {
            ownerUserId: userId,
            idempotencyKey,
          },
        },
        include: { triggerMessage: true },
      });

      if (existing) return existing;

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }

    return null;
  }
}
