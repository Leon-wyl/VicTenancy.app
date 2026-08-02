"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useChat } from "../chat-provider";
import { isActiveJob, isFailedJob } from "../state";
import type { ConversationJob } from "../types";

/**
 * Inline card shown where the assistant's response will appear.
 *
 * Terminal (failed/cancelled) cards are rendered by the message list ONLY
 * when the job's trigger message is inside the loaded window — older failures
 * surface as the user pages older messages into view, so long conversations
 * don't fill with historical errors.
 */
export function PendingResponse({
  job,
  triggerContent,
}: {
  job: ConversationJob;
  triggerContent: string | null;
}) {
  const { requestReuse } = useChat();

  if (isActiveJob(job)) {
    return (
      <div className="flex justify-start" aria-live="polite">
        <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md border border-ink/10 bg-white px-4 py-3 text-sm text-ink/55">
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 rounded-full bg-mint motion-safe:animate-pulse" />
            <span
              className="h-1.5 w-1.5 rounded-full bg-mint motion-safe:animate-pulse"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full bg-mint motion-safe:animate-pulse"
              style={{ animationDelay: "300ms" }}
            />
          </span>
          {job.status === "queued"
            ? "Preparing your answer"
            : "Checking Victorian tenancy information"}
        </div>
      </div>
    );
  }

  if (isFailedJob(job)) {
    const reusable = triggerContent ?? job.triggerMessage?.content ?? null;
    return (
      <div className="flex justify-start">
        <div
          role="alert"
          className="max-w-[92%] rounded-2xl rounded-bl-md border border-[#b91c1c]/25 bg-[#b91c1c]/5 px-4 py-3 md:max-w-[85%]"
        >
          <p className="flex items-start gap-2 text-sm leading-relaxed text-[#7f1d1d]">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            {job.status === "cancelled"
              ? "This question was cancelled before an answer was produced."
              : "We couldn't produce an answer for this question. You can reuse the question below and try again."}
          </p>
          {reusable && (
            <button
              type="button"
              onClick={() => requestReuse(reusable)}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-[#b91c1c]/25 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#7f1d1d] transition-colors hover:bg-[#b91c1c]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b91c1c]/30"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reuse question
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
