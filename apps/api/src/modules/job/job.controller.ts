import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { JobService, JobStatusResponse } from './job.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Principal } from '../../common/auth/principal';

@Controller('/v1/conversations/:conversationId/jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

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
