import { Client } from 'pg';

/**
 * Supabase SQL migration verification tests.
 *
 * Prerequisites: `supabase start` and `supabase db reset` must have been run.
 * The test connects via DATABASE_URL env variable and verifies that the initial
 * migration (supabase/migrations/20260728000000_initial_schema.sql) produced the
 * expected schema.
 */
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres';

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 15000);

afterAll(async () => {
  if (client) await client.end();
});

describe('users table', () => {
  it('has users table', async () => {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      ) AS exists;
    `);
    expect(rows[0].exists).toBe(true);
  });

  it('has id UUID column referencing auth.users', async () => {
    const { rows } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'id';
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe('uuid');
  });

  it('has created_at and updated_at timestamptz columns', async () => {
    const { rows } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name IN ('created_at', 'updated_at')
      ORDER BY column_name;
    `);
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row.data_type).toBe('timestamp with time zone');
    });
  });

  it('has updated_at trigger', async () => {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.triggers
        WHERE trigger_name = 'trg_users_updated_at'
      ) AS exists;
    `);
    expect(rows[0].exists).toBe(true);
  });
});

describe('conversations table', () => {
  it('has conversations table', async () => {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'conversations'
      ) AS exists;
    `);
    expect(rows[0].exists).toBe(true);
  });

  it('has FK owner_user_id → users(id) ON DELETE CASCADE', async () => {
    const { rows } = await client.query(`
      SELECT confdeltype::text
      FROM pg_constraint
      WHERE conname = 'conversations_owner_user_id_fkey';
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].confdeltype).toBe('c');
  });

  it('has composite index on (owner_user_id, last_activity_at DESC, id DESC)', async () => {
    const { rows } = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'conversations'
        AND indexname = 'idx_conversations_owner_activity';
    `);
    expect(rows).toHaveLength(1);
  });
});

describe('messages table', () => {
  it('has messages table', async () => {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'messages'
      ) AS exists;
    `);
    expect(rows[0].exists).toBe(true);
  });

  it('has author_role ENUM with user|assistant values', async () => {
    const { rows } = await client.query(`
      SELECT enum_range(NULL::author_role) AS values;
    `);
    expect(rows[0].values).toContain('user');
    expect(rows[0].values).toContain('assistant');
  });

  it('has content TEXT NOT NULL with length check', async () => {
    const { rows } = await client.query(`
      SELECT is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'content';
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('NO');
  });

  it('has metadata JSONB column (nullable)', async () => {
    const { rows } = await client.query(`
      SELECT data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'metadata';
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe('jsonb');
  });

  it('has FK conversation_id → conversations(id) ON DELETE CASCADE', async () => {
    const { rows } = await client.query(`
      SELECT confdeltype::text
      FROM pg_constraint
      WHERE conname = 'messages_conversation_id_fkey';
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].confdeltype).toBe('c');
  });
});

describe('agent_jobs table', () => {
  it('has agent_jobs table', async () => {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'agent_jobs'
      ) AS exists;
    `);
    expect(rows[0].exists).toBe(true);
  });

  it('has job_status ENUM with queued|processing|succeeded|failed|cancelled', async () => {
    const { rows } = await client.query(`
      SELECT enum_range(NULL::job_status) AS values;
    `);
    const values = rows[0].values as string[];
    ['queued', 'processing', 'succeeded', 'failed', 'cancelled'].forEach((v) => {
      expect(values).toContain(v);
    });
  });

  it('has UNIQUE constraint on (owner_user_id, idempotency_key)', async () => {
    const { rows } = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conname = 'uq_idempotency_per_owner'
        AND contype = 'u';
    `);
    expect(rows).toHaveLength(1);
  });

  it('has FK trigger_message_id → messages(id) ON DELETE RESTRICT', async () => {
    const { rows } = await client.query(`
      SELECT confdeltype::text
      FROM pg_constraint
      WHERE conname = 'fk_trigger_message';
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].confdeltype).toBe('r');
  });

  it('has partial index for pending jobs', async () => {
    const { rows } = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'agent_jobs'
        AND indexname = 'idx_agent_jobs_pending';
    `);
    expect(rows).toHaveLength(1);
  });
});

describe('citations table', () => {
  it('has citations table', async () => {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'citations'
      ) AS exists;
    `);
    expect(rows[0].exists).toBe(true);
  });

  it('has FK message_id → messages(id) ON DELETE CASCADE', async () => {
    const { rows } = await client.query(`
      SELECT confdeltype::text
      FROM pg_constraint
      WHERE conname = 'citations_message_id_fkey';
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].confdeltype).toBe('c');
  });
});

describe('updated_at trigger', () => {
  it('set_updated_at function exists', async () => {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM pg_proc WHERE proname = 'set_updated_at'
      ) AS exists;
    `);
    expect(rows[0].exists).toBe(true);
  });
});

describe('agent_jobs Step 16 orchestration columns', () => {
  it('has attempt default 0 (executions claimed, not creation count)', async () => {
    const { rows } = await client.query(`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'agent_jobs'
        AND column_name = 'attempt';
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].column_default).toBe('0');
  });

  it('has lease_token, delivery_id, and next_attempt_at UUID columns', async () => {
    const { rows } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'agent_jobs'
        AND column_name IN ('lease_token', 'delivery_id', 'next_attempt_at');
    `);
    const names = rows.map((r: { column_name: string }) => r.column_name).sort();
    expect(names).toEqual(['delivery_id', 'lease_token', 'next_attempt_at']);
  });

  it('has UNIQUE constraint on assistant_message_id', async () => {
    const { rows } = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conname = 'agent_jobs_assistant_message_id_key'
        AND contype = 'u';
    `);
    expect(rows).toHaveLength(1);
  });

  it('has FK assistant_message_id → messages(id) ON DELETE SET NULL', async () => {
    const { rows } = await client.query(`
      SELECT confdeltype::text
      FROM pg_constraint
      WHERE conname = 'fk_agent_jobs_assistant_message';
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].confdeltype).toBe('n');
  });

  it('has partial index for expired processing-lease recovery', async () => {
    const { rows } = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'agent_jobs'
        AND indexname = 'idx_agent_jobs_processing_lease';
    `);
    expect(rows).toHaveLength(1);
  });
});

describe('agent_job_outbox table', () => {
  it('exists with expected columns', async () => {
    const { rows } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'agent_job_outbox'
      ORDER BY ordinal_position;
    `);
    const cols = rows.map((r: { column_name: string }) => r.column_name);
    expect(cols).toContain('id');
    expect(cols).toContain('agent_job_id');
    expect(cols).toContain('available_at');
    expect(cols).toContain('published_at');
    expect(cols).toContain('dispatch_lease_token');
    expect(cols).toContain('dispatch_lease_until');
    expect(cols).toContain('delivery_id');
    expect(cols).toContain('dispatch_count');
    expect(cols).toContain('last_error');
  });

  it('has UNIQUE agent_job_id FK to agent_jobs', async () => {
    const { rows } = await client.query(`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conname = 'agent_job_outbox_agent_job_id_key'
        OR conname = 'agent_job_outbox_agent_job_id_fkey';
    `);
    const types = rows.map((r: { contype: string }) => r.contype);
    expect(types).toContain('u');
    expect(types).toContain('f');
  });

  it('has RLS enabled and no grants to anon or authenticated', async () => {
    const { rows: rlsRows } = await client.query(`
      SELECT rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = 'agent_job_outbox';
    `);
    expect(rlsRows[0]?.rowsecurity).toBe(true);

    const { rows: privRows } = await client.query(`
      SELECT grantee, privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND table_name = 'agent_job_outbox'
        AND grantee IN ('anon', 'authenticated');
    `);
    expect(privRows).toHaveLength(0);
  });

  it('has partial index for due outbox scan', async () => {
    const { rows } = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'agent_job_outbox'
        AND indexname = 'idx_outbox_due';
    `);
    expect(rows).toHaveLength(1);
  });
});
