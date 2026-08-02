"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import * as api from "./api";
import { mapConversationRow } from "./mappers";
import {
  mergeJobsSnapshot,
  removeConversation,
  reverseDescPage,
  upsertConversation,
  upsertConversations,
  upsertJob,
  upsertMessagesAsc,
} from "./state";
import type {
  ChatMessage,
  CitationSummary,
  ConversationJob,
  ConversationSummary,
} from "./types";

export interface MessageWindow {
  /** Oldest → newest, always. */
  messages: ChatMessage[];
  hasMoreOlder: boolean;
  hydrated: boolean;
}

const EMPTY_WINDOW: MessageWindow = {
  messages: [],
  hasMoreOlder: false,
  hydrated: false,
};

export interface ReuseRequest {
  content: string;
  nonce: number;
}

interface ChatContextValue {
  userId: string;
  conversations: ConversationSummary[];
  conversationsLoaded: boolean;
  hasMoreConversations: boolean;
  reuseRequest: ReuseRequest | null;

  messageWindow(conversationId: string): MessageWindow;
  jobsFor(conversationId: string): ConversationJob[];
  citationsFor(messageId: string): CitationSummary[] | undefined;

  ensureConversations(): Promise<void>;
  loadMoreConversations(): Promise<void>;
  hydrateConversation(conversationId: string): Promise<void>;
  loadOlderMessages(conversationId: string): Promise<void>;
  ensureCitations(conversationId: string, messageId: string): void;

  sendMessage(
    content: string,
    conversationId: string | null,
    idempotencyKey?: string,
  ): Promise<{ conversationId: string }>;
  rename(conversationId: string, title: string): Promise<void>;
  remove(conversationId: string): Promise<void>;

  requestReuse(content: string): void;
  consumeReuse(): void;

  applyRealtimeMessage(message: ChatMessage): void;
  applyRealtimeJob(job: ConversationJob): void;
}

const ChatContext = React.createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = React.useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}

const MAX_TITLE_LENGTH = 60;

export class ChatSendError extends Error {
  constructor(
    message: string,
    readonly conversationId: string,
    readonly cause: unknown,
  ) {
    super(message);
    this.name = "ChatSendError";
  }
}

function deriveTitle(content: string): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  if (singleLine.length <= MAX_TITLE_LENGTH) return singleLine;
  return `${singleLine.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

export function ChatProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [conversations, setConversations] = React.useState<
    ConversationSummary[]
  >([]);
  const [hasMoreConversations, setHasMoreConversations] =
    React.useState(false);
  const [conversationsLoaded, setConversationsLoaded] = React.useState(false);

  const [windows, setWindows] = React.useState<Record<string, MessageWindow>>(
    {},
  );
  const [jobsByConv, setJobsByConv] = React.useState<
    Record<string, ConversationJob[]>
  >({});
  const [citationsByMessage, setCitationsByMessage] = React.useState<
    Record<string, CitationSummary[]>
  >({});
  const [reuseRequest, setReuseRequest] = React.useState<ReuseRequest | null>(
    null,
  );

  // Bookkeeping for hydration commits: when was each job last touched by a
  // realtime event? Lets a snapshot remove rows that vanished (succeeded)
  // without dropping rows created/updated while the snapshot was in flight.
  const jobSeenAtRef = React.useRef(new Map<string, number>());
  const citationsInFlightRef = React.useRef(new Set<string>());
  const conversationsInFlightRef = React.useRef(false);
  const conversationsPendingRef = React.useRef(false);
  const conversationsCursorRef = React.useRef<string | null>(null);
  const olderCursorsRef = React.useRef(new Map<string, string | null>());
  const olderInFlightRef = React.useRef(new Set<string>());

  const messageWindow = React.useCallback(
    (conversationId: string): MessageWindow =>
      windows[conversationId] ?? EMPTY_WINDOW,
    [windows],
  );

  const jobsFor = React.useCallback(
    (conversationId: string): ConversationJob[] =>
      jobsByConv[conversationId] ?? [],
    [jobsByConv],
  );

  const citationsFor = React.useCallback(
    (messageId: string): CitationSummary[] | undefined =>
      citationsByMessage[messageId],
    [citationsByMessage],
  );

  const ensureConversations = React.useCallback(async () => {
    if (conversationsInFlightRef.current) {
      conversationsPendingRef.current = true;
      return;
    }
    conversationsInFlightRef.current = true;
    try {
      const page = await api.listConversations();
      setConversations((current) => upsertConversations(current, page.data));
      conversationsCursorRef.current = page.page.nextCursor;
      setHasMoreConversations(page.page.nextCursor !== null);
      setConversationsLoaded(true);
    } finally {
      conversationsInFlightRef.current = false;
      if (conversationsPendingRef.current) {
        conversationsPendingRef.current = false;
        void ensureConversations();
      }
    }
  }, []);

  const loadMoreConversations = React.useCallback(async () => {
    if (conversationsInFlightRef.current) return;
    const cursor = conversationsCursorRef.current;
    if (!cursor) return;
    conversationsInFlightRef.current = true;
    try {
      const page = await api.listConversations(cursor);
      setConversations((current) => upsertConversations(current, page.data));
      conversationsCursorRef.current = page.page.nextCursor;
      setHasMoreConversations(page.page.nextCursor !== null);
    } finally {
      conversationsInFlightRef.current = false;
    }
  }, []);

  const hydrateConversation = React.useCallback(
    async (conversationId: string) => {
      const startedAt = Date.now();
      const [messagesPage, jobsPage] = await Promise.all([
        api.listMessages(conversationId, { order: "desc", limit: 100 }),
        api.listJobs(conversationId),
      ]);

      const snapshot = jobsPage.data;
      const seenAt = jobSeenAtRef.current;
      for (const job of snapshot) seenAt.set(job.id, Date.now());

      if (!olderCursorsRef.current.has(conversationId)) {
        olderCursorsRef.current.set(
          conversationId,
          messagesPage.page.nextCursor,
        );
      }

      setWindows((current) => {
        const existing = current[conversationId] ?? EMPTY_WINDOW;
        const merged = upsertMessagesAsc(
          existing.messages,
          reverseDescPage(messagesPage.data),
        );
        return {
          ...current,
          [conversationId]: {
            messages: merged,
            hasMoreOlder: messagesPage.page.nextCursor !== null,
            hydrated: true,
          },
        };
      });

      setCitationsByMessage((current) => {
        const next = { ...current };
        for (const message of messagesPage.data) {
          if (message.citations !== undefined) {
            next[message.id] = message.citations;
          }
        }
        return next;
      });

      setJobsByConv((current) => ({
        ...current,
        [conversationId]: mergeJobsSnapshot(
          current[conversationId] ?? [],
          snapshot,
          (jobId) => (seenAt.get(jobId) ?? 0) < startedAt,
        ),
      }));
    },
    [],
  );

  const loadOlderMessages = React.useCallback(
    async (conversationId: string) => {
      if (olderInFlightRef.current.has(conversationId)) return;
      const cursor = olderCursorsRef.current.get(conversationId);
      if (!cursor) return;
      olderInFlightRef.current.add(conversationId);
      try {
        const page = await api.listMessages(conversationId, {
          order: "desc",
          limit: 100,
          cursor,
        });

        olderCursorsRef.current.set(conversationId, page.page.nextCursor);

        setCitationsByMessage((current) => {
          const next = { ...current };
          for (const message of page.data) {
            if (message.citations !== undefined) {
              next[message.id] = message.citations;
            }
          }
          return next;
        });

        setWindows((current) => {
          const existing = current[conversationId] ?? EMPTY_WINDOW;
          return {
            ...current,
            [conversationId]: {
              ...existing,
              messages: upsertMessagesAsc(
                existing.messages,
                reverseDescPage(page.data),
              ),
              hasMoreOlder: page.page.nextCursor !== null,
            },
          };
        });
      } finally {
        olderInFlightRef.current.delete(conversationId);
      }
    },
    [],
  );

  const ensureCitations = React.useCallback(
    (conversationId: string, messageId: string) => {
      if (citationsInFlightRef.current.has(messageId)) return;
      citationsInFlightRef.current.add(messageId);
      api
        .listCitations(conversationId, messageId)
        .then((citations) => {
          setCitationsByMessage((current) =>
            current[messageId] ? current : { ...current, [messageId]: citations },
          );
        })
        .catch(() => {
          // Citation failure must not break the conversation — no badges.
        })
        .finally(() => {
          citationsInFlightRef.current.delete(messageId);
        });
    },
    [],
  );

  const applyRealtimeMessage = React.useCallback((message: ChatMessage) => {
    setWindows((current) => {
      const existing = current[message.conversationId] ?? EMPTY_WINDOW;
      return {
        ...current,
        [message.conversationId]: {
          ...existing,
          messages: upsertMessagesAsc(existing.messages, [message]),
        },
      };
    });
  }, []);

  const applyRealtimeJob = React.useCallback((job: ConversationJob) => {
    jobSeenAtRef.current.set(job.id, Date.now());
    setJobsByConv((current) => ({
      ...current,
      [job.conversationId]: upsertJob(current[job.conversationId] ?? [], job),
    }));
  }, []);

  const sendMessage = React.useCallback(
    async (
      content: string,
      conversationId: string | null,
      idempotencyKey = crypto.randomUUID(),
    ): Promise<{ conversationId: string }> => {
      let targetId = conversationId;
      if (!targetId) {
        const conversation = await api.createConversation(
          deriveTitle(content),
          idempotencyKey,
        );
        targetId = conversation.id;
        setConversations((current) => upsertConversation(current, conversation));
      }

      let message: Awaited<ReturnType<typeof api.createMessage>>["message"];
      let job: Awaited<ReturnType<typeof api.createMessage>>["job"];
      try {
        ({ message, job } = await api.createMessage(
          targetId,
          content,
          idempotencyKey,
        ));
      } catch (error) {
        throw new ChatSendError("Message submission failed", targetId, error);
      }
      applyRealtimeMessage(message);
      applyRealtimeJob({
        id: job.id,
        conversationId: job.conversationId,
        triggerMessageId: job.triggerMessageId,
        assistantMessageId: null,
        status: job.status,
        attempt: 0,
        maxAttempts: 3,
        createdAt: job.createdAt,
        updatedAt: job.createdAt,
        completedAt: null,
        errorCode: null,
        triggerMessage: {
          id: message.id,
          content: message.content,
          createdAt: message.createdAt,
        },
      });
      setConversations((current) => {
        const existing = current.find(
          (conversation) => conversation.id === targetId,
        );
        if (!existing) return current;
        return upsertConversation(current, {
          ...existing,
          lastActivityAt: message.createdAt,
        });
      });
      return { conversationId: targetId };
    },
    [applyRealtimeJob, applyRealtimeMessage],
  );

  const rename = React.useCallback(
    async (conversationId: string, title: string) => {
      const updated = await api.renameConversation(conversationId, title);
      setConversations((current) => upsertConversation(current, updated));
    },
    [],
  );

  const remove = React.useCallback(async (conversationId: string) => {
    await api.deleteConversation(conversationId);
    // No DELETE realtime subscription (DELETE events can't be filtered) —
    // local removal after a successful delete is the contract.
    setConversations((current) => removeConversation(current, conversationId));
    setWindows((current) => {
      if (!(conversationId in current)) return current;
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
    setJobsByConv((current) => {
      if (!(conversationId in current)) return current;
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
  }, []);

  const requestReuse = React.useCallback((content: string) => {
    setReuseRequest({ content, nonce: Date.now() });
  }, []);

  const consumeReuse = React.useCallback(() => {
    setReuseRequest(null);
  }, []);

  // Sidebar conversations channel: INSERT + UPDATE only (no DELETE — see
  // remove()). Realtime is notification-only; the API stays the source of truth.
  React.useEffect(() => {
    const supabase = createClient();
    // DELETE events cannot be safely filtered by owner without transmitting
    // old-row data. A low-frequency API reconciliation removes stale rows
    // from another tab while keeping Realtime notification-only.
    const reconciliationTimer = window.setInterval(() => {
      void ensureConversations().catch(() => {});
    }, 60_000);
    const channel = supabase
      .channel(`chat:conversations:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          filter: `owner_user_id=eq.${userId}`,
        },
        (payload) => {
          setConversations((current) =>
            upsertConversation(
              current,
              mapConversationRow(
                payload.new as Parameters<typeof mapConversationRow>[0],
              ),
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `owner_user_id=eq.${userId}`,
        },
        (payload) => {
          setConversations((current) =>
            upsertConversation(
              current,
              mapConversationRow(
                payload.new as Parameters<typeof mapConversationRow>[0],
              ),
            ),
          );
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void ensureConversations().catch(() => {});
        }
      });

    return () => {
      window.clearInterval(reconciliationTimer);
      void supabase.removeChannel(channel);
    };
  }, [ensureConversations, userId]);

  const value: ChatContextValue = {
    userId,
    conversations,
    conversationsLoaded,
    hasMoreConversations,
    reuseRequest,
    messageWindow,
    jobsFor,
    citationsFor,
    ensureConversations,
    loadMoreConversations,
    hydrateConversation,
    loadOlderMessages,
    ensureCitations,
    sendMessage,
    rename,
    remove,
    requestReuse,
    consumeReuse,
    applyRealtimeMessage,
    applyRealtimeJob,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
