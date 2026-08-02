import type { ChatMessage, ConversationJob, ConversationSummary } from "./types";

/**
 * Pure state-transition helpers for the chat feature.
 *
 * Invariants:
 *  - Messages are ALWAYS stored oldest → newest (ascending by createdAt, id),
 *    regardless of the API's newest-first (desc) page order.
 *  - Every merge dedupes/upserts by ID and returns NEW arrays — state is
 *    never mutated in place, so realtime events and hydration snapshots can
 *    arrive in any order without losing or duplicating rows.
 */

function compareAsc(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function compareDesc(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  return -compareAsc(a, b);
}

/** Copy a newest-first API page and return it oldest → newest. */
export function reverseDescPage<T extends { createdAt: string; id: string }>(
  page: readonly T[],
): T[] {
  return [...page].reverse();
}

export function sortMessagesAsc(messages: readonly ChatMessage[]): ChatMessage[] {
  return [...messages].sort(compareAsc);
}

/**
 * Merge incoming messages (any order, any source — desc page, realtime event,
 * hydration snapshot) into the current ascending window. Incoming rows win on
 * ID conflict. Equivalent to "prepend older pages / append newer rows" but
 * idempotent: re-applying the same page or event is a no-op.
 */
export function upsertMessagesAsc(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  if (incoming.length === 0) return [...current];
  const byId = new Map<string, ChatMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return sortMessagesAsc([...byId.values()]);
}

/**
 * Jobs are stored newest-first (createdAt desc, id desc), mirroring the API.
 * A job that reaches `succeeded` is removed — the assistant message fully
 * represents it — matching the API list which excludes succeeded jobs.
 */
export function upsertJob(
  current: readonly ConversationJob[],
  job: ConversationJob,
): ConversationJob[] {
  const existing = current.find((entry) => entry.id === job.id);
  // Jobs are mutable rows: the newer updatedAt wins so an older hydration
  // snapshot can never clobber a fresher realtime event (and vice versa).
  if (existing && existing.updatedAt > job.updatedAt) {
    return [...current];
  }
  // Realtime job payloads carry no triggerMessage join — keep the content we
  // already fetched from the API instead of clobbering it with null.
  const merged =
    existing && !job.triggerMessage && existing.triggerMessage
      ? { ...job, triggerMessage: existing.triggerMessage }
      : job;
  const rest = current.filter((entry) => entry.id !== job.id);
  if (merged.status === "succeeded") return rest;
  return [...rest, merged].sort(compareDesc);
}

/**
 * Merge a hydration snapshot page of jobs into state. Snapshot rows upsert by
 * ID. `isStale(id)` marks state rows that are absent from the snapshot AND
 * were not touched by a realtime event after the snapshot fetch started —
 * those are removed (e.g. jobs that transitioned to succeeded while offline).
 */
export function mergeJobsSnapshot(
  current: readonly ConversationJob[],
  snapshot: readonly ConversationJob[],
  isStale: (jobId: string) => boolean,
): ConversationJob[] {
  const snapshotIds = new Set(snapshot.map((job) => job.id));
  const kept = current.filter(
    (job) => snapshotIds.has(job.id) || !isStale(job.id),
  );
  const byId = new Map<string, ConversationJob>();
  for (const job of kept) byId.set(job.id, job);
  for (const job of snapshot) {
    if (job.status === "succeeded") continue;
    const existing = byId.get(job.id);
    // Never let an older snapshot row overwrite a fresher realtime event.
    if (existing && existing.updatedAt > job.updatedAt) continue;
    // API snapshots carry the trigger message join — prefer them when fresh.
    byId.set(job.id, job);
  }
  return [...byId.values()].sort(compareDesc);
}

/** Conversations are stored most-recent-activity first. */
export function upsertConversation(
  current: readonly ConversationSummary[],
  conversation: ConversationSummary,
): ConversationSummary[] {
  const existing = current.find((entry) => entry.id === conversation.id);
  if (
    existing?.updatedAt &&
    conversation.updatedAt &&
    existing.updatedAt > conversation.updatedAt
  ) {
    return [...current];
  }
  const rest = current.filter((entry) => entry.id !== conversation.id);
  return [...rest, conversation].sort((a, b) => {
    if (a.lastActivityAt > b.lastActivityAt) return -1;
    if (a.lastActivityAt < b.lastActivityAt) return 1;
    if (a.id > b.id) return -1;
    if (a.id < b.id) return 1;
    return 0;
  });
}

export function upsertConversations(
  current: readonly ConversationSummary[],
  incoming: readonly ConversationSummary[],
): ConversationSummary[] {
  let next = [...current];
  for (const conversation of incoming) {
    next = upsertConversation(next, conversation);
  }
  return next;
}

export function removeConversation(
  current: readonly ConversationSummary[],
  conversationId: string,
): ConversationSummary[] {
  return current.filter((existing) => existing.id !== conversationId);
}

/** A job is still waiting on the agent. */
export function isActiveJob(job: ConversationJob): boolean {
  return job.status === "queued" || job.status === "processing";
}

/** A job ended without producing an assistant message. */
export function isFailedJob(job: ConversationJob): boolean {
  return job.status === "failed" || job.status === "cancelled";
}
