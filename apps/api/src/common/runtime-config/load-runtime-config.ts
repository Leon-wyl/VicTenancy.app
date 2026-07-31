import {
  SecretsManagerClient,
  GetSecretValueCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager';

interface RuntimeConfig {
  DATABASE_URL: string;
}

let configPromise: Promise<RuntimeConfig> | null = null;

async function fetchSecret(secretArn: string): Promise<string> {
  const client = new SecretsManagerClient({});
  let response;
  try {
    response = await client.send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      throw new Error('Runtime secret not found');
    }
    throw new Error('Failed to read runtime secret');
  }
  if (!response.SecretString) {
    throw new Error('Runtime secret is empty');
  }
  return response.SecretString;
}

function validateSupavisorUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid database URL');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use postgresql protocol');
  }
  if (!url.hostname.endsWith('.pooler.supabase.com')) {
    throw new Error('DATABASE_URL must target a Supavisor pooler endpoint');
  }
  if (url.port !== '6543') {
    throw new Error('DATABASE_URL port must be 6543');
  }

  const params = new URLSearchParams(url.search);
  if (params.get('pgbouncer') !== 'true') {
    throw new Error('DATABASE_URL must enable pgbouncer=true');
  }
  if (params.get('connection_limit') !== '1') {
    throw new Error('DATABASE_URL must set connection_limit=1');
  }
}

function parseRuntimeConfig(secretString: string): RuntimeConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(secretString);
  } catch {
    throw new Error('Runtime secret is not valid JSON');
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('Runtime secret must be a JSON object');
  }

  const obj = raw as Record<string, unknown>;
  if (typeof obj.DATABASE_URL !== 'string' || !obj.DATABASE_URL) {
    throw new Error('Runtime secret missing DATABASE_URL');
  }

  validateSupavisorUrl(obj.DATABASE_URL);

  return { DATABASE_URL: obj.DATABASE_URL };
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (configPromise) {
    return configPromise;
  }

  configPromise = (async () => {
    const secretArn = process.env.RUNTIME_SECRET_ARN;
    if (!secretArn) {
      throw new Error('RUNTIME_SECRET_ARN is not set');
    }

    const secretString = await fetchSecret(secretArn);
    const config = parseRuntimeConfig(secretString);
    process.env.DATABASE_URL = config.DATABASE_URL;
    return config;
  })();

  configPromise.catch(() => {
    configPromise = null;
  });

  return configPromise;
}
