import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CitationService } from '../../src/modules/citation/citation.service';
import { PrismaService } from '../../src/database/prisma.service';

describe('CitationService', () => {
  let service: CitationService;
  let prisma: {
    conversation: { findFirst: jest.Mock };
    message: { findFirst: jest.Mock };
    citation: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      conversation: { findFirst: jest.fn() },
      message: { findFirst: jest.fn() },
      citation: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CitationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CitationService>(CitationService);
  });

  const mockConversation = () => ({
    id: 'conv-1',
    title: 'Test',
    ownerUserId: 'user-1',
    lastActivityAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const mockMessage = () => ({
    id: 'msg-1',
    conversationId: 'conv-1',
    authorRole: 'assistant',
    content: 'Answer',
    metadata: null,
    createdAt: new Date('2026-07-30T00:00:00.000Z'),
  });

  const mockCitation = (overrides = {}) => ({
    id: 'cit-1',
    messageId: 'msg-1',
    label: 'Residential Tenancies Act 1997 s 61',
    jurisdiction: 'VIC',
    instrumentType: 'rta',
    instrumentTitle: '',
    instrumentVersion: '',
    sectionReference: '',
    sourceChunkId: null,
    createdAt: new Date('2026-07-30T00:00:01.000Z'),
    ...overrides,
  });

  it('returns citations for an owned conversation message, createdAt ASC', async () => {
    prisma.conversation.findFirst.mockResolvedValue(mockConversation());
    prisma.message.findFirst.mockResolvedValue(mockMessage());
    prisma.citation.findMany.mockResolvedValue([mockCitation()]);

    const result = await service.findAllByMessage('user-1', 'conv-1', 'msg-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('cit-1');
    expect(result[0].label).toBe('Residential Tenancies Act 1997 s 61');
    expect(result[0].createdAt).toBe('2026-07-30T00:00:01.000Z');
    expect(prisma.citation.findMany).toHaveBeenCalledWith({
      where: { messageId: 'msg-1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('returns an empty array when the message has no citations', async () => {
    prisma.conversation.findFirst.mockResolvedValue(mockConversation());
    prisma.message.findFirst.mockResolvedValue(mockMessage());
    prisma.citation.findMany.mockResolvedValue([]);

    const result = await service.findAllByMessage('user-1', 'conv-1', 'msg-1');

    expect(result).toEqual([]);
  });

  it('throws NotFoundException for a non-owned conversation', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      service.findAllByMessage('user-2', 'conv-1', 'msg-1'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(prisma.citation.findMany).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the message belongs to another conversation', async () => {
    prisma.conversation.findFirst.mockResolvedValue(mockConversation());
    prisma.message.findFirst.mockResolvedValue(null);

    await expect(
      service.findAllByMessage('user-1', 'conv-1', 'msg-1'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.citation.findMany).not.toHaveBeenCalled();
  });
});
