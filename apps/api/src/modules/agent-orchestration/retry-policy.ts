export const RETRY_SCHEDULE: Record<number, number> = {
  1: 30,
  2: 120,
};

export const MAX_ATTEMPTS = 3;
export const JOB_LEASE_SECONDS = 120;
export const DISPATCH_LEASE_SECONDS = 90;

export function retryBackoffSeconds(attempt: number): number {
  return RETRY_SCHEDULE[attempt] ?? 0;
}

export function isImmediateRetryError(deliveryAttempt: number): boolean {
  return deliveryAttempt < MAX_ATTEMPTS;
}

export function isExhausted(deliveryAttempt: number): boolean {
  return deliveryAttempt >= MAX_ATTEMPTS;
}
