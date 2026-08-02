import type {
  ChatMessage,
  ConversationJob,
  ConversationSummary,
} from "./types";

/** Map raw Supabase Realtime (postgres_changes) rows to app types. */

interface MessageRow {
  id: string;
  conversation_id: string;
  author_role: string;
  content: string;
  metadata: unknown;
  created_at: string;
  citations?: ChatMessage["citations"];
}

export function mapMessageRow(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorRole: row.author_role,
    content: row.content,
    metadata: row.metadata ?? null,
    createdAt: row.created_at,
    citations: row.citations,
  };
}

interface JobRow {
  id: string;
  conversation_id: string;
  trigger_message_id: string;
  assistant_message_id: string | null;
  status: string;
  attempt: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error_metadata: unknown;
}

export function mapJobRow(row: JobRow): ConversationJob {
  const errorCode =
    row.error_metadata &&
    typeof row.error_metadata === "object" &&
    !Array.isArray(row.error_metadata)
      ? (((row.error_metadata as Record<string, unknown>).code as
          | string
          | undefined) ?? null)
      : null;

  return {
    id: row.id,
    conversationId: row.conversation_id,
    triggerMessageId: row.trigger_message_id,
    assistantMessageId: row.assistant_message_id,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    errorCode,
    // Realtime payloads don't join; the trigger message content is only
    // needed for failed/cancelled cards, which re-read it from the API list.
    triggerMessage: null,
  };
}

interface ConversationRow {
  id: string;
  title: string;
  last_activity_at: string;
  created_at: string;
  updated_at?: string;
}

export function mapConversationRow(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
