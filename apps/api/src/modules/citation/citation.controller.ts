import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CitationService } from './citation.service';
import { CitationSummaryDto } from './dto/citation-summary.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Principal } from '../../common/auth/principal';

@Controller(
  '/v1/conversations/:conversationId/messages/:messageId/citations',
)
export class CitationController {
  constructor(private readonly citationService: CitationService) {}

  @Get()
  async findAll(
    @CurrentUser() user: Principal,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<CitationSummaryDto[]> {
    return this.citationService.findAllByMessage(
      user.sub,
      conversationId,
      messageId,
    );
  }
}
