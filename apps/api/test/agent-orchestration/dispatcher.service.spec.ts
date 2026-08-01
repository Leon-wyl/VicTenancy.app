import { DispatcherService } from '../../src/modules/agent-orchestration/dispatcher.service';
import { OutboxService } from '../../src/modules/agent-orchestration/outbox.service';
import { SqsClient } from '../../src/integrations/agent-runtime';
import { PrismaService } from '../../src/database/prisma.service';

function makePrisma() {
  return {
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };
}

function makeSqs() {
  return { sendMessage: jest.fn() };
}

describe('DispatcherService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let outbox: {
    findDueOutboxRows: jest.Mock;
    claimForDispatch: jest.Mock;
    markPublished: jest.Mock;
    releaseDispatchLease: jest.Mock;
  };
  let sqs: ReturnType<typeof makeSqs>;
  let service: DispatcherService;

  beforeEach(() => {
    prisma = makePrisma();
    outbox = {
      findDueOutboxRows: jest.fn(),
      claimForDispatch: jest.fn(),
      markPublished: jest.fn(),
      releaseDispatchLease: jest.fn(),
    };
    sqs = makeSqs();
    service = new DispatcherService(
      prisma as unknown as PrismaService,
      outbox as unknown as OutboxService,
      sqs as unknown as SqsClient,
    );
  });

  describe('runDueOutboxDispatch', () => {
    it('returns both dispatched and recovered counts', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);
      outbox.findDueOutboxRows.mockResolvedValue([]);
      service.recoverExpiredLeases = jest.fn().mockResolvedValue(2);
      service.dispatchDueOutbox = jest.fn().mockResolvedValue(3);

      const result = await service.runDueOutboxDispatch(10);

      expect(result).toEqual({ dispatched: 3, recovered: 2 });
    });
  });

  describe('dispatchDueOutbox', () => {
    it('claims, sends, and marks published for each due row', async () => {
      const dueRows = [
        { outboxId: 'outbox-1', agentJobId: 'job-1', conversationId: 'conv-1' },
        { outboxId: 'outbox-2', agentJobId: 'job-2', conversationId: 'conv-2' },
      ];
      outbox.findDueOutboxRows.mockResolvedValue(dueRows);
      outbox.claimForDispatch.mockImplementation(async (agentJobId: string) => ({
        outboxId: agentJobId === 'job-1' ? 'outbox-1' : 'outbox-2',
        agentJobId,
        conversationId:
          agentJobId === 'job-1' ? 'conv-1' : 'conv-2',
        deliveryId: `delivery-${agentJobId}`,
        dispatchLeaseToken: `lease-${agentJobId}`,
      }));
      outbox.markPublished.mockResolvedValue(true);

      const dispatched = await service.dispatchDueOutbox(10);

      expect(dispatched).toBe(2);
      expect(outbox.markPublished).toHaveBeenCalledWith('outbox-1', 'lease-job-1');
      expect(outbox.markPublished).toHaveBeenCalledWith('outbox-2', 'lease-job-2');
      expect(sqs.sendMessage).toHaveBeenCalledTimes(2);
      expect(sqs.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          jobId: 'job-1',
          conversationId: 'conv-1',
          deliveryId: 'delivery-job-1',
        }),
      );
    });

    it('skips rows that could not be claimed', async () => {
      outbox.findDueOutboxRows.mockResolvedValue([
        { outboxId: 'outbox-1', agentJobId: 'job-1', conversationId: 'conv-1' },
      ]);
      outbox.claimForDispatch.mockResolvedValue(null);

      const dispatched = await service.dispatchDueOutbox(10);

      expect(dispatched).toBe(0);
      expect(sqs.sendMessage).not.toHaveBeenCalled();
      expect(outbox.markPublished).not.toHaveBeenCalled();
    });

    it('on SQS send failure releases only its own lease, does not mark published, and keeps dispatching later rows', async () => {
      const dueRows = [
        { outboxId: 'outbox-1', agentJobId: 'job-1', conversationId: 'conv-1' },
        { outboxId: 'outbox-2', agentJobId: 'job-2', conversationId: 'conv-2' },
      ];
      outbox.findDueOutboxRows.mockResolvedValue(dueRows);
      outbox.claimForDispatch.mockImplementation(async (agentJobId: string) => ({
        outboxId: agentJobId === 'job-1' ? 'outbox-1' : 'outbox-2',
        agentJobId,
        conversationId: agentJobId === 'job-1' ? 'conv-1' : 'conv-2',
        deliveryId: `delivery-${agentJobId}`,
        dispatchLeaseToken: `lease-${agentJobId}`,
      }));
      sqs.sendMessage
        .mockRejectedValueOnce(new Error('SQS throttled'))
        .mockResolvedValueOnce(undefined);
      outbox.markPublished.mockResolvedValue(true);

      const dispatched = await service.dispatchDueOutbox(10);

      expect(dispatched).toBe(1);
      // Failed row: lease released, never marked published, and the stale failed row is not falsely published.
      expect(outbox.releaseDispatchLease).toHaveBeenCalledWith(
        'outbox-1',
        'lease-job-1',
      );
      expect(outbox.markPublished).not.toHaveBeenCalledWith(
        'outbox-1',
        expect.anything(),
      );
      // Later row still processed.
      expect(outbox.markPublished).toHaveBeenCalledWith('outbox-2', 'lease-job-2');
    });
  });

  describe('recoverExpiredLeases', () => {
    const expiredRow = (overrides = {}) => ({
      id: 'job-1',
      attempt: 1,
      max_attempts: 3,
      lease_token: 'lease-1',
      ...overrides,
    });

    it('returns expired processing leases to queued when attempts remain and re-arms the outbox', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([expiredRow()]);
      const txClient = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: unknown) => unknown) => cb(txClient),
      );

      const recovered = await service.recoverExpiredLeases();

      expect(recovered).toBe(1);
      const jobUpdateSql = txClient.$executeRawUnsafe.mock.calls[0][0] as string;
      expect(jobUpdateSql).toContain("SET status = 'queued'");
      expect(jobUpdateSql).toContain('lease_token = $3::uuid');
      expect(jobUpdateSql).toContain('lease_until < now()');
      const outboxSql = txClient.$executeRawUnsafe.mock.calls[1][0] as string;
      expect(outboxSql).toContain('published_at = NULL');
      expect(outboxSql).toContain('WHERE agent_job_id = $2::uuid');
    });

    it('marks exhausted leases as failed with LEASE_EXPIRED metadata', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([
        expiredRow({ attempt: 3, max_attempts: 3 }),
      ]);
      const txClient = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: unknown) => unknown) => cb(txClient),
      );

      const recovered = await service.recoverExpiredLeases();

      expect(recovered).toBe(1);
      const sql = txClient.$executeRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain("SET status = 'failed'");
      expect(sql).toContain('"code":"LEASE_EXPIRED"');
      // No outbox re-arm for a terminal failure.
      expect(txClient.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('does not recover or re-arm the outbox when the fenced job update matches zero rows (job renewed or completed)', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([expiredRow()]);
      const txClient = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: unknown) => unknown) => cb(txClient),
      );

      const recovered = await service.recoverExpiredLeases();

      expect(recovered).toBe(0);
      expect(txClient.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      // Outbox was never re-armed for a job that is no longer processing under this lease.
      expect(txClient.$executeRawUnsafe.mock.calls[0][0]).not.toContain(
        'agent_job_outbox',
      );
    });
  });
});
