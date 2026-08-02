import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { JobService, ConversationJob, JobStatusResponse } from './job.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Principal } from '../../common/auth/principal';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PageResponse } from '../../common/pagination/page-response.dto';

@Controller('/v1/conversations/:conversationId/jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get()
  async listJobs(
    @CurrentUser() user: Principal,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: PaginationDto,
  ): Promise<PageResponse<ConversationJob>> {
    return this.jobService.listJobsByConversation(
      user.sub,
      conversationId,
      query.limit ?? 20,
      query.cursor,
    );
  }

  @Get(':jobId')
  async getJob(
    @CurrentUser() user: Principal,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<JobStatusResponse> {
    return this.jobService.getJobStatus(
      user.sub,
      conversationId,
      jobId,
    );
  }
}
