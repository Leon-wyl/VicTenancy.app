"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import { ApiError } from "../api";
import { ChatSendError, useChat } from "../chat-provider";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 4000;

export function MessageComposer({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const router = useRouter();
  const { sendMessage, reuseRequest, consumeReuse } = useChat();

  // The draft is deliberately LOCAL — typing must never re-render the
  // sidebar or message list. Only the infrequent reuseRequest crosses the
  // shared context boundary.
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const pendingSubmissionRef = React.useRef<{
    content: string;
    conversationId: string | null;
    idempotencyKey: string;
  } | null>(null);
  const counterId = React.useId();
  const errorId = React.useId();

  // "Reuse question" from a failed job injects the original question here and
  // focuses the composer; the user confirms before anything is sent.
  React.useEffect(() => {
    if (!reuseRequest) return;
    setDraft(reuseRequest.content);
    setError(null);
    consumeReuse();
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(
          textarea.value.length,
          textarea.value.length,
        );
      }
    });
  }, [reuseRequest, consumeReuse]);

  async function submit() {
    const content = draft.trim();
    if (!content || sending) return;
    const pending = pendingSubmissionRef.current;
    const sameSubmission = pending?.content === content;
    const idempotencyKey = sameSubmission
      ? pending.idempotencyKey
      : crypto.randomUUID();
    const targetConversationId = sameSubmission
      ? pending.conversationId
      : conversationId;
    setSending(true);
    setError(null);
    setStatusMessage("Sending your question");
    try {
      const result = await sendMessage(
        content,
        targetConversationId,
        idempotencyKey,
      );
      pendingSubmissionRef.current = null;
      setDraft("");
      setStatusMessage("Waiting for the assistant response");
      if (!conversationId) {
        router.push(`/app/c/${result.conversationId}`);
      }
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (e) {
      if (e instanceof ChatSendError) {
        pendingSubmissionRef.current = {
          content,
          conversationId: e.conversationId,
          idempotencyKey,
        };
      }
      setStatusMessage("");
      const cause = e instanceof ChatSendError ? e.cause : e;
      if (cause instanceof ApiError && cause.isRateLimited) {
        const wait = cause.retryAfterSeconds;
        setError(
          wait && wait > 0
            ? `You've reached the request limit. Please try again in about ${wait} second${wait === 1 ? "" : "s"}.`
            : "You've reached the request limit. Please try again shortly.",
        );
      } else if (cause instanceof ApiError && cause.isUnauthorized) {
        setError("Your session has expired. Please sign in again.");
      } else {
        setError(
          "Couldn't send your question. It's still here — please try again.",
        );
      }
    } finally {
      setSending(false);
    }
  }

  function handleDraftChange(value: string) {
    if (pendingSubmissionRef.current?.content !== value.trim()) {
      pendingSubmissionRef.current = null;
    }
    setDraft(value);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  const remaining = MAX_LENGTH - draft.length;

  return (
    <div
      className="border-t border-ink/10 bg-warm-white px-4 pb-4 pt-3"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
    >
      <div className="mx-auto w-full max-w-2xl">
        <label
          htmlFor="chat-composer"
          className="mb-1.5 block text-xs font-medium text-ink/50"
        >
          Ask a Victorian tenancy question
        </label>
        <div
          className={cn(
            "flex items-end gap-2 rounded-2xl border bg-white px-3 py-2 transition-colors",
            error ? "border-[#b91c1c]/40" : "border-ink/15 focus-within:border-mint",
          )}
        >
          <textarea
            ref={textareaRef}
            id="chat-composer"
            name="question"
            rows={Math.min(6, Math.max(1, draft.split("\n").length))}
            value={draft}
            onChange={(event) => handleDraftChange(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_LENGTH}
            placeholder="e.g. Can my landlord raise the rent during a fixed-term lease?"
            aria-label="Ask a Victorian tenancy question"
            aria-describedby={`${counterId}${error ? ` ${errorId}` : ""}`}
            className="max-h-40 min-h-[2.25rem] flex-1 resize-none bg-transparent px-1 py-1.5 text-[15px] leading-relaxed text-ink placeholder:text-ink/35 focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending || draft.trim().length === 0}
            aria-label="Send question"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-ink transition-colors hover:bg-mint/90 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/50 focus-visible:ring-offset-2"
          >
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <p className="text-[11px] text-ink/40">
            Enter to send · Shift+Enter for a new line
          </p>
          <p
            id={counterId}
            className={cn(
              "text-[11px] tabular-nums",
              remaining <= 200 ? "text-[#b91c1c]" : "text-ink/35",
            )}
          >
            {draft.length}/{MAX_LENGTH}
          </p>
        </div>
        <p aria-live="polite" className="sr-only">
          {statusMessage}
        </p>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1.5 text-[13px] leading-snug text-[#b91c1c]"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
