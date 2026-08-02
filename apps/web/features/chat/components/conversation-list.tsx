"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { useChat } from "../chat-provider";
import { ApiError } from "../api";
import type { ConversationSummary } from "../types";
import { cn } from "@/lib/utils";
import { ConversationItemMenu } from "./conversation-item-menu";
import { ConversationSearch } from "./conversation-search";

function ConversationItem({
  conversation,
  isActive,
}: {
  conversation: ConversationSummary;
  isActive: boolean;
}) {
  const { rename } = useChat();
  const [editing, setEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(conversation.title);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commitRename() {
    const title = draftTitle.trim();
    if (!title || title === conversation.title) {
      setEditing(false);
      setDraftTitle(conversation.title);
      return;
    }
    try {
      await rename(conversation.id, title);
      setEditing(false);
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.isRateLimited
          ? "Limit reached — try again shortly."
          : "Couldn't rename. Try again.",
      );
    }
  }

  if (editing) {
    return (
      <li className="px-1 py-0.5">
        <input
          ref={inputRef}
          value={draftTitle}
          name="conversation-title"
          autoComplete="off"
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commitRename();
            } else if (event.key === "Escape") {
              setEditing(false);
              setDraftTitle(conversation.title);
              setError(null);
            }
          }}
          onBlur={() => void commitRename()}
          maxLength={200}
          aria-label="Rename conversation"
          className="w-full rounded-lg border border-mint/60 bg-white px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40"
        />
        {error && (
          <p role="alert" className="mt-1 px-1 text-[11px] text-[#b91c1c]">
            {error}
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="group relative">
      <div
        className={cn(
          "flex items-center gap-1 rounded-lg pr-1 transition-colors",
          isActive ? "bg-mint/15" : "hover:bg-ink/5",
        )}
      >
        <Link
          href={`/app/c/${conversation.id}`}
          aria-current={isActive ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40"
        >
          <MessageSquare
            className={cn(
              "h-4 w-4 shrink-0",
              isActive ? "text-forest" : "text-ink/35",
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              "truncate text-sm",
              isActive ? "font-medium text-ink" : "text-ink/70",
            )}
          >
            {conversation.title}
          </span>
        </Link>
        <ConversationItemMenu
          conversationId={conversation.id}
          title={conversation.title}
          isActive={isActive}
          onStartRename={() => {
            setDraftTitle(conversation.title);
            setEditing(true);
          }}
        />
      </div>
    </li>
  );
}

export function ConversationList() {
  const pathname = usePathname();
  const {
    conversations,
    conversationsLoaded,
    hasMoreConversations,
    ensureConversations,
    loadMoreConversations,
  } = useChat();
  const [query, setQuery] = React.useState("");
  const [loadingMore, setLoadingMore] = React.useState(false);

  React.useEffect(() => {
    void ensureConversations().catch(() => {
      // Sidebar must degrade quietly; a later navigation retries.
    });
  }, [ensureConversations]);

  // Search intentionally covers only the conversations already loaded —
  // older history is reachable via "Load more conversations" below.
  const normalized = query.trim().toLowerCase();
  const visible = normalized
    ? conversations.filter((conversation) =>
        conversation.title.toLowerCase().includes(normalized),
      )
    : conversations;

  const activeId = pathname?.startsWith("/app/c/")
    ? pathname.slice("/app/c/".length)
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-1 pb-2">
        <ConversationSearch value={query} onChange={setQuery} />
      </div>

      <nav
        aria-label="Recent conversations"
        className="min-h-0 flex-1 overflow-y-auto px-1"
        style={{ overscrollBehavior: "contain" }}
      >
        {!conversationsLoaded ? (
          <p className="px-2 py-2 text-sm text-ink/40">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="px-2 py-2 text-sm text-ink/40">
            {normalized
              ? "No loaded conversations match your search."
              : "No conversations yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visible.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeId}
              />
            ))}
          </ul>
        )}

        {hasMoreConversations && (
          <div className="px-1 py-2">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                void loadMoreConversations().finally(() =>
                  setLoadingMore(false),
                );
              }}
              className="w-full rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-xs font-medium text-ink/55 transition-colors hover:bg-ink/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40"
            >
              {loadingMore ? "Loading…" : "Load more conversations"}
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}
