import { JobPersistenceService } from '../../src/modules/agent-orchestration/job-persistence.service';
import { PrismaService } from '../../src/database/prisma.service';
import type { JobClaim } from '../../src/modules/agent-orchestration/job-claimer.service';
import type { AgentResponse } from '../../src/integrations/agent-runtime';

function makeTx(fns: {
  messageCreateResult?: unknown;
  updateResult?: number;
}) {
  return {
    message: {
      create: jest.fn().mockResolvedValue(fns.messageCreateResult ?? { id: 'assistant-1' }),
    },
    citation: { create: jest.fn() },
    $executeRawUnsafe: jest.fn().mockResolvedValue(fns.updateResult ?? 1),
  };
}

function makePrisma(tx: ReturnType<typeof makeTx>) {
  return {
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  };
}

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

function successResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    request_id: 'corr-1',
    status: 'success',
    answer: 'Answer text',
    verified_citations: ['[VIC RTA 1997 Sec 63]', '  ', ''],
    citation_verified_rate: 0.5,
    selected_jurisdiction: 'VIC',
    latency_ms: 120,
    trace_id: 'trace-1',
    api_version: '1.0',
    generated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('JobPersistenceService', () => {
  it('persists assistant message, citations, succeeded status, and completion in one transaction', async () => {
    const tx = makeTx({});
    const service = new JobPersistenceService(
      makePrisma(tx) as unknown as PrismaService,
    );

    const msgId = await service.persistSuccess(claim, successResponse());

    expect(msgId).toBe('assistant-1');
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-1',
          authorRole: 'assistant',
          content: 'Answer text',
          metadata: expect.objectContaining({
            agentJobId: 'job-1',
            correlationId: 'corr-1',
            status: 'success',
            selectedJurisdiction: 'VIC',
            citationVerifiedRate: 0.5,
          }),
        }),
      }),
    );
    // Empty/whitespace citation labels are filtered; only the valid one is created.
    expect(tx.citation.create).toHaveBeenCalledTimes(1);
    expect(tx.citation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          messageId: 'assistant-1',
          label: '[VIC RTA 1997 Sec 63]',
          jurisdiction: 'VIC',
        }),
      }),
    );

    const [sql, msgIdParam, jobId, leaseToken, deliveryId] =
      tx.$executeRawUnsafe.mock.calls[0];
    expect(sql).toContain("SET status = 'succeeded'");
    expect(sql).toContain('assistant_message_id = $1::uuid');
    expect(sql).toContain("AND status = 'processing'");
    expect(sql).toContain('lease_token = $3::uuid');
    expect(sql).toContain('delivery_id = $4::uuid');
    expect(msgIdParam).toBe('assistant-1');
    expect(jobId).toBe('job-1');
    expect(leaseToken).toBe('lease-1');
    expect(deliveryId).toBe('delivery-1');

    // Conversation last_activity_at updated after the fenced job update.
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(tx.$executeRawUnsafe.mock.calls[1][0]).toContain(
      'SET last_activity_at = now()',
    );
  });

  it('uses clarification text for clarification responses', async () => {
    const tx = makeTx({});
    const service = new JobPersistenceService(
      makePrisma(tx) as unknown as PrismaService,
    );

    await service.persistSuccess(
      claim,
      successResponse({ status: 'clarification', clarification: 'Please clarify', answer: null }),
    );

    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'Please clarify' }),
      }),
    );
  });

  it('defaults citation jurisdiction to the selected jurisdiction when valid, else VIC', async () => {
    const tx = makeTx({});
    const service = new JobPersistenceService(
      makePrisma(tx) as unknown as PrismaService,
    );

    await service.persistSuccess(
      claim,
      successResponse({
        verified_citations: ['[NSW RTA 2010 Sec 1]', '[RTA 2010 Sec 2]'],
        selected_jurisdiction: 'NSW',
      }),
    );

    const labels = tx.citation.create.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: { label: string; jurisdiction: string } }).data,
    );
    expect(labels).toHaveLength(2);
    // A valid selected jurisdiction is applied to every citation.
    expect(labels[0].jurisdiction).toBe('NSW');
    expect(labels[1].jurisdiction).toBe('NSW');

    // An unsupported selected jurisdiction falls back to VIC for every citation.
    tx.citation.create.mockClear();
    await service.persistSuccess(
      claim,
      successResponse({
        verified_citations: ['[RTA 2021 Sec 2]'],
        selected_jurisdiction: 'QLD',
      }),
    );
    const fallback = tx.citation.create.mock.calls[0][0] as {
      data: { jurisdiction: string };
    };
    expect(fallback.data.jurisdiction).toBe('VIC');
  });

  it('rolls back by throwing when the fenced completion update matches zero rows', async () => {
    const tx = makeTx({ updateResult: 0 });
    const service = new JobPersistenceService(
      makePrisma(tx) as unknown as PrismaService,
    );

    await expect(service.persistSuccess(claim, successResponse())).rejects.toThrow(
      'Job persistence fenced update failed',
    );

    // The tx callback threw before the conversation update — the caller's
    // transaction rolls back the message/citation writes.
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(tx.$executeRawUnsafe.mock.calls[0][0]).not.toContain(
      'last_activity_at',
    );
  });
});
