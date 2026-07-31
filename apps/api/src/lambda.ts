import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import serverlessExpress from '@codegenie/serverless-express';
import { loadRuntimeConfig } from './common/runtime-config/load-runtime-config';
import { createApp } from './bootstrap/app.factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handlerPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function initHandler(): Promise<any> {
  if (handlerPromise) {
    return handlerPromise;
  }

  handlerPromise = (async () => {
    await loadRuntimeConfig();
    const nestApp = await createApp();
    await nestApp.init();
    const expressApp = nestApp.getHttpAdapter().getInstance();
    return serverlessExpress({ app: expressApp });
  })();

  handlerPromise = handlerPromise.catch((error) => {
    handlerPromise = null;
    throw error;
  });

  return handlerPromise;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<unknown> => {
  const h = await initHandler();
  return h(event, context);
};
