import { SignatureV4 } from '@smithy/signature-v4';
import { Hash } from '@smithy/hash-node';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

export interface SignedHeaders {
  Authorization: string;
  'X-Amz-Date': string;
  'X-Amz-Content-Sha256': string;
  'X-Amz-Security-Token'?: string;
  'Content-Type': string;
  Host: string;
}

function parseUrl(invokeUrl: string): { hostname: string; path: string } {
  const url = new URL(invokeUrl);
  const hostname = url.hostname;
  const path = url.pathname;
  return { hostname, path };
}

export async function signRequest(
  invokeUrl: string,
  region: string,
  body: string,
): Promise<SignedHeaders> {
  const { hostname, path } = parseUrl(invokeUrl);
  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region,
    service: 'execute-api',
    // SignatureV4 constructs the hash implementation without arguments;
    // bind the algorithm required by @smithy/hash-node up front.
    sha256: Hash.bind(null, 'sha256'),
  });

  const request = new HttpRequest({
    method: 'POST',
    protocol: 'https:',
    hostname,
    path,
    headers: {
      'content-type': 'application/json',
      host: hostname,
    },
    body,
  });

  const signed = await signer.sign(request);

  const headers: SignedHeaders = {
    Authorization: signed.headers.authorization ?? '',
    'X-Amz-Date': signed.headers['x-amz-date'] ?? '',
    'X-Amz-Content-Sha256': signed.headers['x-amz-content-sha256'] ?? '',
    'Content-Type': 'application/json',
    Host: hostname,
  };

  if (signed.headers['x-amz-security-token']) {
    headers['X-Amz-Security-Token'] = signed.headers['x-amz-security-token'];
  }

  return headers;
}
