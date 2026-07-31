/* eslint-disable @typescript-eslint/no-explicit-any */
const mockLoadRuntimeConfig = jest.fn();
const mockCreateApp = jest.fn();
const mockServerlessExpress = jest.fn().mockReturnValue(() => ({
  statusCode: 200,
  body: JSON.stringify({ status: 'ok' }),
  headers: {},
}));

jest.mock('../../src/common/runtime-config/load-runtime-config', () => ({
  loadRuntimeConfig: mockLoadRuntimeConfig,
}));

jest.mock('../../src/bootstrap/app.factory', () => ({
  createApp: mockCreateApp,
}));

jest.mock('@codegenie/serverless-express', () => mockServerlessExpress);

import type { APIGatewayProxyEventV2 } from 'aws-lambda';

function buildStubApp() {
  const expressApp = {} as any;

  return {
    init: jest.fn().mockResolvedValue(undefined),
    getHttpAdapter: () => ({ getInstance: () => expressApp } as any),
    close: jest.fn(),
  };
}

function buildHealthEvent(): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /health',
    rawPath: '/health',
    rawQueryString: '',
    headers: { host: 'localhost' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.execute-api.ap-southeast-2.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/health',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: 'GET /health',
      stage: '$default',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 1700000000000,
    },
    body: undefined,
    isBase64Encoded: false,
  };
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  delete process.env.RUNTIME_SECRET_ARN;
  delete process.env.DATABASE_URL;
});

async function getLambdaModule(): Promise<typeof import('../../src/lambda')> {
  return import('../../src/lambda');
}

describe('lambda handler — lifecycle', () => {
  it('calls createApp only once for concurrent cold-start requests', async () => {
    const app = buildStubApp();
    let appCreated = 0;
    mockLoadRuntimeConfig.mockResolvedValue({ DATABASE_URL: 'test' });
    mockCreateApp.mockImplementation(async () => {
      appCreated++;
      return app;
    });

    const mod = await getLambdaModule();
    const event = buildHealthEvent();

    const results = await Promise.all([
      (mod.handler as any)(event, {}),
      (mod.handler as any)(event, {}),
      (mod.handler as any)(event, {}),
      (mod.handler as any)(event, {}),
      (mod.handler as any)(event, {}),
    ]);

    expect(appCreated).toBe(1);
    for (const r of results) {
      expect(r.statusCode).toBe(200);
    }
  });

  it('throws without calling createApp when loadRuntimeConfig fails', async () => {
    mockLoadRuntimeConfig.mockRejectedValue(new Error('Secret unavailable'));
    let createAppCalled = false;
    mockCreateApp.mockImplementation(() => {
      createAppCalled = true;
      return Promise.resolve(buildStubApp());
    });

    const mod = await getLambdaModule();
    const event = buildHealthEvent();

    await expect((mod.handler as any)(event, {})).rejects.toThrow(
      'Secret unavailable',
    );
    expect(createAppCalled).toBe(false);
  });

  it('retries init after first failure', async () => {
    const app = buildStubApp();
    mockLoadRuntimeConfig
      .mockRejectedValueOnce(new Error('Secret unavailable'))
      .mockResolvedValueOnce({ DATABASE_URL: 'test' });
    mockCreateApp.mockResolvedValue(app);

    const mod = await getLambdaModule();
    const event = buildHealthEvent();

    await expect((mod.handler as any)(event, {})).rejects.toThrow(
      'Secret unavailable',
    );

    const result = await (mod.handler as any)(event, {});
    expect(result.statusCode).toBe(200);
  });

  it('subsequent requests resolve immediately after init', async () => {
    const app = buildStubApp();
    let appCreated = 0;
    mockLoadRuntimeConfig.mockResolvedValue({ DATABASE_URL: 'test' });
    mockCreateApp.mockImplementation(async () => {
      appCreated++;
      return app;
    });

    const mod = await getLambdaModule();
    const event = buildHealthEvent();

    const r1 = await (mod.handler as any)(event, {});
    expect(appCreated).toBe(1);
    expect(r1.statusCode).toBe(200);

    const r2 = await (mod.handler as any)(event, {});
    expect(appCreated).toBe(1);
    expect(r2.statusCode).toBe(200);
  });
});
