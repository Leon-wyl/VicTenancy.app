import * as React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/app/c/conv-1",
}));

vi.mock("../api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api")>();
  return {
    ...original,
    listConversations: vi.fn(),
    createMessage: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
  };
});

import { ChatProvider, useChat } from "../chat-provider";
import {
  createMessage,
  deleteConversation,
  listConversations,
  renameConversation,
} from "../api";
import type { ConversationJob } from "../types";
import { MessageComposer } from "./message-composer";
import { PendingResponse } from "./pending-response";

let chat: ReturnType<typeof useChat>;

function Probe() {
  chat = useChat();
  return null;
}

const conversationsPage = {
  data: [
    {
      id: "conv-1",
      title: "Rent increase question",
      lastActivityAt: "2026-08-01T00:00:02.000Z",
      createdAt: "2026-08-01T00:00:02.000Z",
    },
    {
      id: "conv-2",
      title: "Bond refund",
      lastActivityAt: "2026-08-01T00:00:01.000Z",
      createdAt: "2026-08-01T00:00:01.000Z",
    },
  ],
  page: { nextCursor: null },
};

describe("conversation delete/rename flows", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(listConversations).mockResolvedValue(conversationsPage);

    render(
      <ChatProvider userId="user-1">
        <Probe />
      </ChatProvider>,
    );

    await act(async () => {
      await chat.ensureConversations();
    });
  });

  it("deletes a conversation after a successful API delete", async () => {
    vi.mocked(deleteConversation).mockResolvedValue(undefined);

    await act(async () => {
      await chat.remove("conv-1");
    });

    expect(deleteConversation).toHaveBeenCalledWith("conv-1");
    expect(chat.conversations.map((c) => c.id)).toEqual(["conv-2"]);
  });

  it("keeps the conversation locally when the API delete fails", async () => {
    const { ApiError } = await import("../api");
    vi.mocked(deleteConversation).mockRejectedValue(
      new ApiError(0, "Network error", null, null),
    );

    await expect(
      act(async () => {
        await chat.remove("conv-1");
      }),
    ).rejects.toThrow();

    expect(chat.conversations.map((c) => c.id)).toEqual([
      "conv-1",
      "conv-2",
    ]);
  });

  it("renames a conversation and re-reads the updated summary", async () => {
    vi.mocked(renameConversation).mockResolvedValue({
      id: "conv-1",
      title: "Rent increase in fixed term",
      lastActivityAt: "2026-08-01T00:00:02.000Z",
      createdAt: "2026-08-01T00:00:02.000Z",
    });

    await act(async () => {
      await chat.rename("conv-1", "Rent increase in fixed term");
    });

    expect(renameConversation).toHaveBeenCalledWith(
      "conv-1",
      "Rent increase in fixed term",
    );
    expect(chat.conversations[0].title).toBe("Rent increase in fixed term");
  });
});

describe("reuse-question flow", () => {
  it("fills the composer with the original question and focuses it", async () => {
    const user = userEvent.setup();
    const failedJob: ConversationJob = {
      id: "job-1",
      conversationId: "conv-1",
      triggerMessageId: "msg-1",
      assistantMessageId: null,
      status: "failed",
      attempt: 3,
      maxAttempts: 3,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:01:00.000Z",
      completedAt: "2026-08-01T00:01:00.000Z",
      errorCode: "AGENT_TIMEOUT",
      triggerMessage: {
        id: "msg-1",
        content: "Can my landlord evict me without a notice?",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    };

    render(
      <ChatProvider userId="user-1">
        <PendingResponse
          job={failedJob}
          triggerContent="Can my landlord evict me without a notice?"
        />
        <MessageComposer conversationId="conv-1" />
      </ChatProvider>,
    );

    await user.click(screen.getByRole("button", { name: /reuse question/i }));

    const textarea = screen.getByLabelText(
      "Ask a Victorian tenancy question",
    );
    expect(textarea).toHaveValue("Can my landlord evict me without a notice?");
    // Focus lands on the next animation frame.
    await screen.findByLabelText("Ask a Victorian tenancy question");
    await vi.waitFor(() => expect(textarea).toHaveFocus());
    // Nothing is sent silently — the user must confirm.
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("shows pending copy for an active job", () => {
    const activeJob: ConversationJob = {
      id: "job-2",
      conversationId: "conv-1",
      triggerMessageId: "msg-2",
      assistantMessageId: null,
      status: "processing",
      attempt: 1,
      maxAttempts: 3,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:30.000Z",
      completedAt: null,
      errorCode: null,
      triggerMessage: null,
    };

    render(
      <ChatProvider userId="user-1">
        <PendingResponse job={activeJob} triggerContent="q" />
      </ChatProvider>,
    );

    expect(
      screen.getByText("Checking Victorian tenancy information"),
    ).toBeInTheDocument();
  });
});
