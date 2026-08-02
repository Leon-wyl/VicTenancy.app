import type { CitationSummaryDto } from '../../citation/dto/citation-summary.dto';

export class MessageSummaryDto {
  id!: string;
  conversationId!: string;
  authorRole!: string;
  content!: string;
  metadata!: unknown | null;
  createdAt!: string;
  citations?: CitationSummaryDto[];

  static fromEntity(entity: {
    id: string;
    conversationId: string;
    authorRole: string;
    content: string;
    metadata: unknown;
    createdAt: Date;
  }): MessageSummaryDto {
    const dto = new MessageSummaryDto();
    dto.id = entity.id;
    dto.conversationId = entity.conversationId;
    dto.authorRole = entity.authorRole;
    dto.content = entity.content;
    dto.metadata = entity.metadata ?? null;
    dto.createdAt = entity.createdAt.toISOString();
    return dto;
  }
}
