jest.mock('@aws-sdk/credential-provider-node', () => ({
  defaultProvider: () => async () => ({
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret',
    sessionToken: 'session-token',
  }),
}));

import { signRequest } from '../../src/integrations/agent-runtime/sigv4.signer';

describe('signRequest', () => {
  it('uses a bound SHA-256 implementation for SignatureV4', async () => {
    const signed = await signRequest(
      'https://example.execute-api.ap-southeast-2.amazonaws.com',
      'ap-southeast-2',
      JSON.stringify({ request_id: 'request-1' }),
    );

    expect(signed.Authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(signed['X-Amz-Date']).toMatch(/^\d{8}T\d{6}Z$/);
    expect(signed['X-Amz-Content-Sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(signed['X-Amz-Security-Token']).toBe('session-token');
    expect(signed.Host).toBe('example.execute-api.ap-southeast-2.amazonaws.com');
  });
});
