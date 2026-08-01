export type AgentRuntimeMode = 'local' | 'aws_iam';

export interface AgentRuntimeConfig {
  mode: AgentRuntimeMode;
  invokeUrl: string;
  executeApiArn?: string;
  region?: string;
}

function requireNonEmpty(value: string | undefined, name: string): string {
  if (!value || !value.trim()) {
    throw new Error(`Agent Runtime configuration: ${name} is required`);
  }
  return value.trim();
}

export function loadAgentRuntimeConfig(): AgentRuntimeConfig {
  const mode = (process.env.AGENT_RUNTIME_MODE ?? 'disabled') as AgentRuntimeMode;

  if (mode !== 'local' && mode !== 'aws_iam') {
    throw new Error(
      `AGENT_RUNTIME_MODE must be "local" or "aws_iam", got "${mode}"`,
    );
  }

  const invokeUrl = requireNonEmpty(
    process.env.AGENT_RUNTIME_INVOKE_URL,
    'AGENT_RUNTIME_INVOKE_URL',
  );

  if (mode === 'aws_iam') {
    const executeApiArn = requireNonEmpty(
      process.env.AGENT_RUNTIME_EXECUTE_API_ARN,
      'AGENT_RUNTIME_EXECUTE_API_ARN',
    );
    const region = requireNonEmpty(
      process.env.AWS_REGION,
      'AWS_REGION',
    );
    return { mode, invokeUrl, executeApiArn, region };
  }

  return { mode, invokeUrl };
}
