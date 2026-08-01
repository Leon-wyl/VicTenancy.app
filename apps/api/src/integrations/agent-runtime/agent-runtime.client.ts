import {
  loadAgentRuntimeConfig,
  AgentRuntimeConfig,
  AgentRuntimeMode,
} from './agent-runtime.config';
import { signRequest } from './sigv4.signer';
import { parseAgentResponse, classifyHttpError } from './agent-response.validation';
import { AgentResponse, AgentRequestPayload } from './agent-response.types';

export type { AgentRuntimeMode, AgentRuntimeConfig, AgentResponse, AgentRequestPayload };

export interface InvokeParams {
  question: string;
  requestId: string;
  threadId: string;
  userId: string;
  conversationId: string;
  messageId: string;
  jurisdiction?: string;
}

export class AgentRuntimeClient {
  private config: AgentRuntimeConfig | null = null;

  // Dispatcher and terminalizer contexts share this module but never invoke the
  // Agent Runtime. Validate runtime configuration only when a worker actually
  // needs to make an invocation.
  private getConfig(): AgentRuntimeConfig {
    return (this.config ??= loadAgentRuntimeConfig());
  }

  getMode(): AgentRuntimeMode {
    return this.getConfig().mode;
  }

  getInvokeUrl(): string {
    return this.getConfig().invokeUrl;
  }

  async invoke(params: InvokeParams): Promise<AgentResponse> {
    const config = this.getConfig();
    const payload: AgentRequestPayload = {
      question: params.question,
      jurisdiction: params.jurisdiction,
      api_version: '1.0',
      request_id: params.requestId,
      thread_id: params.threadId,
      user_id: params.userId,
      conversation_id: params.conversationId,
      message_id: params.messageId,
    };

    const body = JSON.stringify(payload);
    const url = `${config.invokeUrl}/api/agent/invoke`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (config.mode === 'aws_iam' && config.region) {
        const signed = await signRequest(
          url,
          config.region,
          body,
        );
        Object.assign(headers, signed);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw classifyHttpError(response.status);
      }

      return parseAgentResponse(responseText, params.requestId);
    } finally {
      clearTimeout(timeout);
    }
  }
}
