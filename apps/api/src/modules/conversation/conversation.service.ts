import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ConversationSummaryDto } from './dto/conversation-summary.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import {
  decodeConversationCursor,
  encodeCursor,
} from '../../common/pagination/cursor-codec';
import { PageResponse } from '../../common/pagination/page-response.dto';

function validateTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('Title must be a string');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException('Title must not be empty');
  }
  if (trimmed.length > 200) {
    throw new BadRequestException('Title must not exceed 200 characters');
  }
  return trimmed;
}

function isCreationIdempotencyConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;
  const target = (error.meta?.target as string[] | undefined) ?? [];
  return (
    target.includes('ownerUserId') &&
    (target.includes('creationIdempotencyKey') ||
      target.includes('creation_idempotency_key'))
  );
}

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUser(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<PageResponse<ConversationSummaryDto>> {
    const where: Record<string, unknown> = { ownerUserId: userId };
    if (cursor) {
      const { lastActivityAt, id } = decodeConversationCursor(cursor);
      where.OR = [
        { lastActivityAt: { lt: new Date(lastActivityAt) } },
        {
          AND: [
            { lastActivityAt: { equals: new Date(lastActivityAt) } },
            { id: { lt: id } },
          ],
        },
      ];
    }

    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map(
      ConversationSummaryDto.fromEntity,
    );

    let nextCursor: string | null = null;
    if (hasMore) {
      const lastRow = rows[limit - 1];
      nextCursor = encodeCursor({
        lastActivityAt: lastRow.lastActivityAt.toISOString(),
        id: lastRow.id,
      });
    }

    return new PageResponse(data, nextCursor);
  }

  async create(
    userId: string,
    dto: CreateConversationDto,
    idempotencyKey?: string,
  ): Promise<ConversationSummaryDto> {
    const title =
      dto.title === undefined
        ? 'New conversation'
        : validateTitle(dto.title);

    try {
      const entity = await this.prisma.conversation.create({
        data: {
          ownerUserId: userId,
          title,
          ...(idempotencyKey
            ? { creationIdempotencyKey: idempotencyKey }
            : {}),
        },
      });
      return ConversationSummaryDto.fromEntity(entity);
    } catch (error) {
      if (!idempotencyKey || !isCreationIdempotencyConflict(error)) {
        throw error;
      }

      const existing = await this.prisma.conversation.findFirst({
        where: { ownerUserId: userId, creationIdempotencyKey: idempotencyKey },
      });
      if (!existing) throw error;
      if (existing.title !== title) {
        throw new ConflictException(
          'Idempotency key reused with different parameters',
        );
      }
      return ConversationSummaryDto.fromEntity(existing);
    }
  }

  async findOne(
    userId: string,
    conversationId: string,
  ): Promise<ConversationSummaryDto> {
    const entity = await this.prisma.conversation.findFirst({
      where: { id: conversationId, ownerUserId: userId },
    });
    if (!entity) {
      throw new NotFoundException('Conversation not found');
    }
    return ConversationSummaryDto.fromEntity(entity);
  }

  async update(
    userId: string,
    conversationId: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationSummaryDto> {
    const title = validateTitle(dto.title);

    const result = await this.prisma.conversation.updateMany({
      where: { id: conversationId, ownerUserId: userId },
      data: { title },
    });

    if (result.count === 0) {
      throw new NotFoundException('Conversation not found');
    }

    const entity = await this.prisma.conversation.findFirst({
      where: { id: conversationId, ownerUserId: userId },
    });
    if (!entity) {
      throw new NotFoundException('Conversation not found');
    }
    return ConversationSummaryDto.fromEntity(entity);
  }

  async delete(userId: string, conversationId: string): Promise<void> {
    const result = await this.prisma.conversation.deleteMany({
      where: { id: conversationId, ownerUserId: userId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Conversation not found');
    }
  }
}
