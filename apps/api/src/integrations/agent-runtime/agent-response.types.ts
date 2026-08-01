export const AgentResponseStatuses = ['success', 'fallback', 'clarification'] as const;
export type AgentResponseStatus = (typeof AgentResponseStatuses)[number];

export interface AgentResponse {
  request_id: string;
  status: AgentResponseStatus;
  answer?: string | null;
  verified_citations?: string[];
  citation_verified_rate?: number | null;
  clarification?: string | null;
  fallback_reason?: string | null;
  selected_jurisdiction?: string | null;
  latency_ms?: number | null;
  trace_id?: string | null;
  api_version: string;
  generated_at: string;
}

export interface AgentRequestPayload {
  question: string;
  jurisdiction?: string;
  api_version: string;
  request_id: string;
  thread_id: string;
  user_id: string;
  conversation_id: string;
  message_id: string;
}

export const VALID_JURISDICTIONS = ['VIC', 'NSW'] as const;
