import type { SQSEvent, SQSRecord } from 'aws-lambda';
import {
  createAwsOrchestrationContext,
} from './modules/agent-orchestration/bootstrap';
import { AgentJobProcessor } from './modules/agent-orchestration/agent-job-processor';

let handlerPromise: Promise<AgentJobProcessor> | null = null;

async function initHandler(): Promise<AgentJobProcessor> {
  if (handlerPromise) {
    return handlerPromise;
  }

  const init = (async (): Promise<AgentJobProcessor> => {
    const ctx = await createAwsOrchestrationContext();
    return ctx.get(AgentJobProcessor);
  })();

  handlerPromise = init;

  handlerPromise = init.catch((error) => {
    handlerPromise = null;
    throw error;
  });

  return handlerPromise;
}

interface WorkerPayload {
  version: number;
  jobId: string;
  conversationId: string;
  deliveryId: string;
}

function parsePayload(record: SQSRecord): WorkerPayload | null {
  try {
    const payload = JSON.parse(record.body) as WorkerPayload;
    if (
      payload.version !== 1 ||
      typeof payload.jobId !== 'string' ||
      typeof payload.deliveryId !== 'string' ||
      typeof payload.conversationId !== 'string'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export const handler = async (
  event: SQSEvent,
): Promise<{ batchItemFailures: { itemIdentifier: string }[] }> => {
  const processor = await initHandler();
  const failures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    const payload = parsePayload(record);
    if (!payload) {
      failures.push({ itemIdentifier: record.messageId });
      continue;
    }

    try {
      const result = await processor.processJob(
        payload.jobId,
        payload.deliveryId,
      );

      if (result === 'noop') {
        continue;
      }
    } catch {
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
};
