import { createClient } from "@/lib/supabase/client";
import type {
  ChatMessage,
  CitationSummary,
  ConversationJob,
  ConversationSummary,
  CreateMessageResponse,
  Page,
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    message: string,
    requestId: string | null,
    retryAfterSeconds: number | null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  return null;
}

async function getAccessToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new ApiError(401, "Not signed in", null, null);
  }
  return session.access_token;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
}

async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-Request-Id": crypto.randomUUID(),
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : null,
    });
  } catch {
    throw new ApiError(
      0,
      "Network error — check your connection and try again.",
      null,
      null,
    );
  }

  const requestId = response.headers.get("X-Request-Id");

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string") {
        message = body.message;
      } else if (Array.isArray(body.message) && body.message.length > 0) {
        message = String(body.message[0]);
      }
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(
      response.status,
      message,
      requestId,
      parseRetryAfter(response.headers.get("Retry-After")),
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function listConversations(cursor?: string): Promise<Page<ConversationSummary>> {
  const params = new URLSearchParams({ limit: "50" });
  if (cursor) params.set("cursor", cursor);
  return apiFetch<Page<ConversationSummary>>(`/v1/conversations?${params}`);
}

export function createConversation(
  title?: string,
  idempotencyKey?: string,
): Promise<ConversationSummary> {
  return apiFetch<ConversationSummary>("/v1/conversations", {
    method: "POST",
    body: title ? { title } : {},
    idempotencyKey,
  });
}

export function renameConversation(
  conversationId: string,
  title: string,
): Promise<ConversationSummary> {
  return apiFetch<ConversationSummary>(`/v1/conversations/${conversationId}`, {
    method: "PATCH",
    body: { title },
  });
}

export function deleteConversation(conversationId: string): Promise<void> {
  return apiFetch<void>(`/v1/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export function listMessages(
  conversationId: string,
  options: { order?: "asc" | "desc"; limit?: number; cursor?: string } = {},
): Promise<Page<ChatMessage>> {
  const params = new URLSearchParams({
    order: options.order ?? "desc",
    limit: String(options.limit ?? 100),
  });
  if (options.cursor) params.set("cursor", options.cursor);
  return apiFetch<Page<ChatMessage>>(
    `/v1/conversations/${conversationId}/messages?${params}`,
  );
}

export function createMessage(
  conversationId: string,
  content: string,
  idempotencyKey = crypto.randomUUID(),
): Promise<CreateMessageResponse> {
  return apiFetch<CreateMessageResponse>(
    `/v1/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: { content },
      idempotencyKey,
    },
  );
}

export function listJobs(
  conversationId: string,
  cursor?: string,
): Promise<Page<ConversationJob>> {
  const params = new URLSearchParams({ limit: "50" });
  if (cursor) params.set("cursor", cursor);
  return apiFetch<Page<ConversationJob>>(
    `/v1/conversations/${conversationId}/jobs?${params}`,
  );
}

export function listCitations(
  conversationId: string,
  messageId: string,
): Promise<CitationSummary[]> {
  return apiFetch<CitationSummary[]>(
    `/v1/conversations/${conversationId}/messages/${messageId}/citations`,
  );
}
