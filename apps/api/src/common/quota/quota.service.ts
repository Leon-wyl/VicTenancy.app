import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

export interface QuotaResult {
  allowed: boolean;
  minute_count: number;
  day_count: number;
  retry_after_seconds: number;
}

@Injectable()
export class QuotaService {
  private readonly maxPerMinute: number;
  private readonly maxPerDay: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.maxPerMinute = this.configService.getOrThrow<number>(
      'quota.requestsPerMinute',
    );
    this.maxPerDay = this.configService.getOrThrow<number>(
      'quota.requestsPerDay',
    );
  }

  async consume(userId: string): Promise<QuotaResult> {
    const [result] = await this.prisma.$queryRaw<QuotaResult[]>`
      SELECT
        allowed,
        minute_count,
        day_count,
        retry_after_seconds
      FROM check_and_increment_quota(
        ${userId}::UUID,
        ${this.maxPerMinute},
        ${this.maxPerDay}
      )
    `;

    return result;
  }

  getLimits(): { maxPerMinute: number; maxPerDay: number } {
    return { maxPerMinute: this.maxPerMinute, maxPerDay: this.maxPerDay };
  }
}
