import * as React from "react";
import { render, screen } from "@testing-library/react";
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

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/app",
}));

vi.mock("../api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api")>();
  return {
    ...original,
    createConversation: vi.fn(),
    createMessage: vi.fn(),
  };
});

import { ChatProvider } from "../chat-provider";
import { createConversation, createMessage } from "../api";
import { MessageComposer } from "./message-composer";

function renderComposer(conversationId: string | null = "conv-1") {
  return render(
    <ChatProvider userId="user-1">
      <MessageComposer conversationId={conversationId} />
    </ChatProvider>,
  );
}

const createMessageResponse = {
  message: {
    id: "m1",
    conversationId: "conv-1",
    authorRole: "user",
    content: "Hello",
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

describe("MessageComposer keyboard behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createMessage).mockResolvedValue(createMessageResponse);
  });

  it("sends on Enter and clears the draft", async () => {
    const user = userEvent.setup();
    renderComposer();

    const textarea = screen.getByLabelText(
      "Ask a Victorian tenancy question",
    );
    await user.type(textarea, "Can my landlord raise the rent?");
    await user.keyboard("{Enter}");

    expect(createMessage).toHaveBeenCalledWith(
      "conv-1",
      "Can my landlord raise the rent?",
      expect.any(String),
    );
    expect(textarea).toHaveValue("");
  });

  it("does NOT send on Shift+Enter (newline)", async () => {
    const user = userEvent.setup();
    renderComposer();

    const textarea = screen.getByLabelText(
      "Ask a Victorian tenancy question",
    );
    await user.type(textarea, "Line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(createMessage).not.toHaveBeenCalled();
  });

  it("keeps the send button disabled for an empty draft", () => {
    renderComposer();
    expect(screen.getByLabelText("Send question")).toBeDisabled();
  });

  it("enforces the 4000 character limit and shows a counter", async () => {
    const user = userEvent.setup();
    renderComposer();

    const textarea = screen.getByLabelText(
      "Ask a Victorian tenancy question",
    ) as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(4000);

    await user.type(textarea, "abc");
    expect(screen.getByText("3/4000")).toBeInTheDocument();
  });

  it("creates a conversation first on the welcome screen, then navigates", async () => {
    const user = userEvent.setup();
    vi.mocked(createConversation).mockResolvedValue({
      id: "conv-new",
      title: "Hello",
      lastActivityAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    vi.mocked(createMessage).mockResolvedValue({
      ...createMessageResponse,
      message: { ...createMessageResponse.message, conversationId: "conv-new" },
      job: { ...createMessageResponse.job, conversationId: "conv-new" },
    });

    render(
      <ChatProvider userId="user-1">
        <MessageComposer conversationId={null} />
      </ChatProvider>,
    );

    const textarea = screen.getByLabelText(
      "Ask a Victorian tenancy question",
    );
    await user.type(textarea, "Hello");
    await user.keyboard("{Enter}");

    expect(createConversation).toHaveBeenCalledWith("Hello", expect.any(String));
    expect(createMessage).toHaveBeenCalledWith(
      "conv-new",
      "Hello",
      expect.any(String),
    );
    expect(pushMock).toHaveBeenCalledWith("/app/c/conv-new");
  });

  it("shows a rate-limit error with the retry delay on 429", async () => {
    const user = userEvent.setup();
    const { ApiError } = await import("../api");
    vi.mocked(createMessage).mockRejectedValue(
      new ApiError(429, "Too many requests", "req-1", 30),
    );

    renderComposer();
    const textarea = screen.getByLabelText(
      "Ask a Victorian tenancy question",
    );
    await user.type(textarea, "Hello");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(/request limit.*30 seconds/i),
    ).toBeInTheDocument();
    // The draft survives a failed send.
    expect(textarea).toHaveValue("Hello");
  });
});
