import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runInRequestContext(ctx: RequestContext, fn: () => void): void {
  storage.run(ctx, fn);
}
