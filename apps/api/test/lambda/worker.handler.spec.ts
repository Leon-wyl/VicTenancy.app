import type { SQSEvent, SQSRecord } from 'aws-lambda';

const mockCreateCtx = jest.fn();
const mockProcessJob = jest.fn();

jest.mock('../../src/modules/agent-orchestration/bootstrap', () => ({
  createAwsOrchestrationContext: mockCreateCtx,
}));

function buildRecord(overrides: Partial<SQSRecord> = {}): SQSRecord {
  return {
    messageId: 'msg-id-1',
    receiptHandle: 'receipt-1',
    body: '{}',
    attributes: {
      ApproximateReceiveCount: '1',
      SentTimestamp: '1754000000000',
      SenderId: 'sender-1',
      ApproximateFirstReceiveTimestamp: '1754000000000',
    },
    messageAttributes: {},
    md5OfBody: 'md5',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:ap-southeast-2:123456789012:victenancy-staging-agent-jobs.fifo',
    awsRegion: 'ap-southeast-2',
    ...overrides,
  };
}

function buildEvent(records: SQSRecord[]): SQSEvent {
  return { Records: records };
}

type WorkerModule = typeof import('../../src/worker');

async function getModule(): Promise<WorkerModule> {
  return import('../../src/worker');
}

describe('worker lambda handler', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCreateCtx.mockReset();
    mockCreateCtx.mockImplementation(async () => ({
      get: () => ({ processJob: mockProcessJob }),
    }));
    mockProcessJob.mockReset();
    mockProcessJob.mockResolvedValue('succeeded');
  });

  it('passes valid SQS job payloads to AgentJobProcessor and acknowledges them', async () => {
    mockProcessJob.mockResolvedValue('succeeded');
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({
        messageId: 'm1',
        body: JSON.stringify({
          version: 1,
          jobId: 'job-1',
          conversationId: 'conv-1',
          deliveryId: 'delivery-1',
        }),
      }),
    ]);

    const result = await mod.handler(event);

    expect(mockProcessJob).toHaveBeenCalledWith('job-1', 'delivery-1');
    expect(result.batchItemFailures).toEqual([]);
  });

  it('acknowledges a DB-confirmed noop (stale/duplicate/terminal) — not a batch failure', async () => {
    mockProcessJob.mockResolvedValue('noop');
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({
        messageId: 'm1',
        body: JSON.stringify({
          version: 1,
          jobId: 'job-1',
          conversationId: 'conv-1',
          deliveryId: 'stale-delivery',
        }),
      }),
    ]);

    const result = await mod.handler(event);

    expect(result.batchItemFailures).toEqual([]);
  });

  it('acknowledges a requeued job — retry is DB-authoritative, not SQS redrive', async () => {
    mockProcessJob.mockResolvedValue('requeued');
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({
        messageId: 'm1',
        body: JSON.stringify({
          version: 1,
          jobId: 'job-1',
          conversationId: 'conv-1',
          deliveryId: 'delivery-1',
        }),
      }),
    ]);

    const result = await mod.handler(event);

    expect(result.batchItemFailures).toEqual([]);
  });

  it('acknowledges a terminal failure — the failed state is already persisted by the database', async () => {
    mockProcessJob.mockResolvedValue('failed');
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({
        messageId: 'm1',
        body: JSON.stringify({
          version: 1,
          jobId: 'job-1',
          conversationId: 'conv-1',
          deliveryId: 'delivery-1',
        }),
      }),
    ]);

    const result = await mod.handler(event);

    expect(result.batchItemFailures).toEqual([]);
  });

  it('returns a batchItemFailure only when the processor throws and DB state is unknown', async () => {
    mockProcessJob.mockRejectedValue(new Error('DB connection lost'));
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({
        messageId: 'm1',
        body: JSON.stringify({
          version: 1,
          jobId: 'job-1',
          conversationId: 'conv-1',
          deliveryId: 'delivery-1',
        }),
      }),
    ]);

    const result = await mod.handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });

  it('marks malformed payloads as batch failures so SQS redrives them to the DLQ instead of silently dropping them', async () => {
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({ messageId: 'bad-1', body: 'not-json' }),
      buildRecord({
        messageId: 'bad-2',
        body: JSON.stringify({ version: 1 }), // missing jobId/deliveryId
      }),
    ]);

    const result = await mod.handler(event);

    expect(mockProcessJob).not.toHaveBeenCalled();
    expect(result.batchItemFailures).toEqual([
      { itemIdentifier: 'bad-1' },
      { itemIdentifier: 'bad-2' },
    ]);
  });

  it('marks missing or unsupported payload versions as batch failures', async () => {
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({
        messageId: 'missing-version',
        body: JSON.stringify({
          jobId: 'job-1',
          conversationId: 'conv-1',
          deliveryId: 'delivery-1',
        }),
      }),
      buildRecord({
        messageId: 'unsupported-version',
        body: JSON.stringify({
          version: 2,
          jobId: 'job-2',
          conversationId: 'conv-2',
          deliveryId: 'delivery-2',
        }),
      }),
    ]);

    const result = await mod.handler(event);

    expect(mockProcessJob).not.toHaveBeenCalled();
    expect(result.batchItemFailures).toEqual([
      { itemIdentifier: 'missing-version' },
      { itemIdentifier: 'unsupported-version' },
    ]);
  });

  it('keeps processing later records after a processor failure', async () => {
    mockProcessJob
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('succeeded');
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({
        messageId: 'm1',
        body: JSON.stringify({ version: 1, jobId: 'job-1', conversationId: 'conv-1', deliveryId: 'delivery-1' }),
      }),
      buildRecord({
        messageId: 'm2',
        body: JSON.stringify({ version: 1, jobId: 'job-2', conversationId: 'conv-2', deliveryId: 'delivery-2' }),
      }),
    ]);

    const result = await mod.handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
    expect(mockProcessJob).toHaveBeenCalledTimes(2);
  });

  it('creates the orchestration context once across concurrent invocations (cached init)', async () => {
    const mod = await getModule();
    mockCreateCtx.mockImplementation(async () => ({
      get: () => ({ processJob: mockProcessJob }),
    }));
    const event = buildEvent([
      buildRecord({
        messageId: 'm1',
        body: JSON.stringify({ version: 1, jobId: 'job-1', conversationId: 'conv-1', deliveryId: 'delivery-1' }),
      }),
    ]);

    await Promise.all([mod.handler(event), mod.handler(event), mod.handler(event)]);

    expect(mockCreateCtx).toHaveBeenCalledTimes(1);
  });

  it('retries initialization after the first failure and then processes successfully', async () => {
    mockCreateCtx
      .mockRejectedValueOnce(new Error('secret unavailable'))
      .mockResolvedValueOnce({
        get: () => ({ processJob: mockProcessJob }),
      });
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({
        messageId: 'm1',
        body: JSON.stringify({ version: 1, jobId: 'job-1', conversationId: 'conv-1', deliveryId: 'delivery-1' }),
      }),
    ]);

    await expect(mod.handler(event)).rejects.toThrow('secret unavailable');

    const result = await mod.handler(event);
    expect(result.batchItemFailures).toEqual([]);
  });
});
