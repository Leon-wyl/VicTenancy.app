import { MessageSummaryDto } from './message-summary.dto';
import { JobSummaryDto } from './job-summary.dto';

export class CreateMessageResponseDto {
  message!: MessageSummaryDto;
  job!: JobSummaryDto;
}
