"use client";

import Link from "next/link";
import { useConversationRealtime } from "../use-conversation-realtime";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";

export function ChatWorkspace({ conversationId }: { conversationId: string }) {
  const { error } = useConversationRealtime(conversationId);

  if (error === "not-found") {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-ink">Conversation unavailable</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            This conversation may have been deleted or you may not have access
            to it.
          </p>
          <Link
            href="/app"
            className="mt-5 inline-flex rounded-full bg-mint px-4 py-2 text-sm font-semibold text-ink hover:bg-mint/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/50"
          >
            Start a new conversation
          </Link>
        </div>
      </div>
    );
  }

  if (error === "unauthorized") {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-ink">Your session expired</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            Sign in again to continue this conversation.
          </p>
          <Link
            href={`/login?next=/app/c/${conversationId}`}
            className="mt-5 inline-flex rounded-full bg-mint px-4 py-2 text-sm font-semibold text-ink hover:bg-mint/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/50"
          >
            Sign in again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:h-screen">
      <MessageList conversationId={conversationId} />
      <MessageComposer conversationId={conversationId} />
    </div>
  );
}
