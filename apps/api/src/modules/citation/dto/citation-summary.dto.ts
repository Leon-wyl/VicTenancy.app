export class CitationSummaryDto {
  id!: string;
  messageId!: string;
  label!: string;
  jurisdiction!: string;
  instrumentType!: string;
  instrumentTitle!: string;
  instrumentVersion!: string;
  sectionReference!: string;
  createdAt!: string;

  static fromEntity(entity: {
    id: string;
    messageId: string;
    label: string;
    jurisdiction: string;
    instrumentType: string;
    instrumentTitle: string;
    instrumentVersion: string;
    sectionReference: string;
    createdAt: Date;
  }): CitationSummaryDto {
    const dto = new CitationSummaryDto();
    dto.id = entity.id;
    dto.messageId = entity.messageId;
    dto.label = entity.label;
    dto.jurisdiction = entity.jurisdiction;
    dto.instrumentType = entity.instrumentType;
    dto.instrumentTitle = entity.instrumentTitle;
    dto.instrumentVersion = entity.instrumentVersion;
    dto.sectionReference = entity.sectionReference;
    dto.createdAt = entity.createdAt.toISOString();
    return dto;
  }
}
