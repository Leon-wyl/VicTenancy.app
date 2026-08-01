import type { SQSEvent, SQSRecord } from 'aws-lambda';
import {
  createAwsOrchestrationContext,
} from './modules/agent-orchestration/bootstrap';
import { TerminalizerService } from './modules/agent-orchestration/terminalizer.service';

let handlerPromise: Promise<TerminalizerService> | null = null;

async function initHandler(): Promise<TerminalizerService> {
  if (handlerPromise) {
    return handlerPromise;
  }

  const init = (async (): Promise<TerminalizerService> => {
    const ctx = await createAwsOrchestrationContext();
    return ctx.get(TerminalizerService);
  })();

  handlerPromise = init;

  handlerPromise = init.catch((error) => {
    handlerPromise = null;
    throw error;
  });

  return handlerPromise;
}

interface DlqPayload {
  version: number;
  jobId: string;
  deliveryId: string;
}

function parsePayload(record: SQSRecord): DlqPayload | null {
  try {
    const payload = JSON.parse(record.body) as DlqPayload;
    if (
      typeof payload.jobId !== 'string' ||
      typeof payload.deliveryId !== 'string'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export const handler = async (event: SQSEvent): Promise<void> => {
  const terminalizer = await initHandler();

  for (const record of event.Records) {
    const payload = parsePayload(record);
    if (!payload) continue;

    await terminalizer.terminalizeFailed(
      payload.jobId,
      payload.deliveryId,
    );
  }
};
