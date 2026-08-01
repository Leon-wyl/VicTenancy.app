import type { SQSEvent, SQSRecord } from 'aws-lambda';

const mockCreateCtx = jest.fn();
const mockTerminalizeFailed = jest.fn();

jest.mock('../../src/modules/agent-orchestration/bootstrap', () => ({
  createAwsOrchestrationContext: mockCreateCtx,
}));

function buildRecord(overrides: Partial<SQSRecord> = {}): SQSRecord {
  return {
    messageId: 'msg-id-1',
    receiptHandle: 'receipt-1',
    body: '{}',
    attributes: {
      ApproximateReceiveCount: '3',
      SentTimestamp: '1754000000000',
      SenderId: 'sender-1',
      ApproximateFirstReceiveTimestamp: '1754000000000',
    },
    messageAttributes: {},
    md5OfBody: 'md5',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:ap-southeast-2:123456789012:victenancy-staging-agent-jobs-dlq.fifo',
    awsRegion: 'ap-southeast-2',
    ...overrides,
  };
}

function buildEvent(records: SQSRecord[]): SQSEvent {
  return { Records: records };
}

type TerminalizerModule = typeof import('../../src/terminalizer');

async function getModule(): Promise<TerminalizerModule> {
  return import('../../src/terminalizer');
}

describe('terminalizer lambda handler', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCreateCtx.mockReset();
    mockTerminalizeFailed.mockReset();
    mockTerminalizeFailed.mockResolvedValue(true);
    mockCreateCtx.mockImplementation(async () => ({
      get: () => ({ terminalizeFailed: mockTerminalizeFailed }),
    }));
  });

  it('calls terminalizeFailed with the exact jobId and deliveryId for valid DLQ payloads', async () => {
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({
        messageId: 'dlq-1',
        body: JSON.stringify({ version: 1, jobId: 'job-1', deliveryId: 'delivery-1' }),
      }),
      buildRecord({
        messageId: 'dlq-2',
        body: JSON.stringify({ version: 1, jobId: 'job-2', deliveryId: 'delivery-2' }),
      }),
    ]);

    await mod.handler(event);

    expect(mockTerminalizeFailed).toHaveBeenCalledTimes(2);
    expect(mockTerminalizeFailed).toHaveBeenNthCalledWith(1, 'job-1', 'delivery-1');
    expect(mockTerminalizeFailed).toHaveBeenNthCalledWith(2, 'job-2', 'delivery-2');
  });

  it('skips malformed DLQ payloads without failing the batch', async () => {
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({ messageId: 'bad-1', body: 'not-json' }),
      buildRecord({ messageId: 'bad-2', body: JSON.stringify({ version: 1 }) }),
      buildRecord({
        messageId: 'good-1',
        body: JSON.stringify({ version: 1, jobId: 'job-3', deliveryId: 'delivery-3' }),
      }),
    ]);

    await mod.handler(event);

    expect(mockTerminalizeFailed).toHaveBeenCalledTimes(1);
    expect(mockTerminalizeFailed).toHaveBeenCalledWith('job-3', 'delivery-3');
  });

  it('rejects when terminalizeFailed throws so the batch is redelivered', async () => {
    mockTerminalizeFailed.mockRejectedValue(new Error('DB unavailable'));
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({
        messageId: 'dlq-1',
        body: JSON.stringify({ version: 1, jobId: 'job-1', deliveryId: 'delivery-1' }),
      }),
    ]);

    await expect(mod.handler(event)).rejects.toThrow('DB unavailable');
  });

  it('creates the orchestration context once across concurrent invocations (cached init)', async () => {
    const mod = await getModule();
    const event = buildEvent([
      buildRecord({
        messageId: 'dlq-1',
        body: JSON.stringify({ version: 1, jobId: 'job-1', deliveryId: 'delivery-1' }),
      }),
    ]);

    await Promise.all([mod.handler(event), mod.handler(event), mod.handler(event)]);

    expect(mockCreateCtx).toHaveBeenCalledTimes(1);
  });
});
