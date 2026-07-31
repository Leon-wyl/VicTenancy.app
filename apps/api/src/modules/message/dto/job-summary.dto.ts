export class JobSummaryDto {
  id!: string;
  conversationId!: string;
  triggerMessageId!: string;
  status!: string;
  correlationId!: string;
  createdAt!: string;

  static fromEntity(entity: {
    id: string;
    conversationId: string;
    triggerMessageId: string;
    status: string;
    correlationId: string;
    createdAt: Date;
  }): JobSummaryDto {
    const dto = new JobSummaryDto();
    dto.id = entity.id;
    dto.conversationId = entity.conversationId;
    dto.triggerMessageId = entity.triggerMessageId;
    dto.status = entity.status;
    dto.correlationId = entity.correlationId;
    dto.createdAt = entity.createdAt.toISOString();
    return dto;
  }
}
