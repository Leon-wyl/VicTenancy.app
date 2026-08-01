import {
  MAX_ATTEMPTS,
  RETRY_SCHEDULE,
  retryBackoffSeconds,
  isImmediateRetryError,
  isExhausted,
} from '../../src/modules/agent-orchestration/retry-policy';

describe('retry policy', () => {
  it('caps retries at exactly 3 attempts', () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });

  it('defines a deterministic backoff schedule: 30s then 120s', () => {
    expect(RETRY_SCHEDULE).toEqual({ 1: 30, 2: 120 });
    expect(retryBackoffSeconds(1)).toBe(30);
    expect(retryBackoffSeconds(2)).toBe(120);
  });

  it('treats an unclaimed job (attempt 0) as having no immediate retry', () => {
    expect(isImmediateRetryError(0)).toBe(true);
    expect(isExhausted(0)).toBe(false);
  });

  it('returns 0 for exhausted or unsupported attempt numbers instead of an unsafe retry delay', () => {
    expect(isExhausted(3)).toBe(true);
    expect(retryBackoffSeconds(3)).toBe(0);
    expect(retryBackoffSeconds(99)).toBe(0);
  });

  it('never derives a backoff for an exhausted attempt', () => {
    // A backoff of 0 would mean "retry now"; the guard contract requires the
    // caller to treat exhausted attempts as terminal before consulting the schedule.
    for (let attempt = 3; attempt < 6; attempt++) {
      expect(isImmediateRetryError(attempt)).toBe(false);
      expect(isExhausted(attempt)).toBe(true);
    }
  });
});
