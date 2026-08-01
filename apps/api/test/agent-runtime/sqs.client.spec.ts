const mockSend = jest.fn();
const mockSendMessageCommand = jest.fn();

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  SendMessageCommand: jest.fn().mockImplementation((input: unknown) => {
    mockSendMessageCommand(input);
    return { input };
  }),
}));

import type { QueueMessagePayload } from '../../src/integrations/agent-runtime/sqs.client';

const QUEUE_URL =
  'https://sqs.ap-southeast-2.amazonaws.com/123456789012/victenancy-staging-agent-jobs.fifo';

type SqsClientModule = typeof import('../../src/integrations/agent-runtime/sqs.client');

async function getModule(): Promise<SqsClientModule> {
  return import('../../src/integrations/agent-runtime/sqs.client');
}

describe('SqsClient', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSend.mockReset();
    mockSend.mockResolvedValue(undefined);
    mockSendMessageCommand.mockReset();
    delete process.env.SQS_MAIN_QUEUE_URL;
  });

  it('reports not configured when SQS_MAIN_QUEUE_URL is absent', async () => {
    const mod = await getModule();
    const client = new mod.SqsClient();
    expect(client.isConfigured()).toBe(false);
  });

  it('throws when sending without a configured queue URL', async () => {
    const mod = await getModule();
    const client = new mod.SqsClient();
    await expect(
      client.sendMessage({
        version: 1,
        jobId: 'job-1',
        conversationId: 'conv-1',
        deliveryId: 'delivery-1',
      }),
    ).rejects.toThrow('SQS_MAIN_QUEUE_URL is not configured');
  });

  it('sends with MessageGroupId = conversationId and MessageDeduplicationId = deliveryId (never jobId)', async () => {
    process.env.SQS_MAIN_QUEUE_URL = QUEUE_URL;
    const mod = await getModule();
    const client = new mod.SqsClient();

    await client.sendMessage({
      version: 1,
      jobId: 'job-1',
      conversationId: 'conv-1',
      deliveryId: 'delivery-1',
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSendMessageCommand).toHaveBeenCalledTimes(1);
    const input = mockSendMessageCommand.mock.calls[0][0] as {
      QueueUrl: string;
      MessageGroupId: string;
      MessageDeduplicationId: string;
      MessageBody: string;
    };
    expect(input.QueueUrl).toBe(QUEUE_URL);
    expect(input.MessageGroupId).toBe('conv-1');
    expect(input.MessageDeduplicationId).toBe('delivery-1');
    expect(input.MessageDeduplicationId).not.toBe('job-1');
    const parsedBody = JSON.parse(input.MessageBody) as QueueMessagePayload;
    expect(parsedBody).toEqual({
      version: 1,
      jobId: 'job-1',
      conversationId: 'conv-1',
      deliveryId: 'delivery-1',
    });
  });
});
