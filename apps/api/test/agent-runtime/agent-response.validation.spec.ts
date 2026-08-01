import {
  parseAgentResponse,
  classifyHttpError,
  classifyAgentError,
  AgentRuntimeError,
} from '../../src/integrations/agent-runtime/agent-response.validation';

const REQUEST_ID = 'corr-1';

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    request_id: REQUEST_ID,
    status: 'success',
    answer: 'Answer',
    api_version: '1.0',
    generated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('parseAgentResponse', () => {
  it('parses a valid success response', () => {
    const parsed = parseAgentResponse(JSON.stringify(validBody()), REQUEST_ID);
    expect(parsed.status).toBe('success');
    expect(parsed.answer).toBe('Answer');
    expect(parsed.request_id).toBe(REQUEST_ID);
    expect(parsed.api_version).toBe('1.0');
  });

  it('parses a valid fallback response', () => {
    const parsed = parseAgentResponse(
      JSON.stringify(
        validBody({ status: 'fallback', fallback_reason: 'bedrock-down' }),
      ),
      REQUEST_ID,
    );
    expect(parsed.status).toBe('fallback');
    expect(parsed.fallback_reason).toBe('bedrock-down');
  });

  it('parses a valid clarification response', () => {
    const parsed = parseAgentResponse(
      JSON.stringify(
        validBody({ status: 'clarification', clarification: 'Please clarify', answer: null }),
      ),
      REQUEST_ID,
    );
    expect(parsed.status).toBe('clarification');
    expect(parsed.clarification).toBe('Please clarify');
  });

  it('rejects a request_id mismatch to prevent cross-conversation answers', () => {
    expect(() =>
      parseAgentResponse(JSON.stringify(validBody({ request_id: 'other' })), REQUEST_ID),
    ).toThrow('request_id mismatch');
  });

  it('rejects missing or invalid api_version', () => {
    expect(() =>
      parseAgentResponse(JSON.stringify(validBody({ api_version: undefined })), REQUEST_ID),
    ).toThrow('missing valid api_version');
    expect(() =>
      parseAgentResponse(JSON.stringify(validBody({ api_version: '2.0' })), REQUEST_ID),
    ).toThrow('missing valid api_version');
  });

  it('rejects missing generated_at', () => {
    expect(() =>
      parseAgentResponse(JSON.stringify(validBody({ generated_at: undefined })), REQUEST_ID),
    ).toThrow('missing generated_at');
  });

  it('rejects missing request_id', () => {
    expect(() =>
      parseAgentResponse(JSON.stringify(validBody({ request_id: undefined })), REQUEST_ID),
    ).toThrow('missing request_id');
  });

  it('rejects an invalid status value', () => {
    expect(() =>
      parseAgentResponse(JSON.stringify(validBody({ status: 'weird' })), REQUEST_ID),
    ).toThrow('invalid status');
  });

  it('rejects a clarification response missing clarification text', () => {
    expect(() =>
      parseAgentResponse(
        JSON.stringify(validBody({ status: 'clarification' })),
        REQUEST_ID,
      ),
    ).toThrow('missing clarification text');
  });

  it('rejects a non-clarification response missing answer text', () => {
    expect(() =>
      parseAgentResponse(
        JSON.stringify(validBody({ status: 'success', answer: undefined })),
        REQUEST_ID,
      ),
    ).toThrow('missing answer text');
  });

  it('rejects a non-JSON response body', () => {
    expect(() => parseAgentResponse('not-json', REQUEST_ID)).toThrow(
      'not a valid JSON object',
    );
  });

  it('rejects a JSON array body', () => {
    expect(() => parseAgentResponse('[]', REQUEST_ID)).toThrow(
      'not a valid JSON object',
    );
  });

  it('filters non-string citation labels but preserves valid ones', () => {
    const parsed = parseAgentResponse(
      JSON.stringify(
        validBody({
          verified_citations: [
            '[VIC RTA 1997 Sec 63]',
            42,
            { label: 'nope' },
            null,
            '[NSW RTA 2010 Sec 1]',
          ],
        }),
      ),
      REQUEST_ID,
    );
    expect(parsed.verified_citations).toEqual([
      '[VIC RTA 1997 Sec 63]',
      '[NSW RTA 2010 Sec 1]',
    ]);
  });

  it('normalizes non-finite numeric fields to null rather than coercing strings', () => {
    const parsed = parseAgentResponse(
      JSON.stringify(
        validBody({
          citation_verified_rate: NaN,
          latency_ms: '120',
        }),
      ),
      REQUEST_ID,
    );
    expect(parsed.citation_verified_rate).toBeNull();
    expect(parsed.latency_ms).toBeNull();
  });

  it('keeps valid numeric fields as numbers', () => {
    const parsed = parseAgentResponse(
      JSON.stringify(
        validBody({ citation_verified_rate: 0.85, latency_ms: 120 }),
      ),
      REQUEST_ID,
    );
    expect(parsed.citation_verified_rate).toBe(0.85);
    expect(parsed.latency_ms).toBe(120);
  });

  it('normalizes string, object, and missing numbers to null without coercing', () => {
    const parsed = parseAgentResponse(
      JSON.stringify(
        validBody({
          citation_verified_rate: '0.85',
          latency_ms: {},
        }),
      ),
      REQUEST_ID,
    );
    expect(parsed.citation_verified_rate).toBeNull();
    expect(parsed.latency_ms).toBeNull();
  });
});

describe('classifyHttpError', () => {
  it('treats 422 as terminal (non-retryable)', () => {
    const err = classifyHttpError(422);
    expect(err).toBeInstanceOf(AgentRuntimeError);
    expect(err.retryable).toBe(false);
    expect(err.statusCode).toBe(422);
  });

  it('treats 403 as terminal (non-retryable)', () => {
    expect(classifyHttpError(403).retryable).toBe(false);
  });

  it('treats 429 as retryable', () => {
    expect(classifyHttpError(429).retryable).toBe(true);
  });

  it('treats 5xx as retryable', () => {
    expect(classifyHttpError(500).retryable).toBe(true);
    expect(classifyHttpError(503).retryable).toBe(true);
  });

  it('treats other 4xx as retryable', () => {
    expect(classifyHttpError(400).retryable).toBe(true);
    expect(classifyHttpError(401).retryable).toBe(true);
  });
});

describe('classifyAgentError', () => {
  it('passes through an existing AgentRuntimeError', () => {
    const original = new AgentRuntimeError('x', false, 422);
    expect(classifyAgentError(original)).toBe(original);
  });

  it('classifies timeout/abort errors as retryable', () => {
    expect(classifyAgentError(new Error('Request timed out')).retryable).toBe(true);
    expect(classifyAgentError(new Error('The operation was aborted')).retryable).toBe(true);
  });

  it('classifies network errors as retryable', () => {
    for (const msg of [
      'connect ECONNREFUSED 127.0.0.1:8080',
      'ENOTFOUND agent.example.com',
      'read ECONNRESET',
      'fetch failed',
    ]) {
      expect(classifyAgentError(new Error(msg)).retryable).toBe(true);
    }
  });

  it('classifies unexpected errors and non-errors as retryable', () => {
    expect(classifyAgentError(new Error('boom')).retryable).toBe(true);
    expect(classifyAgentError('string error').retryable).toBe(true);
    expect(classifyAgentError(undefined).retryable).toBe(true);
  });
});
