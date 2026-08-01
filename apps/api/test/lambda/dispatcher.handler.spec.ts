import type { ScheduledEvent } from 'aws-lambda';

const mockCreateCtx = jest.fn();
const mockRunDispatch = jest.fn();

jest.mock('../../src/modules/agent-orchestration/bootstrap', () => ({
  createAwsOrchestrationContext: mockCreateCtx,
}));

function buildScheduledEvent(): ScheduledEvent {
  return {
    version: '0',
    id: 'event-id-1',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '123456789012',
    time: '2026-08-01T00:00:00Z',
    region: 'ap-southeast-2',
    resources: ['arn:aws:events:ap-southeast-2:123456789012:rule/victenancy-staging-dispatcher'],
    detail: {},
  };
}

type DispatcherModule = typeof import('../../src/dispatcher');

async function getModule(): Promise<DispatcherModule> {
  return import('../../src/dispatcher');
}

describe('dispatcher lambda handler', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCreateCtx.mockReset();
    mockRunDispatch.mockReset();
    mockRunDispatch.mockResolvedValue({ dispatched: 1, recovered: 0 });
    mockCreateCtx.mockImplementation(async () => ({
      get: () => ({ runDueOutboxDispatch: mockRunDispatch }),
    }));
  });

  it('invokes runDueOutboxDispatch once per scheduled event', async () => {
    const mod = await getModule();

    await mod.handler(buildScheduledEvent());

    expect(mockRunDispatch).toHaveBeenCalledTimes(1);
    expect(mockRunDispatch).toHaveBeenCalledWith(10);
  });

  it('creates the orchestration context once across concurrent scheduled events (cached init)', async () => {
    const mod = await getModule();
    mockCreateCtx.mockImplementation(async () => ({
      get: () => ({ runDueOutboxDispatch: mockRunDispatch }),
    }));

    await Promise.all([
      mod.handler(buildScheduledEvent()),
      mod.handler(buildScheduledEvent()),
      mod.handler(buildScheduledEvent()),
    ]);

    expect(mockCreateCtx).toHaveBeenCalledTimes(1);
    expect(mockRunDispatch).toHaveBeenCalledTimes(3);
  });

  it('propagates dispatch errors to trigger Lambda retry', async () => {
    mockRunDispatch.mockRejectedValue(new Error('DB unavailable'));
    const mod = await getModule();

    await expect(mod.handler(buildScheduledEvent())).rejects.toThrow(
      'DB unavailable',
    );
  });

  it('retries initialization after the first failure', async () => {
    mockCreateCtx
      .mockRejectedValueOnce(new Error('secret unavailable'))
      .mockResolvedValueOnce({
        get: () => ({ runDueOutboxDispatch: mockRunDispatch }),
      });
    const mod = await getModule();

    await expect(mod.handler(buildScheduledEvent())).rejects.toThrow(
      'secret unavailable',
    );

    await mod.handler(buildScheduledEvent());
    expect(mockRunDispatch).toHaveBeenCalledTimes(1);
  });
});
