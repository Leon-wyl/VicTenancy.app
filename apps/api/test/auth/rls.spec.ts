/**
 * RLS integration tests (Step 14b).
 *
 * Prerequisites: `supabase start` and `supabase db reset` must have been run.
 * Also set SUPABASE_PUBLISHABLE_KEY in your .env (from `supabase status`).
 *
 * Tests:
 *   1. Auth user → public.users trigger
 *   2. PostgREST RLS isolation: user A's resources invisible to user B
 *   3. RLS policy existence (SET LOCAL / supplemental)
 *
 * Primary path: real PostgREST API with apikey + Bearer token,
 * proving the full auth.uid() / authenticated RLS chain.
 */

import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../.env') });

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_ANON_KEY) {
  throw new Error(
    'SUPABASE_PUBLISHABLE_KEY env var is required.\n' +
      'Run `supabase status`, copy the anon key, and set SUPABASE_PUBLISHABLE_KEY in apps/api/.env.',
  );
}

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

async function signUp(email: string, password: string) {
  const res = await supabaseFetch('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  return body as {
    access_token: string;
    user: { id: string; email: string };
  };
}

describe('RLS Integration', () => {
  let user1: { access_token: string; user: { id: string } };
  let user2: { access_token: string; user: { id: string } };
  let pgClient: Awaited<ReturnType<typeof getPgClient>>;

  beforeAll(async () => {
    pgClient = await getPgClient();

    user1 = await signUp(`test-rls-a-${Date.now()}@example.com`, 'password123!');
    user2 = await signUp(`test-rls-b-${Date.now()}@example.com`, 'password123!');

    if (!user1.access_token || !user2.access_token || !user1.user?.id || !user2.user?.id) {
      throw new Error(`Sign-up failed: ${JSON.stringify(user1)} / ${JSON.stringify(user2)}`);
    }

    // Allow trigger to fire.
    await new Promise((r) => setTimeout(r, 500));
  }, 30000);

  afterAll(async () => {
    if (pgClient) {
      try {
        const userIds = [user1?.user?.id, user2?.user?.id].filter((id): id is string =>
          Boolean(id),
        );
        if (userIds.length > 0) {
          await pgClient.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [userIds]);
        }
      } catch {
        // best-effort
      }
      await pgClient.end();
    }
  });

  // -----------------------------------------------------------------------
  // 1. Trigger
  // -----------------------------------------------------------------------
  describe('auth.users → public.users trigger', () => {
    it('creates public.users row for user 1', async () => {
      const { rows } = await pgClient.query('SELECT id FROM public.users WHERE id = $1', [
        user1.user.id,
      ]);
      expect(rows).toHaveLength(1);
    });

    it('creates public.users row for user 2', async () => {
      const { rows } = await pgClient.query('SELECT id FROM public.users WHERE id = $1', [
        user2.user.id,
      ]);
      expect(rows).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // 2. PostgREST RLS isolation (primary path)
  // -----------------------------------------------------------------------
  describe('PostgREST RLS isolation', () => {
    let conv1Id: string;

    it('user 1 can SELECT own users row via PostgREST', async () => {
      const res = await supabaseFetch('/rest/v1/users?id=eq.' + user1.user.id, {
        token: user1.access_token,
      });
      expect(res.status).toBe(200);
      const rows = await res.json();
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(user1.user.id);
    });

    it('user 2 can SELECT own users row via PostgREST', async () => {
      const res = await supabaseFetch('/rest/v1/users?id=eq.' + user2.user.id, {
        token: user2.access_token,
      });
      expect(res.status).toBe(200);
      const rows = await res.json();
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(user2.user.id);
    });

    it('user 2 cannot SELECT user 1 users row via PostgREST', async () => {
      const res = await supabaseFetch('/rest/v1/users?id=eq.' + user1.user.id, {
        token: user2.access_token,
      });
      expect(res.status).toBe(200);
      const rows = await res.json();
      expect(rows).toHaveLength(0);
    });

    it('user 1 can INSERT a conversation via PostgREST', async () => {
      const res = await supabaseFetch('/rest/v1/conversations', {
        method: 'POST',
        token: user1.access_token,
        body: JSON.stringify({
          owner_user_id: user1.user.id,
          title: 'Test conversation',
        }),
        headers: { Prefer: 'return=representation' },
      });
      expect(res.status).toBe(201);
      const rows = await res.json();
      expect(rows).toHaveLength(1);
      expect(rows[0].owner_user_id).toBe(user1.user.id);
      conv1Id = rows[0].id;
    });

    it('user 2 cannot SELECT user 1 conversation via PostgREST', async () => {
      const res = await supabaseFetch(`/rest/v1/conversations?id=eq.${conv1Id}`, {
        token: user2.access_token,
      });
      expect(res.status).toBe(200);
      const rows = await res.json();
      expect(rows).toHaveLength(0);
    });

    it('user 1 can SELECT own conversation via PostgREST', async () => {
      const res = await supabaseFetch(`/rest/v1/conversations?id=eq.${conv1Id}`, {
        token: user1.access_token,
      });
      expect(res.status).toBe(200);
      const rows = await res.json();
      expect(rows).toHaveLength(1);
    });

    it('user 2 cannot INSERT a conversation owned by user 1 via PostgREST', async () => {
      const res = await supabaseFetch('/rest/v1/conversations', {
        method: 'POST',
        token: user2.access_token,
        body: JSON.stringify({
          owner_user_id: user1.user.id,
          title: 'Should not work',
        }),
        headers: { Prefer: 'return=representation' },
      });
      if (res.status === 201) {
        const rows = await res.json();
        expect(rows).toEqual([]);
      } else {
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 3. RLS policy existence (supplemental — SET LOCAL assertions)
  // -----------------------------------------------------------------------
  describe('RLS policy existence', () => {
    it('RLS is enabled on all five application tables', async () => {
      const { rows } = await pgClient.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('users', 'conversations', 'messages', 'agent_jobs', 'citations')
          AND rowsecurity = true
        ORDER BY tablename
      `);
      expect(rows).toHaveLength(5);
    });

    it('users table has expected RLS policies', async () => {
      const { rows } = await pgClient.query(`
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'users'
      `);
      const names = rows.map((r: { policyname: string }) => r.policyname);
      expect(names).toContain('Users can select own record');
    });

    it('conversations table has expected RLS policies', async () => {
      const { rows } = await pgClient.query(`
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'conversations'
        ORDER BY policyname
      `);
      const names = rows.map((r: { policyname: string }) => r.policyname);
      expect(names).toContain('Users can select own conversations');
      expect(names).toContain('Users can insert own conversations');
      expect(names).toContain('Users can update own conversations');
      expect(names).toContain('Users can delete own conversations');
      expect(names.length).toBe(4);
    });

    it('messages table has expected RLS policies', async () => {
      const { rows } = await pgClient.query(`
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'messages'
        ORDER BY policyname
      `);
      const names = rows.map((r: { policyname: string }) => r.policyname);
      expect(names).toContain('Users can select messages in own conversations');
      expect(names).toContain('Users can insert user messages in own conversations');
      expect(names.length).toBe(2);
    });

    it('agent_jobs table has expected RLS policies', async () => {
      const { rows } = await pgClient.query(`
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'agent_jobs'
      `);
      const names = rows.map((r: { policyname: string }) => r.policyname);
      expect(names).toContain('Users can select own agent jobs');
    });

    it('citations table has expected RLS policies', async () => {
      const { rows } = await pgClient.query(`
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'citations'
      `);
      const names = rows.map((r: { policyname: string }) => r.policyname);
      expect(names).toContain('Users can select citations in own conversations');
    });

    it('no authenticated INSERT/UPDATE/DELETE policies on citations', async () => {
      const { rows } = await pgClient.query(`
        SELECT cmd FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'citations'
          AND roles @> ARRAY['authenticated'::name]
      `);
      const cmds = rows.map((r: { cmd: string }) => r.cmd);
      expect(cmds).not.toContain('INSERT');
      expect(cmds).not.toContain('UPDATE');
      expect(cmds).not.toContain('DELETE');
    });

    it('no authenticated INSERT/UPDATE/DELETE policies on agent_jobs', async () => {
      const { rows } = await pgClient.query(`
        SELECT cmd FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'agent_jobs'
          AND roles @> ARRAY['authenticated'::name]
      `);
      const cmds = rows.map((r: { cmd: string }) => r.cmd);
      expect(cmds).not.toContain('INSERT');
      expect(cmds).not.toContain('UPDATE');
      expect(cmds).not.toContain('DELETE');
    });
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

import { Client } from 'pg';

async function getPgClient() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}
