import { Module } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { QuotaGuard } from './quota.guard';

@Module({
  providers: [QuotaService, QuotaGuard],
  exports: [QuotaService],
})
export class QuotaModule {}
