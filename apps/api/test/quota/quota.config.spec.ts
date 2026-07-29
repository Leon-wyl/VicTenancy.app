describe('Quota configuration validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.REQUESTS_PER_MINUTE;
    delete process.env.REQUESTS_PER_DAY;
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function loadConfig() {
    const { quotaConfig } = await import('../../src/common/quota/quota.config');
    return quotaConfig;
  }

  it('provides defaults (20/min, 200/day)', async () => {
    const config = await loadConfig();
    const values = config();
    expect(values.requestsPerMinute).toBe(20);
    expect(values.requestsPerDay).toBe(200);
  });

  it('reads custom values from env', async () => {
    process.env.REQUESTS_PER_MINUTE = '5';
    process.env.REQUESTS_PER_DAY = '50';
    const config = await loadConfig();
    const values = config();
    expect(values.requestsPerMinute).toBe(5);
    expect(values.requestsPerDay).toBe(50);
  });

  it('rejects zero minute limit', async () => {
    process.env.REQUESTS_PER_MINUTE = '0';
    const config = await loadConfig();
    expect(() => config()).toThrow('REQUESTS_PER_MINUTE must be 1–');
  });

  it('rejects negative minute limit', async () => {
    process.env.REQUESTS_PER_MINUTE = '-1';
    const config = await loadConfig();
    expect(() => config()).toThrow('REQUESTS_PER_MINUTE must be 1–');
  });

  it('rejects minute limit above upper bound', async () => {
    process.env.REQUESTS_PER_MINUTE = '1001';
    const config = await loadConfig();
    expect(() => config()).toThrow('REQUESTS_PER_MINUTE must be 1–');
  });

  it('rejects zero day limit', async () => {
    process.env.REQUESTS_PER_DAY = '0';
    const config = await loadConfig();
    expect(() => config()).toThrow('REQUESTS_PER_DAY must be 1–');
  });

  it('rejects day limit above upper bound', async () => {
    process.env.REQUESTS_PER_DAY = '10001';
    const config = await loadConfig();
    expect(() => config()).toThrow('REQUESTS_PER_DAY must be 1–');
  });

  it('rejects non-integer minute limit', async () => {
    process.env.REQUESTS_PER_MINUTE = 'hello';
    const config = await loadConfig();
    expect(() => config()).toThrow('REQUESTS_PER_MINUTE must be 1–');
  });

  it('rejects partially numeric minute limit', async () => {
    process.env.REQUESTS_PER_MINUTE = '20abc';
    const config = await loadConfig();
    expect(() => config()).toThrow('REQUESTS_PER_MINUTE must be 1–');
  });

  it('rejects non-numeric day limit', async () => {
    process.env.REQUESTS_PER_DAY = 'not_a_number';
    const config = await loadConfig();
    expect(() => config()).toThrow('REQUESTS_PER_DAY must be 1–');
  });
});
