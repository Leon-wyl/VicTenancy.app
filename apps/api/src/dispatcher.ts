import type { ScheduledEvent } from 'aws-lambda';
import {
  createAwsOrchestrationContext,
} from './modules/agent-orchestration/bootstrap';
import { DispatcherService } from './modules/agent-orchestration/dispatcher.service';

let handlerPromise: Promise<DispatcherService> | null = null;

async function initHandler(): Promise<DispatcherService> {
  if (handlerPromise) {
    return handlerPromise;
  }

  const init = (async (): Promise<DispatcherService> => {
    const ctx = await createAwsOrchestrationContext();
    return ctx.get(DispatcherService);
  })();

  handlerPromise = init;

  handlerPromise = init.catch((error) => {
    handlerPromise = null;
    throw error;
  });

  return handlerPromise;
}

export const handler = async (event: ScheduledEvent): Promise<void> => {
  void event;
  const dispatcher = await initHandler();
  await dispatcher.runDueOutboxDispatch(10);
};
