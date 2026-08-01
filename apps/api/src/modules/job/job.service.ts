import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

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

@Injectable()
export class JobService {
  constructor(private readonly prisma: PrismaService) {}

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

    const errorCode =
      job.errorMetadata &&
      typeof job.errorMetadata === 'object' &&
      !Array.isArray(job.errorMetadata)
        ? (job.errorMetadata as Record<string, unknown>).code as string | null
        : null;

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
      errorCode: errorCode ?? null,
    };
  }
}
