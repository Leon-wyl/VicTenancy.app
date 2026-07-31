const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  GetSecretValueCommand: jest.fn(),
  ResourceNotFoundException: jest
    .requireActual('@aws-sdk/client-secrets-manager')
    .ResourceNotFoundException,
}));

function setSecretArn(value: string): void {
  process.env.RUNTIME_SECRET_ARN = value;
}

function buildPayload(dbUrl: string): string {
  return JSON.stringify({ DATABASE_URL: dbUrl });
}

const VALID_POOLER_URL =
  'postgresql://user:pass@db.abcdef.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1';
const VALID_PAYLOAD = buildPayload(VALID_POOLER_URL);

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  delete process.env.RUNTIME_SECRET_ARN;
  delete process.env.DATABASE_URL;
});

async function getModule(): Promise<
  typeof import('../../src/common/runtime-config/load-runtime-config')
> {
  return import('../../src/common/runtime-config/load-runtime-config');
}

describe('loadRuntimeConfig', () => {
  describe('success', () => {
    it('parses valid secret and writes DATABASE_URL to process.env', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend.mockResolvedValueOnce({ SecretString: VALID_PAYLOAD });
      const mod = await getModule();

      await mod.loadRuntimeConfig();

      expect(process.env.DATABASE_URL).toBe(VALID_POOLER_URL);
    });

    it('calls Secrets Manager exactly once across concurrent calls', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend.mockResolvedValue({ SecretString: VALID_PAYLOAD });
      const mod = await getModule();

      await Promise.all([
        mod.loadRuntimeConfig(),
        mod.loadRuntimeConfig(),
        mod.loadRuntimeConfig(),
        mod.loadRuntimeConfig(),
        mod.loadRuntimeConfig(),
      ]);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('returns cached config on subsequent call without calling SM again', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend.mockResolvedValue({ SecretString: VALID_PAYLOAD });
      const mod = await getModule();

      await mod.loadRuntimeConfig();
      await mod.loadRuntimeConfig();
      await mod.loadRuntimeConfig();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('retries after first failure and succeeds', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend
        .mockRejectedValueOnce(new Error('Transient network error'))
        .mockResolvedValueOnce({ SecretString: VALID_PAYLOAD });
      const mod = await getModule();

      await expect(mod.loadRuntimeConfig()).rejects.toThrow(
        'Failed to read runtime secret',
      );

      await mod.loadRuntimeConfig();

      expect(process.env.DATABASE_URL).toBe(VALID_POOLER_URL);
    });
  });

  describe('validation', () => {
    it('rejects missing DATABASE_URL field', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ OTHER: 'value' }),
      });
      const mod = await getModule();

      await expect(mod.loadRuntimeConfig()).rejects.toThrow(
        'Runtime secret missing DATABASE_URL',
      );
    });

    it('rejects direct port 5432 URL', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend.mockResolvedValueOnce({
        SecretString: buildPayload(
          'postgresql://user:pass@db.abcdef.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1',
        ),
      });
      const mod = await getModule();

      await expect(mod.loadRuntimeConfig()).rejects.toThrow(
        'DATABASE_URL port must be 6543',
      );
    });

    it('rejects non-pooler hostname', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend.mockResolvedValueOnce({
        SecretString: buildPayload(
          'postgresql://user:pass@db.abcdef.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1',
        ),
      });
      const mod = await getModule();

      await expect(mod.loadRuntimeConfig()).rejects.toThrow(
        'DATABASE_URL must target a Supavisor pooler endpoint',
      );
    });

    it('rejects missing pgbouncer=true', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend.mockResolvedValueOnce({
        SecretString: buildPayload(
          'postgresql://user:pass@db.abcdef.pooler.supabase.com:6543/postgres?connection_limit=1',
        ),
      });
      const mod = await getModule();

      await expect(mod.loadRuntimeConfig()).rejects.toThrow(
        'DATABASE_URL must enable pgbouncer=true',
      );
    });

    it('rejects missing connection_limit=1', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend.mockResolvedValueOnce({
        SecretString: buildPayload(
          'postgresql://user:pass@db.abcdef.pooler.supabase.com:6543/postgres?pgbouncer=true',
        ),
      });
      const mod = await getModule();

      await expect(mod.loadRuntimeConfig()).rejects.toThrow(
        'DATABASE_URL must set connection_limit=1',
      );
    });
  });

  describe('error handling', () => {
    it('fails when RUNTIME_SECRET_ARN is not set', async () => {
      delete process.env.RUNTIME_SECRET_ARN;
      const mod = await getModule();

      await expect(mod.loadRuntimeConfig()).rejects.toThrow(
        'RUNTIME_SECRET_ARN is not set',
      );
    });

    it('fails when secret content is empty', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend.mockResolvedValueOnce({
        SecretString: undefined,
      });
      const mod = await getModule();

      await expect(mod.loadRuntimeConfig()).rejects.toThrow(
        'Runtime secret is empty',
      );
    });

    it('fails when secret is not valid JSON', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend.mockResolvedValueOnce({
        SecretString: 'not-json',
      });
      const mod = await getModule();

      await expect(mod.loadRuntimeConfig()).rejects.toThrow(
        'Runtime secret is not valid JSON',
      );
    });

    it('never logs secret content on failure', async () => {
      setSecretArn('arn:aws:secretsmanager:ap-southeast-2:123:secret:test');
      mockSend.mockRejectedValueOnce(new Error('Network down'));
      const mod = await getModule();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(mod.loadRuntimeConfig()).rejects.toThrow(
        'Failed to read runtime secret',
      );

      const calls = consoleSpy.mock.calls
        .flat()
        .map((c) => String(c))
        .join(' ');
      expect(calls).not.toContain('postgresql://');
      expect(calls).not.toContain('DATABASE_URL');
      expect(calls).not.toContain('pooler.supabase.com');

      consoleSpy.mockRestore();
    });
  });
});
