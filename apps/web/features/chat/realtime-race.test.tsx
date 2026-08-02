import * as React from "react";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  };
  return {
    createClient: () => ({
      channel: () => channel,
      removeChannel: vi.fn().mockResolvedValue(undefined),
      auth: {
        getSession: async () => ({
          data: { session: { access_token: "token" } },
        }),
      },
    }),
  };
});

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return {
    ...original,
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    listJobs: vi.fn(),
    listCitations: vi.fn(),
  };
});

import {
  ChatProvider,
  useChat,
  type MessageWindow,
} from "./chat-provider";
import { listJobs, listMessages } from "./api";
import type { ChatMessage, ConversationJob } from "./types";

let chat: ReturnType<typeof useChat>;

function Probe() {
  chat = useChat();
  return null;
}

function renderProvider() {
  return render(
    <ChatProvider userId="user-1">
      <Probe />
    </ChatProvider>,
  );
}

function message(id: string, createdAt: string): ChatMessage {
  return {
    id,
    conversationId: "conv-1",
    authorRole: "assistant",
    content: `content-${id}`,
    metadata: null,
    createdAt,
  };
}

function job(id: string, overrides: Partial<ConversationJob> = {}): ConversationJob {
  return {
    id,
    conversationId: "conv-1",
    triggerMessageId: "msg-trigger",
    assistantMessageId: null,
    status: "queued",
    attempt: 0,
    maxAttempts: 3,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    completedAt: null,
    errorCode: null,
    triggerMessage: null,
    ...overrides,
  };
}

function windowOf(conversationId: string): MessageWindow {
  return chat.messageWindow(conversationId);
}

describe("realtime events vs hydration snapshot — no lost or duplicated rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps an event that arrives BEFORE the hydration snapshot resolves", async () => {
    vi.mocked(listMessages).mockResolvedValue({
      data: [
        message("m2", "2026-08-01T00:00:02.000Z"),
        message("m1", "2026-08-01T00:00:01.000Z"),
      ],
      page: { nextCursor: null },
    });
    vi.mocked(listJobs).mockResolvedValue({ data: [], page: { nextCursor: null } });

    renderProvider();

    // Event lands first (written after the snapshot fetch started).
    await act(async () => {
      chat.applyRealtimeMessage(message("m3", "2026-08-01T00:00:03.000Z"));
    });
    // Then the forced reconciliation snapshot commits.
    await act(async () => {
      await chat.hydrateConversation("conv-1");
    });

    const ids = windowOf("conv-1").messages.map((m) => m.id);
    expect(ids).toEqual(["m1", "m2", "m3"]);
  });

  it("does not duplicate an event that repeats a row already in the snapshot", async () => {
    vi.mocked(listMessages).mockResolvedValue({
      data: [
        message("m2", "2026-08-01T00:00:02.000Z"),
        message("m1", "2026-08-01T00:00:01.000Z"),
      ],
      page: { nextCursor: null },
    });
    vi.mocked(listJobs).mockResolvedValue({ data: [], page: { nextCursor: null } });

    renderProvider();

    await act(async () => {
      await chat.hydrateConversation("conv-1");
    });
    // The same row arrives again as a (late/duplicate) realtime event.
    await act(async () => {
      chat.applyRealtimeMessage(message("m2", "2026-08-01T00:00:02.000Z"));
    });

    const messages = windowOf("conv-1").messages;
    expect(messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(messages.filter((m) => m.id === "m2")).toHaveLength(1);
  });

  it("appends post-hydration events in chronological position", async () => {
    vi.mocked(listMessages).mockResolvedValue({
      data: [message("m1", "2026-08-01T00:00:01.000Z")],
      page: { nextCursor: null },
    });
    vi.mocked(listJobs).mockResolvedValue({ data: [], page: { nextCursor: null } });

    renderProvider();

    await act(async () => {
      await chat.hydrateConversation("conv-1");
    });
    await act(async () => {
      chat.applyRealtimeMessage(message("m2", "2026-08-01T00:00:02.000Z"));
    });

    expect(windowOf("conv-1").messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("lets a fresher job event survive an older hydration snapshot", async () => {
    // Snapshot (fetched earlier) still shows the job queued…
    vi.mocked(listMessages).mockResolvedValue({
      data: [],
      page: { nextCursor: null },
    });
    vi.mocked(listJobs).mockResolvedValue({
      data: [job("j1", { status: "queued", updatedAt: "2026-08-01T00:00:01.000Z" })],
      page: { nextCursor: null },
    });

    renderProvider();

    // …but the realtime UPDATE (processing, newer) arrives first.
    await act(async () => {
      chat.applyRealtimeJob(
        job("j1", {
          status: "processing",
          updatedAt: "2026-08-01T00:00:02.000Z",
        }),
      );
    });
    await act(async () => {
      await chat.hydrateConversation("conv-1");
    });

    const jobs = chat.jobsFor("conv-1");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("processing");
  });

  it("removes jobs that reached a terminal state while offline", async () => {
    vi.mocked(listMessages).mockResolvedValue({
      data: [],
      page: { nextCursor: null },
    });
    // The snapshot excludes succeeded jobs entirely.
    vi.mocked(listJobs).mockResolvedValue({ data: [], page: { nextCursor: null } });

    renderProvider();

    // While "offline" we held a stale processing job from an earlier event.
    await act(async () => {
      chat.applyRealtimeJob(
        job("j1", {
          status: "processing",
          updatedAt: "2026-07-31T23:00:00.000Z",
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await chat.hydrateConversation("conv-1");
    });

    expect(chat.jobsFor("conv-1")).toEqual([]);
  });
});
