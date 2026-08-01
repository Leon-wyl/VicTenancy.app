import { OutboxService } from '../../src/modules/agent-orchestration/outbox.service';
import { PrismaService } from '../../src/database/prisma.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function rawTx(fns: {
  queryResults?: unknown[];
  queryImpl?: (sql: string, ...params: unknown[]) => unknown[];
  updateResult?: number;
  updateImpl?: (sql: string, ...params: unknown[]) => number;
}) {
  return {
    $queryRawUnsafe: jest.fn((sql: string, ...params: unknown[]) => {
      if (fns.queryImpl) return fns.queryImpl(sql, ...params);
      const results = fns.queryResults ?? [];
      return results.length > 0 ? results.shift() : [];
    }),
    $executeRawUnsafe: jest.fn((sql: string, ...params: unknown[]) => {
      if (fns.updateImpl) return fns.updateImpl(sql, ...params);
      return fns.updateResult ?? 1;
    }),
  };
}

function makePrisma(tx: ReturnType<typeof rawTx>) {
  return {
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };
}

describe('OutboxService', () => {
  describe('claimForDispatch', () => {
    it('claims an eligible queued job with a fresh delivery_id, dispatch lease token, and expiry', async () => {
      const deliveryId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const agentJobId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const conversationId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

      const tx = rawTx({
        queryImpl: (sql: string) => {
          if (sql.includes('FROM agent_job_outbox') && sql.includes('UPDATE')) {
            return [
              {
                id: 'outbox-1',
                agent_job_id: agentJobId,
                delivery_id: deliveryId,
              },
            ];
          }
          if (sql.includes('SELECT conversation_id')) {
            return [{ conversation_id: conversationId }];
          }
          return [];
        },
        updateResult: 1,
      });
      const prisma = makePrisma(tx);
      const service = new OutboxService(prisma as unknown as PrismaService);

      const claim = await service.claimForDispatch(agentJobId);

      expect(claim).not.toBeNull();
      // A fresh random dispatch lease token is minted per claim.
      expect(claim!.dispatchLeaseToken).toMatch(UUID_RE);
      expect(claim!.deliveryId).toBe(deliveryId);
      expect(claim!.outboxId).toBe('outbox-1');
      expect(claim!.agentJobId).toBe(agentJobId);
      expect(claim!.conversationId).toBe(conversationId);

      const jobUpdateSql = tx.$executeRawUnsafe.mock.calls[0][0] as string;
      expect(jobUpdateSql).toContain("SET delivery_id = $1::uuid");
      expect(jobUpdateSql).toContain("AND status = 'queued'");
      expect(jobUpdateSql).toContain('dispatch_lease_token = $4::uuid');
      expect(tx.$executeRawUnsafe.mock.calls[0][1]).toBe(deliveryId);
      expect(tx.$executeRawUnsafe.mock.calls[0][2]).toBe(agentJobId);
      expect(tx.$executeRawUnsafe.mock.calls[0][3]).toBe('outbox-1');
      expect(tx.$executeRawUnsafe.mock.calls[0][4]).toBe(
        claim!.dispatchLeaseToken,
      );
    });

    it('returns null when no eligible outbox row can be claimed', async () => {
      const tx = rawTx({
        queryResults: [],
        updateResult: 1,
      });
      const prisma = makePrisma(tx);
      const service = new OutboxService(prisma as unknown as PrismaService);

      const claim = await service.claimForDispatch(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      );

      expect(claim).toBeNull();
      expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('throws when the job disappeared during the claim transaction', async () => {
      const tx = rawTx({
        queryImpl: (sql: string) => {
          if (sql.includes('UPDATE')) {
            return [
              {
                id: 'outbox-1',
                agent_job_id: 'job-1',
                delivery_id: 'delivery-1',
              },
            ];
          }
          return [];
        },
        updateResult: 1,
      });
      const prisma = makePrisma(tx);
      const service = new OutboxService(prisma as unknown as PrismaService);

      await expect(
        service.claimForDispatch('job-1'),
      ).rejects.toThrow('Outbox job disappeared during claim');
    });

    it('throws when the outbox dispatch fence fails to update the job', async () => {
      const tx = rawTx({
        queryImpl: (sql: string) => {
          if (sql.includes('UPDATE')) {
            return [
              {
                id: 'outbox-1',
                agent_job_id: 'job-1',
                delivery_id: 'delivery-1',
              },
            ];
          }
          return [{ conversation_id: 'conv-1' }];
        },
        updateResult: 0,
      });
      const prisma = makePrisma(tx);
      const service = new OutboxService(prisma as unknown as PrismaService);

      await expect(
        service.claimForDispatch('job-1'),
      ).rejects.toThrow('Outbox dispatch fence failed');
    });
  });

  describe('markPublished', () => {
    it('returns true when the exact outbox id plus current lease token matches', async () => {
      const prisma = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      };
      const service = new OutboxService(prisma as unknown as PrismaService);

      const ok = await service.markPublished('outbox-1', '11111111-1111-1111-1111-111111111111');

      expect(ok).toBe(true);
      const [sql, outboxId, token] = prisma.$executeRawUnsafe.mock.calls[0];
      expect(sql).toContain("SET published_at = now()");
      expect(sql).toContain('dispatch_lease_token = $2::uuid');
      expect(outboxId).toBe('outbox-1');
      expect(token).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('returns false when the lease token no longer matches (stale dispatcher)', async () => {
      const prisma = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      };
      const service = new OutboxService(prisma as unknown as PrismaService);

      const ok = await service.markPublished(
        'outbox-1',
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
      );

      expect(ok).toBe(false);
    });
  });

  describe('releaseDispatchLease', () => {
    it('clears the lease and delivery only for the exact lease token', async () => {
      const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
      const service = new OutboxService(prisma as unknown as PrismaService);

      await service.releaseDispatchLease('outbox-1', '11111111-1111-1111-1111-111111111111');

      const [sql, outboxId, token] = prisma.$executeRawUnsafe.mock.calls[0];
      expect(sql).toContain('dispatch_lease_token = NULL');
      expect(sql).toContain('delivery_id = NULL');
      expect(sql).toContain('dispatch_lease_token = $2::uuid');
      expect(outboxId).toBe('outbox-1');
      expect(token).toBe('11111111-1111-1111-1111-111111111111');
    });
  });

  describe('findDueOutboxRows', () => {
    it('returns only unpublished, available, unlocked rows with queued jobs', async () => {
      const prisma = {
        $queryRawUnsafe: jest.fn().mockResolvedValue([
          {
            id: 'outbox-1',
            agent_job_id: 'job-1',
            conversation_id: 'conv-1',
          },
        ]),
      };
      const service = new OutboxService(prisma as unknown as PrismaService);

      const rows = await service.findDueOutboxRows(10);

      expect(rows).toEqual([
        { outboxId: 'outbox-1', agentJobId: 'job-1', conversationId: 'conv-1' },
      ]);
      const [sql, limit] = prisma.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('published_at IS NULL');
      expect(sql).toContain('j.status = \'queued\'');
      expect(limit).toBe(10);
    });
  });

  describe('resetForRetry', () => {
    it('re-arms the outbox to an unpublished available row without publishing it', async () => {
      const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
      const service = new OutboxService(prisma as unknown as PrismaService);
      const nextAttemptAt = new Date('2026-08-02T00:00:00Z');

      await service.resetForRetry('job-1', nextAttemptAt);

      const [sql, jobId, when] = prisma.$executeRawUnsafe.mock.calls[0];
      expect(sql).toContain('published_at = NULL');
      expect(sql).toContain('available_at = $2::timestamptz');
      expect(sql).toContain('dispatch_lease_token = NULL');
      expect(jobId).toBe('job-1');
      expect(when).toBe(nextAttemptAt);
    });
  });
});
