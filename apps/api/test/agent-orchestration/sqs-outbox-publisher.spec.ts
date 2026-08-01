import { SqsOutboxPublisher } from '../../src/modules/agent-orchestration/sqs-outbox-publisher';
import { OutboxService } from '../../src/modules/agent-orchestration/outbox.service';
import { SqsClient } from '../../src/integrations/agent-runtime';

function makeOutbox() {
  return {
    claimForDispatch: jest.fn(),
    markPublished: jest.fn(),
    releaseDispatchLease: jest.fn(),
  };
}

interface SqsFake {
  isConfigured: jest.Mock;
  sendMessage: jest.Mock;
}

function makeSqs(configured: boolean): SqsFake {
  return {
    isConfigured: jest.fn().mockReturnValue(configured),
    sendMessage: jest.fn(),
  };
}

describe('SqsOutboxPublisher', () => {
  it('is a no-op when the SQS client is absent or not configured', async () => {
    const outbox = makeOutbox();
    const publisher = new SqsOutboxPublisher(
      outbox as unknown as OutboxService,
      undefined,
    );
    await publisher.tryPublish('job-1');
    expect(outbox.claimForDispatch).not.toHaveBeenCalled();

    const unconfigured = new SqsOutboxPublisher(
      outbox as unknown as OutboxService,
      makeSqs(false) as unknown as SqsClient,
    );
    await unconfigured.tryPublish('job-1');
    expect(outbox.claimForDispatch).not.toHaveBeenCalled();
  });

  it('is a no-op when no outbox row is eligible for dispatch', async () => {
    const outbox = makeOutbox();
    outbox.claimForDispatch.mockResolvedValue(null);
    const sqs = makeSqs(true);
    const publisher = new SqsOutboxPublisher(
      outbox as unknown as OutboxService,
      sqs as unknown as SqsClient,
    );

    await publisher.tryPublish('job-1');

    expect(outbox.claimForDispatch).toHaveBeenCalledWith('job-1');
    expect(sqs.sendMessage).not.toHaveBeenCalled();
    expect(outbox.markPublished).not.toHaveBeenCalled();
  });

  it('sends the message using the canonical claim conversation and marks it published under the current lease token', async () => {
    const outbox = makeOutbox();
    outbox.claimForDispatch.mockResolvedValue({
      outboxId: 'outbox-1',
      agentJobId: 'job-1',
      conversationId: 'conv-1',
      deliveryId: 'delivery-1',
      dispatchLeaseToken: 'lease-1',
    });
    outbox.markPublished.mockResolvedValue(true);
    const sqs = makeSqs(true);
    const publisher = new SqsOutboxPublisher(
      outbox as unknown as OutboxService,
      sqs as unknown as SqsClient,
    );

    await publisher.tryPublish('job-1');

    expect(sqs.sendMessage).toHaveBeenCalledWith({
      version: 1,
      jobId: 'job-1',
      conversationId: 'conv-1',
      deliveryId: 'delivery-1',
    });
    expect(outbox.markPublished).toHaveBeenCalledWith('outbox-1', 'lease-1');
  });

  it('releases its own lease and swallows the error when the SQS send fails, never marking published', async () => {
    const outbox = makeOutbox();
    outbox.claimForDispatch.mockResolvedValue({
      outboxId: 'outbox-1',
      agentJobId: 'job-1',
      conversationId: 'conv-1',
      deliveryId: 'delivery-1',
      dispatchLeaseToken: 'lease-1',
    });
    const sqs = makeSqs(true);
    sqs.sendMessage.mockRejectedValue(new Error('SQS throttled'));
    const publisher = new SqsOutboxPublisher(
      outbox as unknown as OutboxService,
      sqs as unknown as SqsClient,
    );

    // Best-effort: the already-committed API message/job/outbox transaction is
    // NOT rolled back — the failure is swallowed after releasing the lease.
    await expect(publisher.tryPublish('job-1')).resolves.toBeUndefined();

    expect(outbox.releaseDispatchLease).toHaveBeenCalledWith('outbox-1', 'lease-1');
    expect(outbox.markPublished).not.toHaveBeenCalled();
  });
});
