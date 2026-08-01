import { AgentJobProcessor } from '../../src/modules/agent-orchestration/agent-job-processor';
import { JobClaimerService } from '../../src/modules/agent-orchestration/job-claimer.service';
import { JobPersistenceService } from '../../src/modules/agent-orchestration/job-persistence.service';
import { JobFailureService } from '../../src/modules/agent-orchestration/job-failure.service';
import { AgentRuntimeClient, AgentRuntimeError } from '../../src/integrations/agent-runtime';
import type { AgentResponse } from '../../src/integrations/agent-runtime';
import type { JobWithMessage } from '../../src/modules/agent-orchestration/job-claimer.service';

const claimedJob: JobWithMessage = {
  job: {
    id: 'job-1',
    conversationId: 'conv-1',
    triggerMessageId: 'msg-1',
    ownerUserId: 'user-1',
    correlationId: 'corr-1',
    attempt: 1,
    maxAttempts: 3,
    leaseToken: 'lease-1',
    deliveryId: 'delivery-1',
  },
  triggerMessage: {
    id: 'msg-1',
    content: 'What are my rights?',
    authorRole: 'user',
  },
  conversation: {
    id: 'conv-1',
    ownerUserId: 'user-1',
  },
};

function makeClient(invoke: jest.Mock) {
  return { invoke } as unknown as AgentRuntimeClient;
}

function makeFakes(overrides: {
  claim?: jest.Mock;
  persist?: jest.Mock;
  terminal?: jest.Mock;
  retry?: jest.Mock;
  invoke?: jest.Mock;
}) {
  const claim = overrides.claim ?? jest.fn().mockResolvedValue(claimedJob);
  const persist = overrides.persist ?? jest.fn().mockResolvedValue('assistant-1');
  const terminal = overrides.terminal ?? jest.fn().mockResolvedValue(undefined);
  const retry = overrides.retry ?? jest.fn().mockResolvedValue(undefined);
  const invoke = overrides.invoke ?? jest.fn();
  const processor = new AgentJobProcessor(
    { claimJob: claim } as unknown as JobClaimerService,
    { persistSuccess: persist } as unknown as JobPersistenceService,
    {
      handleTerminalFailure: terminal,
      handleRetryableFailure: retry,
    } as unknown as JobFailureService,
    makeClient(invoke),
  );
  return { processor, claim, persist, terminal, retry, invoke };
}

const validResponse: AgentResponse = {
  request_id: 'corr-1',
  status: 'success',
  answer: 'Answer',
  api_version: '1.0',
  generated_at: '2026-08-01T00:00:00Z',
};

describe('AgentJobProcessor', () => {
  it('returns noop and does not invoke the Agent Runtime when the claim is stale or duplicate', async () => {
    const { processor, invoke, persist, retry } = makeFakes({
      claim: jest.fn().mockResolvedValue(null),
    });

    const result = await processor.processJob('job-1', 'delivery-stale');

    expect(result).toBe('noop');
    expect(invoke).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });

  it('invokes the Agent Runtime exactly once after a successful claim and persists success', async () => {
    const { processor, invoke, persist } = makeFakes({});
    invoke.mockResolvedValue(validResponse);

    const result = await processor.processJob('job-1', 'delivery-1');

    expect(result).toBe('succeeded');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith({
      question: 'What are my rights?',
      requestId: 'corr-1',
      threadId: 'conv-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      messageId: 'msg-1',
    });
    expect(persist).toHaveBeenCalledWith(claimedJob.job, validResponse);
  });

  it('passes clarification and fallback responses to persistence without inventing behavior', async () => {
    const { processor, invoke, persist } = makeFakes({});
    const clarification: AgentResponse = {
      ...validResponse,
      status: 'clarification',
      clarification: 'Please clarify',
      answer: null,
    };
    invoke.mockResolvedValue(clarification);

    const result = await processor.processJob('job-1', 'delivery-1');

    expect(result).toBe('succeeded');
    expect(persist).toHaveBeenCalledWith(claimedJob.job, clarification);
  });

  it('schedules a DB-authoritative retry for retryable Agent Runtime errors without consulting SQS receive count', async () => {
    const { processor, invoke, retry } = makeFakes({});
    invoke.mockRejectedValue(new AgentRuntimeError('timeout', true, 500));

    const result = await processor.processJob('job-1', 'delivery-1');

    expect(result).toBe('requeued');
    expect(retry).toHaveBeenCalledWith(claimedJob.job, claimedJob.job.attempt);
  });

  it('wraps a non-AgentRuntimeError as retryable and re-queues', async () => {
    const { processor, invoke, retry } = makeFakes({});
    invoke.mockRejectedValue(new Error('boom'));

    const result = await processor.processJob('job-1', 'delivery-1');

    expect(result).toBe('requeued');
    expect(retry).toHaveBeenCalledWith(claimedJob.job, claimedJob.job.attempt);
  });

  it('persists a terminal failure for non-retryable Agent Runtime errors', async () => {
    const { processor, invoke, terminal, retry } = makeFakes({});
    const err = new AgentRuntimeError('validation failure', false, 422);
    invoke.mockRejectedValue(err);

    const result = await processor.processJob('job-1', 'delivery-1');

    expect(result).toBe('failed');
    expect(terminal).toHaveBeenCalledWith(claimedJob.job, err);
    expect(retry).not.toHaveBeenCalled();
  });

  it('never reports success when persistence is rejected by a fence, so a second assistant response cannot be committed', async () => {
    const { processor, invoke } = makeFakes({
      persist: jest
        .fn()
        .mockRejectedValue(new Error('Job persistence fenced update failed')),
    });
    invoke.mockResolvedValue(validResponse);

    const result = await processor.processJob('job-1', 'delivery-1');

    // The processor refuses to report success; the fenced persistence throw
    // rolls back the assistant message/citation writes (verified in the
    // persistence spec and the Postgres integration suite).
    expect(result).not.toBe('succeeded');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
