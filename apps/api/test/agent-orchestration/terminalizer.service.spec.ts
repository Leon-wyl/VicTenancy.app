import { TerminalizerService } from '../../src/modules/agent-orchestration/terminalizer.service';
import { PrismaService } from '../../src/database/prisma.service';

function makePrisma(updateResult: number) {
  return { $executeRawUnsafe: jest.fn().mockResolvedValue(updateResult) };
}

describe('TerminalizerService', () => {
  it('marks a processing job with a matching delivery_id as failed', async () => {
    const prisma = makePrisma(1);
    const service = new TerminalizerService(prisma as unknown as PrismaService);

    const result = await service.terminalizeFailed(
      'job-1',
      'delivery-1',
    );

    expect(result).toBe(true);
    const [sql, jobId, deliveryId] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(sql).toContain("SET status = 'failed'");
    expect(sql).toContain('"code":"DLQ_DELIVERY"');
    expect(sql).toContain("AND status = 'processing'");
    expect(sql).toContain('delivery_id = $2::uuid');
    expect(sql).toContain('(lease_until IS NULL OR lease_until < now())');
    expect(jobId).toBe('job-1');
    expect(deliveryId).toBe('delivery-1');
  });

  it('is a stale no-op when the job status or delivery generation changed', async () => {
    const prisma = makePrisma(0);
    const service = new TerminalizerService(prisma as unknown as PrismaService);

    const result = await service.terminalizeFailed(
      'job-1',
      'stale-delivery-1',
    );

    expect(result).toBe(false);
  });
});
