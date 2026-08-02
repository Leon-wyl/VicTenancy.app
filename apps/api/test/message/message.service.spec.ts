import { Test, TestingModule } from '@nestjs/testing';
import { MessageService } from '../../src/modules/message/message.service';
import { PrismaService } from '../../src/database/prisma.service';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { encodeCursor } from '../../src/common/pagination/cursor-codec';

describe('MessageService', () => {
  let service: MessageService;
  let prisma: {
    conversation: { findFirst: jest.Mock; updateMany: jest.Mock };
    message: { findMany: jest.Mock; create: jest.Mock };
    citation: { findMany: jest.Mock };
    agentJob: { findUnique: jest.Mock; create: jest.Mock };
    agentJobOutbox: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      conversation: { findFirst: jest.fn(), updateMany: jest.fn() },
      message: { findMany: jest.fn(), create: jest.fn() },
      citation: { findMany: jest.fn().mockResolvedValue([]) },
      agentJob: { findUnique: jest.fn(), create: jest.fn() },
      agentJobOutbox: { create: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MessageService>(MessageService);
  });

  const mockConversation = () => ({
    id: 'conv-1',
    title: 'Test',
    ownerUserId: 'user-1',
    lastActivityAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const mockMessage = (overrides = {}) => ({
    id: 'msg-1',
    conversationId: 'conv-1',
    authorRole: 'user',
    content: 'Hello',
    metadata: null,
    createdAt: new Date('2026-07-30T00:00:00Z'),
    ...overrides,
  });

  const mockJob = (overrides = {}) => ({
    id: 'job-1',
    conversationId: 'conv-1',
    triggerMessageId: 'msg-1',
    ownerUserId: 'user-1',
    status: 'queued',
    idempotencyKey: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    correlationId: 'cccccccc-dddd-eeee-ffff-gggggggggggg',
    createdAt: new Date('2026-07-30T00:00:00Z'),
    ...overrides,
  });

  describe('findAllByConversation', () => {
    it('returns messages for owned conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      prisma.message.findMany.mockResolvedValue([mockMessage()]);
      const result = await service.findAllByConversation('user-1', 'conv-1', 20);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('msg-1');
    });

    it('throws NotFoundException for non-owned conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      await expect(
        service.findAllByConversation('user-2', 'conv-1', 20),
      ).rejects.toThrow(NotFoundException);
    });

    it('defaults to ascending order (unchanged behaviour)', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      prisma.message.findMany.mockResolvedValue([mockMessage()]);

      await service.findAllByConversation('user-1', 'conv-1', 20);

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('uses forward keyset (gt) conditions for asc cursors', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      prisma.message.findMany.mockResolvedValue([]);
      const cursor = encodeCursor({
        createdAt: '2026-07-30T00:00:00.000Z',
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      });

      await service.findAllByConversation('user-1', 'conv-1', 20, cursor);

      const where = prisma.message.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { createdAt: { gt: new Date('2026-07-30T00:00:00.000Z') } },
        {
          AND: [
            { createdAt: { equals: new Date('2026-07-30T00:00:00.000Z') } },
            { id: { gt: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } },
          ],
        },
      ]);
    });

    it('orders newest-first for desc', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      prisma.message.findMany.mockResolvedValue([mockMessage()]);

      await service.findAllByConversation(
        'user-1',
        'conv-1',
        20,
        undefined,
        'desc',
      );

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('uses backward keyset (lt) conditions for desc cursors, tie-broken by id', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      prisma.message.findMany.mockResolvedValue([]);
      const cursor = encodeCursor({
        createdAt: '2026-07-30T00:00:00.000Z',
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      });

      await service.findAllByConversation(
        'user-1',
        'conv-1',
        20,
        cursor,
        'desc',
      );

      const where = prisma.message.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { createdAt: { lt: new Date('2026-07-30T00:00:00.000Z') } },
        {
          AND: [
            { createdAt: { equals: new Date('2026-07-30T00:00:00.000Z') } },
            { id: { lt: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } },
          ],
        },
      ]);
    });

    it('emits a nextCursor from the last page row (works for both directions)', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      const rows = [
        mockMessage({
          id: 'msg-1',
          createdAt: new Date('2026-07-30T00:00:00.000Z'),
        }),
        mockMessage({
          id: 'msg-2',
          createdAt: new Date('2026-07-30T00:00:00.000Z'),
        }),
        mockMessage({
          id: 'msg-3',
          createdAt: new Date('2026-07-30T00:00:01.000Z'),
        }),
      ];
      prisma.message.findMany.mockResolvedValue(rows);

      const result = await service.findAllByConversation(
        'user-1',
        'conv-1',
        2,
        undefined,
        'desc',
      );

      expect(result.data).toHaveLength(2);
      expect(result.data.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
      expect(result.page.nextCursor).not.toBeNull();
      // Cursor points at the last returned row; the next page must not overlap.
      const decoded = JSON.parse(
        Buffer.from(result.page.nextCursor!, 'base64url').toString('utf-8'),
      );
      expect(decoded).toEqual({
        createdAt: '2026-07-30T00:00:00.000Z',
        id: 'msg-2',
      });
    });
  });

  describe('create', () => {
    it('creates message and job in transaction (isReplay: false)', async () => {
      const msg = mockMessage();
      const job = mockJob();
      prisma.$transaction.mockImplementation(async (fn) =>
        fn({
          conversation: {
            findFirst: jest.fn().mockResolvedValue(mockConversation()),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          message: { create: jest.fn().mockResolvedValue(msg) },
          agentJob: { create: jest.fn().mockResolvedValue(job) },
            agentJobOutbox: { create: jest.fn() },
        }),
      );

      const { result, isReplay } = await service.create(
        'user-1',
        'conv-1',
        { content: 'Hello' },
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        'cccccccc-dddd-eeee-ffff-gggggggggggg',
      );

      expect(result.message.id).toBe('msg-1');
      expect(result.job.status).toBe('queued');
      expect(isReplay).toBe(false);
    });

    it('trims message content and rejects empty', async () => {
      await expect(
        service.create(
          'user-1',
          'conv-1',
          { content: '   ' },
          'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          'cccccccc-dddd-eeee-ffff-gggggggggggg',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects content exceeding 4000 characters after trim', async () => {
      await expect(
        service.create(
          'user-1',
          'conv-1',
          { content: 'A'.repeat(4001) },
          'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          'cccccccc-dddd-eeee-ffff-gggggggggggg',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for non-owned conversation', async () => {
      prisma.$transaction.mockImplementation(async (fn) =>
        fn({
          conversation: {
            findFirst: jest.fn().mockResolvedValue(null),
            updateMany: jest.fn(),
          },
          message: { create: jest.fn() },
          agentJob: { create: jest.fn() },
          agentJobOutbox: { create: jest.fn() },
        }),
      );

      await expect(
        service.create(
          'user-2',
          'conv-1',
          { content: 'Hi' },
          'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          'cccccccc-dddd-eeee-ffff-gggggggggggg',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('handles idempotent replay on P2002 (same conv, same content) — isReplay: true', async () => {
      const uniqueErr = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test', meta: { target: ['ownerUserId', 'idempotencyKey'] } },
      );
      prisma.$transaction.mockRejectedValue(uniqueErr);
      prisma.agentJob.findUnique.mockResolvedValue({
        ...mockJob(),
        triggerMessage: mockMessage(),
      });

      const { result, isReplay } = await service.create(
        'user-1',
        'conv-1',
        { content: 'Hello' },
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        'cccccccc-dddd-eeee-ffff-gggggggggggg',
      );

      expect(result.message.id).toBe('msg-1');
      expect(result.job.id).toBe('job-1');
      expect(isReplay).toBe(true);
      expect(prisma.agentJob.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ownerUserId_idempotencyKey: {
              ownerUserId: 'user-1',
              idempotencyKey: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            },
          },
        }),
      );
    });

    it('throws ConflictException on idempotency key reuse with different content', async () => {
      const uniqueErr = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test', meta: { target: ['ownerUserId', 'idempotencyKey'] } },
      );
      prisma.$transaction.mockRejectedValue(uniqueErr);
      prisma.agentJob.findUnique.mockResolvedValue({
        ...mockJob(),
        triggerMessage: mockMessage({ content: 'Different' }),
      });

      await expect(
        service.create(
          'user-1',
          'conv-1',
          { content: 'Hello' },
          'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          'cccccccc-dddd-eeee-ffff-gggggggggggg',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException on idempotency key reuse with different conversation', async () => {
      const uniqueErr = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test', meta: { target: ['ownerUserId', 'idempotencyKey'] } },
      );
      prisma.$transaction.mockRejectedValue(uniqueErr);
      prisma.agentJob.findUnique.mockResolvedValue({
        ...mockJob({ conversationId: 'conv-2' }),
        triggerMessage: mockMessage({ conversationId: 'conv-2' }),
      });

      await expect(
        service.create(
          'user-1',
          'conv-1',
          { content: 'Hello' },
          'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          'cccccccc-dddd-eeee-ffff-gggggggggggg',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('does NOT catch non-idempotency P2002', async () => {
      const otherErr = new Prisma.PrismaClientKnownRequestError(
        'Other unique constraint',
        { code: 'P2002', clientVersion: 'test', meta: { target: ['some_other_field'] } },
      );
      prisma.$transaction.mockRejectedValue(otherErr);

      await expect(
        service.create(
          'user-1',
          'conv-1',
          { content: 'Hello' },
          'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          'cccccccc-dddd-eeee-ffff-gggggggggggg',
        ),
      ).rejects.toThrow(otherErr);
    });

    it('retries on P2034 serialization conflict then succeeds', async () => {
      const serializationErr = new Prisma.PrismaClientKnownRequestError(
        'Serialization failure',
        { code: 'P2034', clientVersion: 'test' },
      );
      let callCount = 0;
      prisma.$transaction.mockImplementation(async (fn) => {
        callCount++;
        if (callCount < 3) throw serializationErr;
        return fn({
          conversation: {
            findFirst: jest.fn().mockResolvedValue(mockConversation()),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          message: { create: jest.fn().mockResolvedValue(mockMessage()) },
          agentJob: { create: jest.fn().mockResolvedValue(mockJob()) },
          agentJobOutbox: { create: jest.fn() },
        });
      });

      const { result } = await service.create(
        'user-1',
        'conv-1',
        { content: 'Hello' },
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        'cccccccc-dddd-eeee-ffff-gggggggggggg',
      );

      expect(result.message.id).toBe('msg-1');
      expect(callCount).toBe(3);
    });
  });
});
