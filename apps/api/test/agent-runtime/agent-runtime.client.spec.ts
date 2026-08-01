import { AgentRuntimeClient } from '../../src/integrations/agent-runtime/agent-runtime.client';
import { AgentRuntimeError } from '../../src/integrations/agent-runtime';

jest.mock('../../src/integrations/agent-runtime/sigv4.signer', () => ({
  signRequest: jest.fn(),
}));

import { signRequest } from '../../src/integrations/agent-runtime/sigv4.signer';
const signRequestMock = signRequest as jest.Mock;

const REQUEST_ID = 'corr-1';
const LOCAL_URL = 'http://127.0.0.1:8080';
const SIGNED_URL = 'https://gateway.example-execute-api.test';

function validBody() {
  return JSON.stringify({
    request_id: REQUEST_ID,
    status: 'success',
    answer: 'Answer',
    api_version: '1.0',
    generated_at: '2026-08-01T00:00:00Z',
  });
}

function env(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function setEnv(mode: 'local' | 'aws_iam'): void {
  env('AGENT_RUNTIME_MODE', mode);
  env('AGENT_RUNTIME_INVOKE_URL', mode === 'aws_iam' ? SIGNED_URL : LOCAL_URL);
  if (mode === 'aws_iam') {
    env('AGENT_RUNTIME_EXECUTE_API_ARN', 'arn:aws:execute-api:ap-southeast-2:123456789012:test/*/POST/api/agent/invoke');
    env('AWS_REGION', 'ap-southeast-2');
  }
}

function clearEnv(): void {
  env('AGENT_RUNTIME_MODE', undefined);
  env('AGENT_RUNTIME_INVOKE_URL', undefined);
  env('AGENT_RUNTIME_EXECUTE_API_ARN', undefined);
  env('AWS_REGION', undefined);
}

describe('AgentRuntimeClient', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    clearEnv();
    signRequestMock.mockReset();
    signRequestMock.mockResolvedValue({
      Authorization: 'AWS4-HMAC-SHA256 Credential=test/20260801/ap-southeast-2/execute-api/aws4_request',
      'X-Amz-Date': '20260801T000000Z',
      'Content-Type': 'application/json',
      Host: 'gateway.example-execute-api.test',
    });
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearEnv();
    jest.restoreAllMocks();
  });

  it('does not load or validate AGENT_RUNTIME_* configuration at construction time', () => {
    expect(() => new AgentRuntimeClient()).not.toThrow();
  });

  it('validates configuration only when the client is used to invoke', async () => {
    const client = new AgentRuntimeClient();
    await expect(
      client.invoke({
        question: 'q',
        requestId: REQUEST_ID,
        threadId: 'thread-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
      }),
    ).rejects.toThrow('AGENT_RUNTIME_MODE must be "local" or "aws_iam"');
  });

  it('rejects an unsupported mode value', () => {
    env('AGENT_RUNTIME_MODE', 'bogus');
    env('AGENT_RUNTIME_INVOKE_URL', LOCAL_URL);
    const client = new AgentRuntimeClient();
    expect(() => client.getMode()).toThrow('AGENT_RUNTIME_MODE must be "local" or "aws_iam"');
  });

  it('rejects local mode without an invoke URL', () => {
    env('AGENT_RUNTIME_MODE', 'local');
    const client = new AgentRuntimeClient();
    expect(() => client.getMode()).toThrow('AGENT_RUNTIME_INVOKE_URL is required');
  });

  it('rejects aws_iam mode without execute-api ARN and region', () => {
    env('AGENT_RUNTIME_MODE', 'aws_iam');
    env('AGENT_RUNTIME_INVOKE_URL', SIGNED_URL);
    const client = new AgentRuntimeClient();
    expect(() => client.getMode()).toThrow('AGENT_RUNTIME_EXECUTE_API_ARN is required');
  });

  it('returns the configured mode and invoke URL without making network calls', () => {
    setEnv('local');
    const client = new AgentRuntimeClient();
    expect(client.getMode()).toBe('local');
    expect(client.getInvokeUrl()).toBe(LOCAL_URL);
  });

  it('in local mode POSTs the request contract exactly once and parses a valid response', async () => {
    setEnv('local');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => validBody(),
    });
    const client = new AgentRuntimeClient();

    const response = await client.invoke({
      question: 'What are my rights?',
      requestId: REQUEST_ID,
      threadId: 'thread-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      messageId: 'msg-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${LOCAL_URL}/api/agent/invoke`);
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body as string);
    expect(payload).toEqual({
      question: 'What are my rights?',
      jurisdiction: undefined,
      api_version: '1.0',
      request_id: REQUEST_ID,
      thread_id: 'thread-1',
      user_id: 'user-1',
      conversation_id: 'conv-1',
      message_id: 'msg-1',
    });
    expect(response.answer).toBe('Answer');
  });

  it('in aws_iam mode signs the request with the region and merges the signed headers without exposing them', async () => {
    setEnv('aws_iam');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => validBody(),
    });
    const client = new AgentRuntimeClient();

    const response = await client.invoke({
      question: 'q',
      requestId: REQUEST_ID,
      threadId: 'thread-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      messageId: 'msg-1',
    });

    expect(signRequestMock).toHaveBeenCalledTimes(1);
    const [signedUrl, region, body] = signRequestMock.mock.calls[0];
    expect(signedUrl).toBe(`${SIGNED_URL}/api/agent/invoke`);
    expect(region).toBe('ap-southeast-2');
    expect(JSON.parse(body as string).request_id).toBe(REQUEST_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SIGNED_URL}/api/agent/invoke`);
    const headers = init.headers as Record<string, string>;
    // Assert presence and shape only; never snapshot Authorization/signed values.
    expect(headers).toHaveProperty('Authorization');
    expect(headers).toHaveProperty('X-Amz-Date');
    expect(headers).toHaveProperty('Content-Type', 'application/json');
    expect(response.answer).toBe('Answer');
  });

  it('does not sign in local mode', async () => {
    setEnv('local');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => validBody(),
    });
    const client = new AgentRuntimeClient();

    await client.invoke({
      question: 'q',
      requestId: REQUEST_ID,
      threadId: 't',
      userId: 'u',
      conversationId: 'c',
      messageId: 'm',
    });

    expect(signRequestMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed response body as a retryable error', async () => {
    setEnv('local');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'not-json',
    });
    const client = new AgentRuntimeClient();

    const err = (await client
      .invoke({
        question: 'q',
        requestId: REQUEST_ID,
        threadId: 't',
        userId: 'u',
        conversationId: 'c',
        messageId: 'm',
      })
      .then(
        () => null,
        (e: unknown) => e,
      )) as AgentRuntimeError | null;

    expect(err).toBeInstanceOf(AgentRuntimeError);
    expect(err!.retryable).toBe(true);
  });

  it('classifies HTTP 422 as a terminal error', async () => {
    setEnv('local');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => '{}',
    });
    const client = new AgentRuntimeClient();

    const err = (await client
      .invoke({
        question: 'q',
        requestId: REQUEST_ID,
        threadId: 't',
        userId: 'u',
        conversationId: 'c',
        messageId: 'm',
      })
      .then(
        () => null,
        (e: unknown) => e,
      )) as AgentRuntimeError | null;

    expect(err).toBeInstanceOf(AgentRuntimeError);
    expect(err!.retryable).toBe(false);
    expect(err!.statusCode).toBe(422);
  });

  it('classifies HTTP 429 as a retryable error', async () => {
    setEnv('local');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{}',
    });
    const client = new AgentRuntimeClient();

    const err = (await client
      .invoke({
        question: 'q',
        requestId: REQUEST_ID,
        threadId: 't',
        userId: 'u',
        conversationId: 'c',
        messageId: 'm',
      })
      .then(
        () => null,
        (e: unknown) => e,
      )) as AgentRuntimeError | null;

    expect(err).toBeInstanceOf(AgentRuntimeError);
    expect(err!.retryable).toBe(true);
    expect(err!.statusCode).toBe(429);
  });

  it('propagates network failures for retryable classification by the caller', async () => {
    setEnv('local');
    fetchMock.mockRejectedValue(new Error('fetch failed'));
    const client = new AgentRuntimeClient();

    const err = (await client
      .invoke({
        question: 'q',
        requestId: REQUEST_ID,
        threadId: 't',
        userId: 'u',
        conversationId: 'c',
        messageId: 'm',
      })
      .then(
        () => null,
        (e: unknown) => e,
      )) as Error | null;

    // The client does not swallow or re-type transport errors; the processor
    // wraps them as retryable via classifyAgentError.
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain('fetch failed');
  });
});
