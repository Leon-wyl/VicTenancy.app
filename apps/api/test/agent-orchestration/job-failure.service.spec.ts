import { JobFailureService } from '../../src/modules/agent-orchestration/job-failure.service';
import { PrismaService } from '../../src/database/prisma.service';
import { AgentRuntimeError } from '../../src/integrations/agent-runtime';
import type { JobClaim } from '../../src/modules/agent-orchestration/job-claimer.service';

const claim: JobClaim = {
  id: 'job-1',
  conversationId: 'conv-1',
  triggerMessageId: 'msg-1',
  ownerUserId: 'user-1',
  correlationId: 'corr-1',
  attempt: 1,
  maxAttempts: 3,
  leaseToken: 'lease-1',
  deliveryId: 'delivery-1',
};

function makePrisma(fns: { updateResult?: number } = {}) {
  return {
    $executeRawUnsafe: jest.fn().mockResolvedValue(fns.updateResult ?? 1),
    $transaction: jest.fn(),
  };
}

describe('JobFailureService', () => {
  let timers: { now: Date };
  let spyNow: jest.SpyInstance;

  beforeEach(() => {
    timers = { now: new Date('2026-08-01T00:00:00Z') };
    spyNow = jest.spyOn(Date, 'now').mockReturnValue(timers.now.getTime());
  });

  afterEach(() => {
    spyNow.mockRestore();
  });

  describe('handleTerminalFailure', () => {
    it('writes a fenced failed state with safe non-secret error metadata', async () => {
      const prisma = makePrisma();
      const service = new JobFailureService(prisma as unknown as PrismaService);
      const error = new AgentRuntimeError('validation failed', false, 422);

      await service.handleTerminalFailure(claim, error);

      const [sql, metadata, id, leaseToken, deliveryId] =
        prisma.$executeRawUnsafe.mock.calls[0];
      expect(sql).toContain("SET status = 'failed'");
      expect(sql).toContain('completed_at = now()');
      expect(sql).toContain("AND status = 'processing'");
      expect(sql).toContain('lease_token = $3::uuid');
      expect(sql).toContain('delivery_id = $4::uuid');

      const parsed = JSON.parse(metadata as string);
      expect(parsed).toEqual({
        code: 'AgentRuntimeError',
        retryable: false,
        httpStatus: 422,
        message: 'validation failed',
      });
      expect(id).toBe('job-1');
      expect(leaseToken).toBe('lease-1');
      expect(deliveryId).toBe('delivery-1');
    });

    it('is idempotent under a stale lease: a zero-row fenced update is not an error', async () => {
      const prisma = makePrisma({ updateResult: 0 });
      const service = new JobFailureService(prisma as unknown as PrismaService);
      const error = new AgentRuntimeError('gone', false, 403);

      await expect(service.handleTerminalFailure(claim, error)).resolves.toBeUndefined();
    });
  });

  describe('handleRetryableFailure', () => {
    it('re-queues a job with next_attempt_at from the retry schedule and re-arms the outbox in one transaction', async () => {
      const txClient = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
      const prisma = makePrisma();
      prisma.$transaction.mockImplementation(
        async (cb: (tx: unknown) => unknown) => cb(txClient),
      );
      const service = new JobFailureService(prisma as unknown as PrismaService);

      await service.handleRetryableFailure(claim, 1);

      const jobSql = txClient.$executeRawUnsafe.mock.calls[0][0] as string;
      expect(jobSql).toContain("SET status = 'queued'");
      expect(jobSql).toContain('next_attempt_at = $1::timestamptz');
      expect(jobSql).toContain('lease_token = $3::uuid');
      expect(jobSql).toContain('delivery_id = $4::uuid');
      const nextAttemptAt = txClient.$executeRawUnsafe.mock.calls[0][1] as Date;
      expect(nextAttemptAt.getTime()).toBe(timers.now.getTime() + 30_000);

      const outboxSql = txClient.$executeRawUnsafe.mock.calls[1][0] as string;
      expect(outboxSql).toContain('published_at = NULL');
      expect(outboxSql).toContain('WHERE agent_job_id = $2::uuid');
    });

    it('uses a 120 second backoff for a second failure', async () => {
      const txClient = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
      const prisma = makePrisma();
      prisma.$transaction.mockImplementation(
        async (cb: (tx: unknown) => unknown) => cb(txClient),
      );
      const service = new JobFailureService(prisma as unknown as PrismaService);

      await service.handleRetryableFailure(claim, 2);

      const nextAttemptAt = txClient.$executeRawUnsafe.mock.calls[0][1] as Date;
      expect(nextAttemptAt.getTime()).toBe(timers.now.getTime() + 120_000);
    });

    it('does not re-arm the outbox when the fenced job update matches zero rows', async () => {
      const txClient = { $executeRawUnsafe: jest.fn().mockResolvedValue(0) };
      const prisma = makePrisma();
      prisma.$transaction.mockImplementation(
        async (cb: (tx: unknown) => unknown) => cb(txClient),
      );
      const service = new JobFailureService(prisma as unknown as PrismaService);

      await service.handleRetryableFailure(claim, 1);

      expect(txClient.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      expect(txClient.$executeRawUnsafe.mock.calls[0][0]).not.toContain(
        'agent_job_outbox',
      );
    });

    it('persists a terminal MAX_ATTEMPTS_EXHAUSTED state for an exhausted attempt without re-arming the outbox', async () => {
      const prisma = makePrisma();
      const service = new JobFailureService(prisma as unknown as PrismaService);

      await service.handleRetryableFailure(claim, 3);

      const [sql, metadata] = prisma.$executeRawUnsafe.mock.calls[0];
      expect(sql).toContain("SET status = 'failed'");
      const parsed = JSON.parse(metadata as string);
      expect(parsed).toEqual({
        code: 'MAX_ATTEMPTS_EXHAUSTED',
        retryable: false,
        attempt: 3,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
