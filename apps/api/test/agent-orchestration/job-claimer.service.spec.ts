import { JobClaimerService } from '../../src/modules/agent-orchestration/job-claimer.service';
import { PrismaService } from '../../src/database/prisma.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function makePrisma(tx: {
  queryImpl?: (sql: string, ...params: unknown[]) => unknown[];
}) {
  return {
    $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
      cb({
        $queryRawUnsafe: jest.fn((sql: string, ...params: unknown[]) => {
          if (tx.queryImpl) return tx.queryImpl(sql, ...params);
          return [];
        }),
        $executeRawUnsafe: jest.fn(),
      }),
    ),
  };
}

describe('JobClaimerService', () => {
  const leaseToken = '11111111-1111-1111-1111-111111111111';
  const deliveryId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const jobId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const claimedRow = (overrides = {}) => ({
    id: jobId,
    conversation_id: 'conv-1',
    trigger_message_id: 'msg-1',
    owner_user_id: 'user-1',
    correlation_id: 'corr-1',
    attempt: 2,
    max_attempts: 3,
    lease_token: leaseToken,
    delivery_id: deliveryId,
    ...overrides,
  });

  const messageRow = (overrides = {}) => ({
    id: 'msg-1',
    content: 'What are my rights?',
    author_role: 'user',
    ...overrides,
  });

  const conversationRow = (overrides = {}) => ({
    id: 'conv-1',
    owner_user_id: 'user-1',
    ...overrides,
  });

  it('claims a queued job only for the exact matching delivery_id, incrementing attempt and recording a new lease', async () => {
    const queryCalls: string[] = [];
    const tx = {
      queryImpl: (sql: string) => {
        queryCalls.push(sql);
        if (sql.includes('UPDATE agent_jobs')) return [claimedRow()];
        if (sql.includes('FROM messages')) return [messageRow()];
        if (sql.includes('FROM conversations')) return [conversationRow()];
        return [];
      },
    };
    const service = new JobClaimerService(
      makePrisma(tx) as unknown as PrismaService,
    );

    const claim = await service.claimJob(jobId, deliveryId);

    expect(claim).not.toBeNull();
    expect(claim!.job.id).toBe(jobId);
    expect(claim!.job.conversationId).toBe('conv-1');
    expect(claim!.job.triggerMessageId).toBe('msg-1');
    expect(claim!.job.ownerUserId).toBe('user-1');
    expect(claim!.job.correlationId).toBe('corr-1');
    expect(claim!.job.attempt).toBe(2);
    expect(claim!.job.maxAttempts).toBe(3);
    expect(claim!.job.deliveryId).toBe(deliveryId);
    // A fresh random lease token is minted for the claim.
    expect(claim!.job.leaseToken).toMatch(UUID_RE);
    expect(claim!.triggerMessage).toEqual({
      id: 'msg-1',
      content: 'What are my rights?',
      authorRole: 'user',
    });
    expect(claim!.conversation).toEqual({
      id: 'conv-1',
      ownerUserId: 'user-1',
    });

    const claimSql = queryCalls[0];
    expect(claimSql).toContain("SET status = 'processing'");
    expect(claimSql).toContain('attempt = attempt + 1');
    expect(claimSql).toContain("AND status = 'queued'");
    expect(claimSql).toContain('attempt < max_attempts');
    expect(claimSql).toContain('delivery_id = $3::uuid');
    expect(claimSql).toContain('next_attempt_at <= now()');
  });

  it('returns null when the claim is stale (delivery_id mismatch, duplicate delivery, terminal, or already processing)', async () => {
    const service = new JobClaimerService(
      makePrisma({ queryImpl: () => [] }) as unknown as PrismaService,
    );

    const claim = await service.claimJob(jobId, deliveryId);

    expect(claim).toBeNull();
  });

  it('throws when the trigger message is missing', async () => {
    const service = new JobClaimerService(
      makePrisma({
        queryImpl: (sql: string) => {
          if (sql.includes('UPDATE agent_jobs')) return [claimedRow()];
          return [];
        },
      }) as unknown as PrismaService,
    );

    await expect(service.claimJob(jobId, deliveryId)).rejects.toThrow(
      'Trigger message not found',
    );
  });

  it('throws when the conversation is missing', async () => {
    const service = new JobClaimerService(
      makePrisma({
        queryImpl: (sql: string) => {
          if (sql.includes('UPDATE agent_jobs')) return [claimedRow()];
          if (sql.includes('FROM messages')) return [messageRow()];
          return [];
        },
      }) as unknown as PrismaService,
    );

    await expect(service.claimJob(jobId, deliveryId)).rejects.toThrow(
      'Conversation not found',
    );
  });
});
