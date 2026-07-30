/**
 * Quota integration tests (Step 14c).
 *
 * Prerequisites: `supabase start` and `supabase db reset` must have been run.
 * Also set SUPABASE_PUBLISHABLE_KEY in your .env (from `supabase status`).
 *
 * Tests connect via DIRECT_DATABASE_URL to exercise the real PostgreSQL
 * check_and_increment_quota() function.
 *
 * Tests:
 *   1. Migration creates request_quota_counters table
 *   2. Atomic quota consumption (single user)
 *   3. Per-user isolation
 *   4. Minute-only rejection -> Retry-After <= 60
 *   5. Day-only rejection -> Retry-After toward midnight
 *   6. Both exceeded -> returns longer retry
 *   7. auth.users ON DELETE CASCADE cleanup
 *   8. Stale counter cleanup (max 2 rows per active user)
 */

import { Client } from 'pg';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../.env') });

const DIRECT_DATABASE_URL =
  process.env.DIRECT_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:54322/postgres';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_ANON_KEY) {
  throw new Error(
    'SUPABASE_PUBLISHABLE_KEY env var is required.\n' +
      'Run `supabase status`, copy the anon key, and set SUPABASE_PUBLISHABLE_KEY in apps/api/.env.',
  );
}

interface QuotaRow {
  allowed: boolean;
  minute_count: number;
  day_count: number;
  retry_after_seconds: number;
}

interface SignedUpUser {
  id: string;
  email: string;
  accessToken: string;
}

let client: Client;
const users: SignedUpUser[] = [];

// ---- Helpers ----

async function supabaseFetch(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<Response> {
  const { token, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY!,
    'Content-Type': 'application/json',
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(`${SUPABASE_URL}${path}`, { ...fetchOptions, headers });
}

async function signUp(email: string, password: string): Promise<SignedUpUser> {
  const res = await supabaseFetch('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Signup failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as {
    access_token: string;
    user: { id: string; email: string };
  };
  if (!body.access_token || !body.user?.id) {
    throw new Error(`Signup missing fields: ${JSON.stringify(body)}`);
  }
  return {
    id: body.user.id,
    email: body.user.email,
    accessToken: body.access_token,
  };
}

async function checkQuota(
  userId: string,
  maxPerMinute: number,
  maxPerDay: number,
): Promise<QuotaRow> {
  const { rows } = await client.query<QuotaRow>(
    'SELECT * FROM check_and_increment_quota($1, $2, $3)',
    [userId, maxPerMinute, maxPerDay],
  );
  return rows[0]!;
}

async function countCounterRows(userId: string): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM request_quota_counters WHERE user_id = $1',
    [userId],
  );
  return parseInt(rows[0]!.count, 10);
}

function uniqueEmail(): string {
  return `quota-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.example`;
}

// ---- Setup / Teardown ----

beforeAll(async () => {
  client = new Client({ connectionString: DIRECT_DATABASE_URL });
  await client.connect();

  // Create test users via Supabase Auth (which triggers public.users).
  users.push(await signUp(uniqueEmail(), 'QuotaTest1!pass'));
  users.push(await signUp(uniqueEmail(), 'QuotaTest2!pass'));
  users.push(await signUp(uniqueEmail(), 'QuotaTest3!pass'));

  // Allow handle_new_user() trigger to fire.
  await new Promise((r) => setTimeout(r, 500));

  // Ensure cleanup.
  for (const u of users) {
    await client.query(
      'DELETE FROM request_quota_counters WHERE user_id = $1',
      [u.id],
    );
  }
}, 30000);

afterAll(async () => {
  if (client) {
    // Delete users (cascade cleans counters).
    for (const u of users) {
      try {
        await client.query(
          'DELETE FROM auth.users WHERE id = $1',
          [u.id],
        );
      } catch {
        // Ignore if not found.
      }
    }
    await client.end();
  }
}, 30000);

// ---- Tests ----

describe('request_quota_counters table', () => {
  it('table exists with expected columns', async () => {
    const { rows } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'request_quota_counters'
      ORDER BY ordinal_position
    `);

    const cols = rows.map((r: { column_name: string }) => r.column_name);
    expect(cols).toContain('id');
    expect(cols).toContain('user_id');
    expect(cols).toContain('window_kind');
    expect(cols).toContain('window_start');
    expect(cols).toContain('count');
    expect(cols).toContain('created_at');
    expect(cols).toContain('updated_at');
  });

  it('has RLS enabled', async () => {
    const { rows } = await client.query(`
      SELECT rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = 'request_quota_counters'
    `);
    expect(rows[0]?.rowsecurity).toBe(true);
  });

  it('function exists and is SECURITY INVOKER', async () => {
    const { rows } = await client.query(`
      SELECT proname, prosecdef
      FROM pg_proc
      WHERE proname = 'check_and_increment_quota'
        AND pronamespace = 'public'::regnamespace
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.prosecdef).toBe(false);
  });
});

describe('check_and_increment_quota() atomic consumption', () => {
  let USER_A: SignedUpUser;
  let USER_B: SignedUpUser;

  beforeAll(() => {
    USER_A = users[0]!;
    USER_B = users[1]!;
  });

  beforeEach(async () => {
    await client.query(
      'DELETE FROM request_quota_counters WHERE user_id = $1 OR user_id = $2',
      [USER_A.id, USER_B.id],
    );
  });

  it('allows requests under quota', async () => {
    const r = await checkQuota(USER_A.id, 5, 1000);
    expect(r.allowed).toBe(true);
    expect(r.minute_count).toBe(1);
    expect(r.day_count).toBe(1);
    expect(r.retry_after_seconds).toBe(0);
  });

  it('increments both counters on successive requests', async () => {
    await checkQuota(USER_A.id, 5, 1000);
    await checkQuota(USER_A.id, 5, 1000);
    const r = await checkQuota(USER_A.id, 5, 1000);

    expect(r.allowed).toBe(true);
    expect(r.minute_count).toBe(3);
    expect(r.day_count).toBe(3);
  });

  it('per-user isolation: user A quota does not affect user B', async () => {
    for (let i = 0; i < 3; i++) {
      await checkQuota(USER_A.id, 3, 1000);
    }

    const denied = await checkQuota(USER_A.id, 3, 1000);
    expect(denied.allowed).toBe(false);

    const allowed = await checkQuota(USER_B.id, 3, 1000);
    expect(allowed.allowed).toBe(true);
  });

  it('rejects when minute quota is exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await checkQuota(USER_A.id, 3, 1000);
    }

    const r = await checkQuota(USER_A.id, 3, 1000);
    expect(r.allowed).toBe(false);
    expect(r.minute_count).toBe(3);
    expect(r.day_count).toBe(3);
    expect(r.retry_after_seconds).toBeGreaterThan(0);
    expect(r.retry_after_seconds).toBeLessThanOrEqual(60);
  });

  it('day-only rejection returns retry toward next UTC day', async () => {
    for (let i = 0; i < 3; i++) {
      await checkQuota(USER_A.id, 1000, 3);
    }

    const r = await checkQuota(USER_A.id, 1000, 3);
    expect(r.allowed).toBe(false);
    expect(r.day_count).toBe(3);
    expect(r.retry_after_seconds).toBeGreaterThan(0);
    expect(r.retry_after_seconds).toBeLessThanOrEqual(86400);
  });

  it('both quotas exhausted returns longer retry', async () => {
    for (let i = 0; i < 3; i++) {
      await checkQuota(USER_A.id, 3, 3);
    }

    const r = await checkQuota(USER_A.id, 3, 3);
    expect(r.allowed).toBe(false);
    expect(r.minute_count).toBe(3);
    expect(r.day_count).toBe(3);
    expect(r.retry_after_seconds).toBeGreaterThan(1);
  });

  it('all-or-nothing: minute exceed does not increment day counter', async () => {
    // Exhaust only the minute quota (day quota barely used).
    let lastAllowed;
    for (let i = 0; i < 3; i++) {
      lastAllowed = await checkQuota(USER_A.id, 3, 1000);
      expect(lastAllowed.allowed).toBe(true);
    }

    // Denial must report same counts as the last allowed call.
    const denied = await checkQuota(USER_A.id, 3, 1000);
    expect(denied.allowed).toBe(false);
    expect(denied.minute_count).toBe(lastAllowed!.minute_count);
    expect(denied.day_count).toBe(lastAllowed!.day_count);
    expect(denied.retry_after_seconds).toBeLessThanOrEqual(60);
  });

  it('advisory lock prevents race between two sessions', async () => {
    const client2 = new Client({ connectionString: DIRECT_DATABASE_URL });
    await client2.connect();

    try {
      // Prime: consume 1 request so count=2, max=3.
      await checkQuota(USER_A.id, 3, 1000);
      await checkQuota(USER_A.id, 3, 1000);

      const checkBoth = async (
        c: Client,
        uid: string,
        max: number,
      ): Promise<QuotaRow> => {
        const { rows } = await c.query<QuotaRow>(
          'SELECT * FROM check_and_increment_quota($1, $2, $3)',
          [uid, max, 1000],
        );
        return rows[0]!;
      };

      // Boundary: max=3, current count=2. Two concurrent requests →
      // one succeeds (count → 3), the other is denied (count stays at 3).
      const [r1, r2] = await Promise.all([
        checkBoth(client, USER_A.id, 3),
        checkBoth(client2, USER_A.id, 3),
      ]);

      const allowedCount = [r1.allowed, r2.allowed].filter(Boolean).length;
      expect(allowedCount).toBe(1);

      const denied = r1.allowed ? r2 : r1;
      expect(denied.allowed).toBe(false);
      expect(denied.minute_count).toBe(3);
      expect(denied.retry_after_seconds).toBeGreaterThan(0);

      const allowed = r1.allowed ? r1 : r2;
      expect(allowed.allowed).toBe(true);
      expect(allowed.minute_count).toBe(3);
    } finally {
      await client2.end();
    }
  });
});

describe('stale counter cleanup', () => {
  let USER_C: SignedUpUser;

  beforeAll(() => {
    USER_C = users[2]!;
  });

  beforeEach(async () => {
    await client.query(
      'DELETE FROM request_quota_counters WHERE user_id = $1',
      [USER_C.id],
    );
  });

  it('keeps at most 2 rows per active user', async () => {
    await client.query(
      `INSERT INTO request_quota_counters (user_id, window_kind, window_start, count)
       VALUES ($1, 'minute', now() - INTERVAL '2 hours', 5)`,
      [USER_C.id],
    );
    await client.query(
      `INSERT INTO request_quota_counters (user_id, window_kind, window_start, count)
       VALUES ($1, 'day', now() - INTERVAL '2 days', 10)`,
      [USER_C.id],
    );

    expect(await countCounterRows(USER_C.id)).toBe(2);

    await checkQuota(USER_C.id, 1000, 1000);

    expect(await countCounterRows(USER_C.id)).toBeLessThanOrEqual(2);
  });
});

describe('ON DELETE CASCADE cleanup', () => {
  it('deletes counter rows when auth user is deleted', async () => {
    const email = uniqueEmail();
    const { id } = await signUp(email, 'CascadeTest1!pass');

    await checkQuota(id, 1000, 1000);
    expect(await countCounterRows(id)).toBeGreaterThan(0);

    // Delete auth.users — cascades to public.users -> quota counters.
    await client.query('DELETE FROM auth.users WHERE id = $1', [id]);
    expect(await countCounterRows(id)).toBe(0);
  });
});
