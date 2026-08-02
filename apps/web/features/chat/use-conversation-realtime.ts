"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { ApiError } from "./api";
import { useChat } from "./chat-provider";
import { mapJobRow, mapMessageRow } from "./mappers";
import { isActiveJob } from "./state";

const POLL_INTERVAL_MS = 10_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

export type ConversationRealtimeError =
  | "not-found"
  | "unauthorized"
  | "unavailable";

function classifyConversationError(error: unknown): ConversationRealtimeError | null {
  if (error instanceof ApiError) {
    if (error.status === 401) return "unauthorized";
    if (error.status === 404) return "not-found";
    return "unavailable";
  }
  return null;
}

/**
 * Scoped Realtime subscription for one conversation.
 *
 * Ordering contract (no lost rows):
 *  1. Subscribe FIRST.
 *  2. On first SUBSCRIBED, run a forced reconciliation hydration (messages +
 *     jobs) — a row written between "fetch then subscribe" would otherwise be
 *     lost forever.
 *  3. Realtime events and hydration snapshots both flow through the same
 *     upsert-by-ID reducers in the provider, so an event arriving before or
 *     after hydration is neither lost nor duplicated.
 *
 * Recovery contract:
 *  - Initial hydration is NOT a recovery and never touches backoff state.
 *  - Concurrent triggers (channel error, reconnect, poll tick) coalesce
 *    behind a single-flight lock with a pending flag — one refetch, not N
 *    (protects the 20 req/min API quota).
 *  - Exponential backoff (1s → 2s → 4s → … capped 30s), reset only after a
 *    successful recovery refetch.
 *  - Stale-guard: recovery work is abandoned when the route changed or the
 *    component unmounted (`cancelled`); results apply only to state keyed by
 *    this conversation, so an old in-flight request can never overwrite a
 *    newer conversation's state.
 *  - Polling fallback only while Realtime is down AND this conversation has
 *    non-terminal jobs; bounded interval; stops at terminal.
 */
export function useConversationRealtime(
  conversationId: string | null,
): { error: ConversationRealtimeError | null } {
  const {
    applyRealtimeMessage,
    applyRealtimeJob,
    hydrateConversation,
    jobsFor,
  } = useChat();
  const [error, setError] = React.useState<ConversationRealtimeError | null>(
    null,
  );

  const jobs = React.useMemo(
    () => (conversationId ? jobsFor(conversationId) : []),
    [jobsFor, conversationId],
  );
  const jobsRef = React.useRef(jobs);
  React.useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // Latest-callback refs keep the channel effect stable across re-renders.
  const applyMessageRef = React.useRef(applyRealtimeMessage);
  const applyJobRef = React.useRef(applyRealtimeJob);
  const hydrateRef = React.useRef(hydrateConversation);
  React.useEffect(() => {
    applyMessageRef.current = applyRealtimeMessage;
    applyJobRef.current = applyRealtimeJob;
    hydrateRef.current = hydrateConversation;
  }, [applyRealtimeMessage, applyRealtimeJob, hydrateConversation]);

  React.useEffect(() => {
    setError(null);
    if (!conversationId) return;
    const activeConversationId = conversationId;

    let cancelled = false;
    let realtimeDown = false;
    let refetchInFlight = false;
    let refetchPending = false;
    let backoffMs = BACKOFF_BASE_MS;
    let backoffTimer: ReturnType<typeof setTimeout> | null = null;

    const supabase = createClient();

    async function recover(): Promise<void> {
      if (cancelled) return;
      if (refetchInFlight) {
        refetchPending = true;
        return;
      }
      refetchInFlight = true;
      let ok = false;
      let terminalError: ConversationRealtimeError | null = null;
      try {
        await hydrateRef.current(activeConversationId);
        ok = true;
      } catch (failure) {
        terminalError = classifyConversationError(failure);
        if (terminalError === "not-found" || terminalError === "unauthorized") {
          setError(terminalError);
        }
      } finally {
        refetchInFlight = false;
      }
      if (cancelled || terminalError === "not-found" || terminalError === "unauthorized") {
        return;
      }
      if (ok) {
        setError(null);
        backoffMs = BACKOFF_BASE_MS;
        if (refetchPending) {
          refetchPending = false;
          void recover();
        }
      } else {
        backoffTimer = setTimeout(() => {
          backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
          void recover();
        }, backoffMs);
      }
    }

    const channel = supabase
      .channel(`chat:conversation:${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          if (cancelled) return;
          applyMessageRef.current(
            mapMessageRow(payload.new as Parameters<typeof mapMessageRow>[0]),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_jobs",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          if (cancelled) return;
          applyJobRef.current(
            mapJobRow(payload.new as Parameters<typeof mapJobRow>[0]),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_jobs",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          if (cancelled) return;
          applyJobRef.current(
            mapJobRow(payload.new as Parameters<typeof mapJobRow>[0]),
          );
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          realtimeDown = false;
          // Forced reconciliation after subscribing (not before). Not counted
          // as recovery — backoff state is untouched here.
          void hydrateRef.current(activeConversationId)
            .then(() => {
              if (!cancelled) setError(null);
            })
            .catch((failure) => {
              if (cancelled) return;
              const terminalError = classifyConversationError(failure);
              if (terminalError === "not-found" || terminalError === "unauthorized") {
                setError(terminalError);
                return;
              }
              realtimeDown = true;
              void recover();
            });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          realtimeDown = true;
          void recover();
        }
      });

    const poll = setInterval(() => {
      if (cancelled || !realtimeDown) return;
      if (!jobsRef.current.some(isActiveJob)) return;
      void recover();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (backoffTimer) clearTimeout(backoffTimer);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return { error };
}
