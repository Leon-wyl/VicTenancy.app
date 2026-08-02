"use client";

import * as React from "react";
import { ArrowUp } from "lucide-react";
import { useChat } from "../chat-provider";
import type { ConversationJob } from "../types";
import { MessageBubble } from "./message-bubble";
import { PendingResponse } from "./pending-response";

/**
 * The message window. The API serves newest-first pages; the provider stores
 * them oldest → newest, so this component simply renders state in order.
 *
 * Scroll-position contract for "Load older messages": the container's
 * scrollHeight/scrollTop are recorded in the click handler (never during
 * render), then a layout effect compensates for the height delta after the
 * older page is prepended — the reading position doesn't jump.
 */
export function MessageList({ conversationId }: { conversationId: string }) {
  const { messageWindow, jobsFor, loadOlderMessages } = useChat();
  const window = messageWindow(conversationId);
  const jobs = jobsFor(conversationId);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const prependMeasureRef = React.useRef<{
    height: number;
    top: number;
  } | null>(null);
  const prevCountRef = React.useRef(0);
  const [loadingOlder, setLoadingOlder] = React.useState(false);

  const jobsByTrigger = React.useMemo(() => {
    const map = new Map<string, ConversationJob>();
    for (const job of jobs) {
      const existing = map.get(job.triggerMessageId);
      if (!existing || existing.createdAt < job.createdAt) {
        map.set(job.triggerMessageId, job);
      }
    }
    return map;
  }, [jobs]);

  const loadedIds = React.useMemo(
    () => new Set(window.messages.map((message) => message.id)),
    [window.messages],
  );

  async function handleLoadOlder() {
    const container = scrollRef.current;
    if (container) {
      prependMeasureRef.current = {
        height: container.scrollHeight,
        top: container.scrollTop,
      };
    }
    setLoadingOlder(true);
    try {
      await loadOlderMessages(conversationId);
    } finally {
      setLoadingOlder(false);
    }
  }

  // Compensate scroll after a prepended page changes the content height.
  React.useLayoutEffect(() => {
    const measure = prependMeasureRef.current;
    const container = scrollRef.current;
    if (!measure || !container) return;
    prependMeasureRef.current = null;
    const delta = container.scrollHeight - measure.height;
    if (delta > 0) {
      container.scrollTop = measure.top + delta;
    }
  }, [window.messages]);

  // Scroll to the bottom on first hydration and when a new message arrives
  // while the reader is already near the bottom.
  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const previous = prevCountRef.current;
    prevCountRef.current = window.messages.length;
    if (window.messages.length === 0) return;
    const isInitial = previous === 0;
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      120;
    if (isInitial || nearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [window.messages]);

  if (!window.hydrated) {
    return (
      <div
        className="flex flex-1 items-center justify-center px-5"
        aria-live="polite"
      >
        <p className="text-sm text-ink/45">Loading conversation…</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-5"
      style={{ overscrollBehavior: "contain" }}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        {window.hasMoreOlder && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={() => void handleLoadOlder()}
              disabled={loadingOlder}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink/60 transition-colors hover:bg-ink/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40"
            >
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}

        {window.messages.length === 0 && (
          <p className="py-10 text-center text-sm text-ink/45">
            No messages yet — ask your first question below.
          </p>
        )}

        {window.messages.map((message) => {
          const job =
            message.authorRole === "user"
              ? jobsByTrigger.get(message.id)
              : undefined;
          // Terminal job cards render only when the trigger message is inside
          // the loaded window (which it is by construction here).
          const showJobCard =
            job && job.status !== "succeeded" && loadedIds.has(message.id);
          return (
            <React.Fragment key={message.id}>
              <div style={{ contentVisibility: "auto", containIntrinsicSize: "0 96px" }}>
                <MessageBubble message={message} />
              </div>
              {showJobCard && (
                <PendingResponse
                  job={job}
                  triggerContent={message.content}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
