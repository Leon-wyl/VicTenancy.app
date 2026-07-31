export class ConversationSummaryDto {
  id!: string;
  title!: string;
  lastActivityAt!: string;
  createdAt!: string;
  updatedAt!: string;

  static fromEntity(entity: {
    id: string;
    title: string;
    lastActivityAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }): ConversationSummaryDto {
    const dto = new ConversationSummaryDto();
    dto.id = entity.id;
    dto.title = entity.title;
    dto.lastActivityAt = entity.lastActivityAt.toISOString();
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}
