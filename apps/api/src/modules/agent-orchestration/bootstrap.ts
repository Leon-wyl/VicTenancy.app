import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { loadRuntimeConfig } from '../../common/runtime-config/load-runtime-config';
import { AgentOrchestrationModule } from './agent-orchestration.module';

let awsContextPromise: Promise<INestApplicationContext> | null = null;

export async function createAwsOrchestrationContext(): Promise<INestApplicationContext> {
  if (awsContextPromise) {
    return awsContextPromise;
  }

  awsContextPromise = (async () => {
    await loadRuntimeConfig();
    return NestFactory.createApplicationContext(
      AgentOrchestrationModule,
    );
  })();

  awsContextPromise.catch(() => {
    awsContextPromise = null;
  });

  return awsContextPromise;
}

export async function createLocalOrchestrationContext(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(
    AgentOrchestrationModule,
  );
}
