import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { JobService } from '../../src/modules/job/job.service';
import { PrismaService } from '../../src/database/prisma.service';
import { encodeCursor } from '../../src/common/pagination/cursor-codec';

describe('JobService', () => {
  let service: JobService;
  let prisma: {
    conversation: { findFirst: jest.Mock };
    agentJob: { findFirst: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      conversation: { findFirst: jest.fn() },
      agentJob: { findFirst: jest.fn(), findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [JobService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<JobService>(JobService);
  });

  const mockConversation = () => ({
    id: 'conv-1',
    title: 'Test',
    ownerUserId: 'user-1',
    lastActivityAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const mockJob = (overrides = {}) => ({
    id: 'job-1',
    conversationId: 'conv-1',
    triggerMessageId: 'msg-1',
    assistantMessageId: null,
    ownerUserId: 'user-1',
    status: 'failed',
    attempt: 3,
    maxAttempts: 3,
    createdAt: new Date('2026-07-30T00:00:00.000Z'),
    updatedAt: new Date('2026-07-30T00:01:00.000Z'),
    completedAt: new Date('2026-07-30T00:01:00.000Z'),
    errorMetadata: { code: 'AGENT_TIMEOUT' },
    triggerMessage: {
      id: 'msg-1',
      content: 'Can my landlord raise the rent?',
      createdAt: new Date('2026-07-30T00:00:00.000Z'),
    },
    ...overrides,
  });

  describe('listJobsByConversation', () => {
    it('returns jobs newest-first with trigger message content', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      prisma.agentJob.findMany.mockResolvedValue([mockJob()]);

      const result = await service.listJobsByConversation(
        'user-1',
        'conv-1',
        20,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('job-1');
      expect(result.data[0].status).toBe('failed');
      expect(result.data[0].errorCode).toBe('AGENT_TIMEOUT');
      expect(result.data[0].triggerMessage).toEqual({
        id: 'msg-1',
        content: 'Can my landlord raise the rent?',
        createdAt: '2026-07-30T00:00:00.000Z',
      });
      expect(result.page.nextCursor).toBeNull();
      expect(prisma.agentJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 21,
        }),
      );
    });

    it('includes queued, processing, failed, cancelled and excludes succeeded', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      prisma.agentJob.findMany.mockResolvedValue([]);

      await service.listJobsByConversation('user-1', 'conv-1', 20);

      const where = prisma.agentJob.findMany.mock.calls[0][0].where;
      expect(where.status.in).toEqual([
        'queued',
        'processing',
        'failed',
        'cancelled',
      ]);
      expect(where.status.in).not.toContain('succeeded');
      expect(where.conversationId).toBe('conv-1');
    });

    it('throws NotFoundException for a non-owned conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.listJobsByConversation('user-2', 'conv-1', 20),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.agentJob.findMany).not.toHaveBeenCalled();
    });

    it('paginates with a keyset cursor into older jobs', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      const ids = [
        'aaaaaaaa-0000-0000-0000-000000000000',
        'bbbbbbbb-0000-0000-0000-000000000000',
        'cccccccc-0000-0000-0000-000000000000',
      ];
      const rows = ids.map((id, i) =>
        mockJob({
          id,
          createdAt: new Date(`2026-07-30T00:00:0${i}.000Z`),
        }),
      );
      prisma.agentJob.findMany.mockResolvedValue(rows);

      const result = await service.listJobsByConversation(
        'user-1',
        'conv-1',
        2,
      );

      expect(result.data).toHaveLength(2);
      expect(result.page.nextCursor).not.toBeNull();

      // Second page: cursor must page backward (older records only).
      prisma.agentJob.findMany.mockResolvedValue([rows[2]]);
      await service.listJobsByConversation(
        'user-1',
        'conv-1',
        2,
        result.page.nextCursor!,
      );

      const secondWhere = prisma.agentJob.findMany.mock.calls[1][0].where;
      expect(secondWhere.OR).toEqual([
        { createdAt: { lt: new Date('2026-07-30T00:00:01.000Z') } },
        {
          AND: [
            { createdAt: { equals: new Date('2026-07-30T00:00:01.000Z') } },
            { id: { lt: ids[1] } },
          ],
        },
      ]);
    });

    it('accepts a cursor produced by encodeCursor ({createdAt,id})', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      prisma.agentJob.findMany.mockResolvedValue([]);

      const cursor = encodeCursor({
        createdAt: '2026-07-30T00:00:00.000Z',
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      });

      await service.listJobsByConversation('user-1', 'conv-1', 20, cursor);

      expect(prisma.agentJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { createdAt: { lt: new Date('2026-07-30T00:00:00.000Z') } },
              {
                AND: [
                  {
                    createdAt: {
                      equals: new Date('2026-07-30T00:00:00.000Z'),
                    },
                  },
                  { id: { lt: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } },
                ],
              },
            ],
          }),
        }),
      );
    });
  });

  describe('getJobStatus', () => {
    it('returns the job status for an owned conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      prisma.agentJob.findFirst.mockResolvedValue(mockJob());

      const result = await service.getJobStatus('user-1', 'conv-1', 'job-1');

      expect(result.id).toBe('job-1');
      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('AGENT_TIMEOUT');
      expect(result.completedAt).toBe('2026-07-30T00:01:00.000Z');
    });

    it('throws NotFoundException for a non-owned conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.getJobStatus('user-2', 'conv-1', 'job-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the job is not in the conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      prisma.agentJob.findFirst.mockResolvedValue(null);

      await expect(
        service.getJobStatus('user-1', 'conv-1', 'job-9'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
