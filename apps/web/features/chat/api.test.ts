import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "token-abc" } },
      }),
    },
  }),
}));

import { ApiError, createMessage, listMessages } from "./api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("chat api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the Supabase access token as a Bearer credential", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: [], page: { nextCursor: null } }),
    );

    await listMessages("conv-1");

    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-abc");
    expect(headers["X-Request-Id"]).toMatch(UUID_RE);
  });

  it("attaches a fresh UUID Idempotency-Key to every message send", async () => {
    const fetchMock = vi.mocked(fetch);
    const payload = {
      message: {
        id: "m1",
        conversationId: "conv-1",
        authorRole: "user",
        content: "Hi",
        metadata: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      job: {
        id: "j1",
        conversationId: "conv-1",
        triggerMessageId: "m1",
        status: "queued",
        correlationId: "c1",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    };
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(201, payload)),
    );

    await createMessage("conv-1", "Hi");
    await createMessage("conv-1", "Hi again");

    const firstKey = (
      fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    )["Idempotency-Key"];
    const secondKey = (
      fetchMock.mock.calls[1][1]?.headers as Record<string, string>
    )["Idempotency-Key"];

    expect(firstKey).toMatch(UUID_RE);
    expect(secondKey).toMatch(UUID_RE);
    // Distinct logical sends must never share a key; the key exists so the
    // API can dedupe a retried submission of the SAME logical send.
    expect(firstKey).not.toBe(secondKey);
  });

  it("preserves an explicitly supplied key for a retry", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        message: {},
        job: {},
      }),
    );

    await createMessage("conv-1", "Hi", "retry-key");

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(headers["Idempotency-Key"]).toBe("retry-key");
  });

  it("requests messages newest-first with a limit by default", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: [], page: { nextCursor: null } }),
    );

    await listMessages("conv-1");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("order=desc");
    expect(url).toContain("limit=100");
  });

  it("maps 429 responses to a rate-limit error carrying the retry delay", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(
        429,
        { message: "Too many requests" },
        { "Retry-After": "42", "X-Request-Id": "req-1" },
      ),
    );

    const error = await createMessage("conv-1", "Hi").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.isRateLimited).toBe(true);
    expect(error.retryAfterSeconds).toBe(42);
    expect(error.requestId).toBe("req-1");
  });

  it("maps 401 responses to a recoverable unauthorized error", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(401, { message: "Unauthorized" }));

    const error = await listMessages("conv-1").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.isUnauthorized).toBe(true);
    expect(error.isRateLimited).toBe(false);
  });

  it("maps network failures to a status-0 error", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await listMessages("conv-1").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });
});
