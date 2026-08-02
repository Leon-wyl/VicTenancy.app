export interface ConversationSummary {
  id: string;
  title: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  authorRole: "user" | "assistant" | string;
  content: string;
  metadata: unknown | null;
  createdAt: string;
  citations?: CitationSummary[];
}

export type JobStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface ConversationJob {
  id: string;
  conversationId: string;
  triggerMessageId: string;
  assistantMessageId: string | null;
  status: JobStatus | string;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  triggerMessage: {
    id: string;
    content: string;
    createdAt: string;
  } | null;
}

export interface CitationSummary {
  id: string;
  messageId: string;
  label: string;
  jurisdiction: string;
  instrumentType: string;
  instrumentTitle: string;
  instrumentVersion: string;
  sectionReference: string;
  createdAt: string;
}

export interface Page<T> {
  data: T[];
  page: { nextCursor: string | null };
}

export interface CreateMessageResponse {
  message: ChatMessage;
  job: {
    id: string;
    conversationId: string;
    triggerMessageId: string;
    status: string;
    correlationId: string;
    createdAt: string;
  };
}
