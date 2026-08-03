import * as React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => {
  const channel = {
    on: vi.fn().mockReturnThis(),
    // Deliberately stay silent: this models a channel that appears connected
    // but receives no database events (for example, a publication mismatch).
    subscribe: vi.fn(),
  };
  return {
    createClient: () => ({
      channel: () => channel,
      removeChannel: vi.fn().mockResolvedValue(undefined),
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
  };
});

import { ChatProvider, useChat } from "./chat-provider";
import { listJobs, listMessages } from "./api";
import { useConversationRealtime } from "./use-conversation-realtime";
import type { ConversationJob } from "./types";

let chat: ReturnType<typeof useChat>;

function Probe() {
  chat = useChat();
  useConversationRealtime("conv-1");
  return null;
}

function activeJob(): ConversationJob {
  return {
    id: "job-1",
    conversationId: "conv-1",
    triggerMessageId: "message-1",
    assistantMessageId: null,
    status: "processing",
    attempt: 1,
    maxAttempts: 3,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:01.000Z",
    completedAt: null,
    errorCode: null,
    triggerMessage: null,
  };
}

describe("useConversationRealtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(listMessages).mockResolvedValue({
      data: [
        {
          id: "assistant-1",
          conversationId: "conv-1",
          authorRole: "assistant",
          content: "Answer from the agent",
          metadata: null,
          createdAt: "2026-08-01T00:00:02.000Z",
        },
      ],
      page: { nextCursor: null },
    });
    vi.mocked(listJobs).mockResolvedValue({
      data: [],
      page: { nextCursor: null },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconciles an active job when a silent Realtime channel misses its completion", async () => {
    const view = render(
      <ChatProvider userId="user-1">
        <Probe />
      </ChatProvider>,
    );

    await act(async () => {
      chat.applyRealtimeJob(activeJob());
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(listMessages).toHaveBeenCalledWith("conv-1", {
      order: "desc",
      limit: 100,
    });
    expect(listJobs).toHaveBeenCalledWith("conv-1");
    expect(chat.messageWindow("conv-1").messages).toMatchObject([
      { id: "assistant-1", content: "Answer from the agent" },
    ]);
    expect(chat.jobsFor("conv-1")).toEqual([]);

    view.unmount();
  });
});
