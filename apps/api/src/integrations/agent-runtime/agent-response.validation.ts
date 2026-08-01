import { AgentResponse, AgentResponseStatuses } from './agent-response.types';

export class AgentRuntimeError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'AgentRuntimeError';
  }
}

export function classifyAgentError(error: unknown): AgentRuntimeError {
  if (error instanceof AgentRuntimeError) return error;

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('timeout') || msg.includes('abort') || msg.includes('aborted')) {
      return new AgentRuntimeError('Agent Runtime request timed out', true);
    }

    if (
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('econnreset') ||
      msg.includes('fetch failed')
    ) {
      return new AgentRuntimeError('Agent Runtime network error', true);
    }

    return new AgentRuntimeError(
      `Agent Runtime unexpected error: ${error.message}`,
      true,
    );
  }

  return new AgentRuntimeError('Unknown Agent Runtime error', true);
}

export function classifyHttpError(
  status: number,
): AgentRuntimeError {
  if (status === 422) {
    return new AgentRuntimeError('Agent Runtime validation failure', false, status);
  }

  if (status === 403) {
    return new AgentRuntimeError(
      'Agent Runtime authentication failure — check SigV4 configuration',
      false,
      status,
    );
  }

  if (status === 429 || status >= 500) {
    return new AgentRuntimeError(
      `Agent Runtime returned HTTP ${status}`,
      true,
      status,
    );
  }

  return new AgentRuntimeError(
    `Agent Runtime returned unexpected HTTP ${status}`,
    true,
    status,
  );
}

function parseJsonSafe(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function parseAgentResponse(
  raw: string,
  expectedRequestId: string,
): AgentResponse {
  const obj = parseJsonSafe(raw);

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new AgentRuntimeError(
      'Agent Runtime response is not a valid JSON object',
      true,
    );
  }

  const data = obj as Record<string, unknown>;

  if (!isString(data.api_version) || data.api_version !== '1.0') {
    throw new AgentRuntimeError(
      'Agent Runtime response missing valid api_version',
      true,
    );
  }

  if (!isString(data.generated_at)) {
    throw new AgentRuntimeError(
      'Agent Runtime response missing generated_at',
      true,
    );
  }

  if (!isString(data.request_id)) {
    throw new AgentRuntimeError(
      'Agent Runtime response missing request_id',
      true,
    );
  }

  if (data.request_id !== expectedRequestId) {
    throw new AgentRuntimeError(
      `Agent Runtime response request_id mismatch: expected ${expectedRequestId}, got ${data.request_id}`,
      true,
    );
  }

  if (
    !isString(data.status) ||
    !AgentResponseStatuses.includes(data.status as never)
  ) {
    throw new AgentRuntimeError(
      `Agent Runtime response has invalid status: ${String(data.status)}`,
      true,
    );
  }

  const status = data.status as AgentResponse['status'];

  if (status === 'clarification' && !isString(data.clarification)) {
    throw new AgentRuntimeError(
      'Agent Runtime clarification response missing clarification text',
      true,
    );
  }

  if (status !== 'clarification' && !isString(data.answer)) {
    throw new AgentRuntimeError(
      `Agent Runtime "${status}" response missing answer text`,
      true,
    );
  }

  const verifiedCitations = Array.isArray(data.verified_citations)
    ? data.verified_citations.filter(isString)
    : undefined;

  return {
    request_id: data.request_id,
    status,
    answer: isString(data.answer) ? data.answer : null,
    verified_citations: verifiedCitations,
    citation_verified_rate:
      typeof data.citation_verified_rate === 'number' &&
      Number.isFinite(data.citation_verified_rate)
        ? data.citation_verified_rate
        : null,
    clarification: isString(data.clarification) ? data.clarification : null,
    fallback_reason: isString(data.fallback_reason)
      ? data.fallback_reason
      : null,
    selected_jurisdiction: isString(data.selected_jurisdiction)
      ? data.selected_jurisdiction
      : null,
    latency_ms:
      typeof data.latency_ms === 'number' && Number.isFinite(data.latency_ms)
        ? data.latency_ms
        : null,
    trace_id: isString(data.trace_id) ? data.trace_id : null,
    api_version: data.api_version,
    generated_at: data.generated_at,
  };
}
