import { Test, TestingModule } from '@nestjs/testing';
import { ConversationService } from '../../src/modules/conversation/conversation.service';
import { PrismaService } from '../../src/database/prisma.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { encodeCursor } from '../../src/common/pagination/cursor-codec';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_ISO = '2026-07-30T00:00:00.000Z';

describe('ConversationService', () => {
  let service: ConversationService;
  let prisma: {
    conversation: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      conversation: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  const mockConversation = (overrides: Record<string, unknown> = {}) => ({
    id: 'conv-1',
    title: 'Test Conversation',
    ownerUserId: 'user-1',
    lastActivityAt: new Date('2026-07-30T00:00:00Z'),
    createdAt: new Date('2026-07-30T00:00:00Z'),
    updatedAt: new Date('2026-07-30T00:00:00Z'),
    ...overrides,
  });

  describe('create', () => {
    it('creates with provided title', async () => {
      prisma.conversation.create.mockResolvedValue(
        mockConversation({ title: 'My Chat' }),
      );
      const result = await service.create('user-1', { title: 'My Chat' });
      expect(result.title).toBe('My Chat');
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: { ownerUserId: 'user-1', title: 'My Chat' },
      });
    });

    it('defaults when title is undefined (field omitted)', async () => {
      prisma.conversation.create.mockResolvedValue(
        mockConversation({ title: 'New conversation' }),
      );
      const result = await service.create('user-1', {});
      expect(result.title).toBe('New conversation');
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: { ownerUserId: 'user-1', title: 'New conversation' },
      });
    });

    it('throws BadRequestException when title is empty after trim', async () => {
      await expect(
        service.create('user-1', { title: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when title exceeds 200 chars after trim', async () => {
      await expect(
        service.create('user-1', { title: 'A'.repeat(201) }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when title is null', async () => {
      await expect(
        service.create('user-1', { title: null as unknown as string }),
      ).rejects.toThrow();
    });

    it('trims surrounding whitespace from title', async () => {
      prisma.conversation.create.mockResolvedValue(
        mockConversation({ title: 'Hello' }),
      );
      const result = await service.create('user-1', { title: '  Hello  ' });
      expect(result.title).toBe('Hello');
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: { ownerUserId: 'user-1', title: 'Hello' },
      });
    });

    it('replays a conversation with the same creation idempotency key', async () => {
      const key = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      prisma.conversation.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: {
            target: ['ownerUserId', 'creationIdempotencyKey'],
          },
        }),
      );
      prisma.conversation.findFirst.mockResolvedValue(
        mockConversation({ title: 'My Chat' }),
      );

      const result = await service.create('user-1', { title: 'My Chat' }, key);

      expect(result.id).toBe('conv-1');
      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { ownerUserId: 'user-1', creationIdempotencyKey: key },
      });
    });

    it('rejects a creation key reused with a different title', async () => {
      const key = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      prisma.conversation.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: {
            target: ['ownerUserId', 'creationIdempotencyKey'],
          },
        }),
      );
      prisma.conversation.findFirst.mockResolvedValue(
        mockConversation({ title: 'Original title' }),
      );

      await expect(
        service.create('user-1', { title: 'Different title' }, key),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('returns conversation when owned using findFirst', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation());
      const result = await service.findOne('user-1', 'conv-1');
      expect(result.id).toBe('conv-1');
      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-1', ownerUserId: 'user-1' },
      });
    });

    it('throws NotFoundException when findFirst returns null', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      await expect(service.findOne('user-1', 'conv-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not return another users conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      await expect(service.findOne('user-2', 'conv-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-1', ownerUserId: 'user-2' },
      });
    });
  });

  describe('update', () => {
    it('uses updateMany with ownership and checks count', async () => {
      prisma.conversation.updateMany.mockResolvedValue({ count: 1 });
      prisma.conversation.findFirst.mockResolvedValue(
        mockConversation({ title: 'Updated' }),
      );
      const result = await service.update('user-1', 'conv-1', {
        title: 'Updated',
      });
      expect(result.title).toBe('Updated');
      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', ownerUserId: 'user-1' },
        data: { title: 'Updated' },
      });
    });

    it('throws NotFoundException when updateMany count is 0', async () => {
      prisma.conversation.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.update('user-1', 'conv-1', { title: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException on empty title after trim', async () => {
      await expect(
        service.update('user-1', 'conv-1', { title: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on title exceeding 200 chars', async () => {
      await expect(
        service.update('user-1', 'conv-1', { title: 'A'.repeat(201) }),
      ).rejects.toThrow(BadRequestException);
    });

    it('trims whitespace from title', async () => {
      prisma.conversation.updateMany.mockResolvedValue({ count: 1 });
      prisma.conversation.findFirst.mockResolvedValue(
        mockConversation({ title: 'Hello' }),
      );
      const result = await service.update('user-1', 'conv-1', {
        title: '  Hello  ',
      });
      expect(result.title).toBe('Hello');
      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', ownerUserId: 'user-1' },
        data: { title: 'Hello' },
      });
    });
  });

  describe('delete', () => {
    it('uses deleteMany with ownership and checks count', async () => {
      prisma.conversation.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.delete('user-1', 'conv-1')).resolves.toBeUndefined();
      expect(prisma.conversation.deleteMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', ownerUserId: 'user-1' },
      });
    });

    it('throws NotFoundException when deleteMany count is 0', async () => {
      prisma.conversation.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.delete('user-1', 'conv-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllByUser', () => {
    it('paginates with limit + 1 and returns nextCursor on overflow', async () => {
      const rows = Array.from({ length: 21 }, (_, i) =>
        mockConversation({
          id: `conv-${i}`,
          lastActivityAt: new Date(
            `2026-07-30T${String(i).padStart(2, '0')}:00:00Z`,
          ),
        }),
      );
      prisma.conversation.findMany.mockResolvedValue(rows);
      const result = await service.findAllByUser('user-1', 20);
      expect(result.data).toHaveLength(20);
      expect(result.page.nextCursor).toEqual(expect.any(String));
    });

    it('returns null nextCursor when fewer than limit results', async () => {
      prisma.conversation.findMany.mockResolvedValue([mockConversation()]);
      const result = await service.findAllByUser('user-1', 20);
      expect(result.data).toHaveLength(1);
      expect(result.page.nextCursor).toBeNull();
    });

    it('accepts and validates a cursor for pagination', async () => {
      prisma.conversation.findMany.mockResolvedValue([mockConversation()]);
      const cursor = encodeCursor({
        lastActivityAt: VALID_ISO,
        id: VALID_UUID,
      });
      await service.findAllByUser('user-1', 20, cursor);
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerUserId: 'user-1',
            OR: expect.any(Array),
          }),
        }),
      );
    });

    it('throws on malformed cursor', async () => {
      await expect(
        service.findAllByUser('user-1', 20, 'bad-cursor'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
