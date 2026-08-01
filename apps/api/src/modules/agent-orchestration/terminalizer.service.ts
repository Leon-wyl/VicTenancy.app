import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TerminalizerService {
  private readonly logger = new Logger(TerminalizerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async terminalizeFailed(jobId: string, deliveryId: string): Promise<boolean> {
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE agent_jobs
       SET status = 'failed',
           completed_at = now(),
           lease_token = NULL,
           lease_until = NULL,
           delivery_id = NULL,
           error_metadata = '{"code":"DLQ_DELIVERY","retryable":false}'::jsonb
       WHERE id = $1::uuid
         AND status = 'processing'
         AND delivery_id = $2::uuid
         AND (lease_until IS NULL OR lease_until < now())`,
      jobId,
      deliveryId,
    );

    if (result > 0) {
      this.logger.warn(`DLQ terminalized job ${jobId} as failed`);
      return true;
    }

    this.logger.log(
      `DLQ message for job ${jobId} delivery ${deliveryId} was stale (status changed or new delivery active)`,
    );
    return false;
  }
}
