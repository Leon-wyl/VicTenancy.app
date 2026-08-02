import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CitationSummaryDto } from './dto/citation-summary.dto';

@Injectable()
export class CitationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByMessage(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<CitationSummaryDto[]> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, ownerUserId: userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const rows = await this.prisma.citation.findMany({
      where: { messageId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(CitationSummaryDto.fromEntity);
  }
}
