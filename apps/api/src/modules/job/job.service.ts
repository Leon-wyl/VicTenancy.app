import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PageResponse } from '../../common/pagination/page-response.dto';
import {
  decodeJobCursor,
  encodeCursor,
} from '../../common/pagination/cursor-codec';

export interface JobStatusResponse {
  id: string;
  conversationId: string;
  triggerMessageId: string;
  assistantMessageId: string | null;
  status: string;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorCode: string | null;
}

export interface ConversationJob extends JobStatusResponse {
  triggerMessage: {
    id: string;
    content: string;
    createdAt: string;
  } | null;
}

interface JobEntity {
  id: string;
  conversationId: string;
  triggerMessageId: string;
  assistantMessageId: string | null;
  status: string;
  attempt: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  errorMetadata: unknown;
}

function extractErrorCode(errorMetadata: unknown): string | null {
  if (
    errorMetadata &&
    typeof errorMetadata === 'object' &&
    !Array.isArray(errorMetadata)
  ) {
    return (
      ((errorMetadata as Record<string, unknown>).code as string | null) ??
      null
    );
  }
  return null;
}

function toJobStatusResponse(job: JobEntity): JobStatusResponse {
  return {
    id: job.id,
    conversationId: job.conversationId,
    triggerMessageId: job.triggerMessageId,
    assistantMessageId: job.assistantMessageId,
    status: job.status,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    errorCode: extractErrorCode(job.errorMetadata),
  };
}

@Injectable()
export class JobService {
  constructor(private readonly prisma: PrismaService) {}

  async listJobsByConversation(
    userId: string,
    conversationId: string,
    limit: number,
    cursor?: string,
  ): Promise<PageResponse<ConversationJob>> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, ownerUserId: userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const where: Record<string, unknown> = {
      conversationId,
      status: {
        in: [
          JobStatus.queued,
          JobStatus.processing,
          JobStatus.failed,
          JobStatus.cancelled,
        ],
      },
    };
    if (cursor) {
      const { createdAt, id } = decodeJobCursor(cursor);
      where.OR = [
        { createdAt: { lt: new Date(createdAt) } },
        {
          AND: [
            { createdAt: { equals: new Date(createdAt) } },
            { id: { lt: id } },
          ],
        },
      ];
    }

    const rows = await this.prisma.agentJob.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        triggerMessage: {
          select: { id: true, content: true, createdAt: true },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const data: ConversationJob[] = page.map((job) => ({
      ...toJobStatusResponse(job),
      triggerMessage: job.triggerMessage
        ? {
            id: job.triggerMessage.id,
            content: job.triggerMessage.content,
            createdAt: job.triggerMessage.createdAt.toISOString(),
          }
        : null,
    }));

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

  async getJobStatus(
    userId: string,
    conversationId: string,
    jobId: string,
  ): Promise<JobStatusResponse> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, ownerUserId: userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const job = await this.prisma.agentJob.findFirst({
      where: { id: jobId, conversationId },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return toJobStatusResponse(job);
  }
}
