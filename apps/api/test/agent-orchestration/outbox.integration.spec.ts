/**
 * Step 16 outbox + lease/delivery fencing integration tests.
 *
 * Prerequisites: `supabase start` and `supabase db reset` must have been run.
 * Also set SUPABASE_PUBLISHABLE_KEY in apps/api/.env (from `supabase status`).
 *
 * This suite exercises the REAL Postgres transaction and fencing behavior that
 * guarantees at-most-once assistant results. It does not call SQS or the Agent
 * Runtime — those boundaries are exercised by the hermetic unit suites.
 *
 * Tests:
 *   1. Concurrent claim of the same outbox row → exactly one delivery becomes canonical
 *   2. Lease expiry + stale claimant cannot markPublished / release a newer lease
 *   3. Stale worker completion after a retry creates zero assistant rows
 *   4. assistant_message_id uniqueness/fencing leaves no duplicate assistant/citation rows
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { config } from 'dotenv';
import { PrismaService } from '../../src/database/prisma.service';
import { OutboxService } from '../../src/modules/agent-orchestration/outbox.service';
import { JobClaimerService } from '../../src/modules/agent-orchestration/job-claimer.service';
import { JobPersistenceService } from '../../src/modules/agent-orchestration/job-persistence.service';
import { JobFailureService } from '../../src/modules/agent-orchestration/job-failure.service';
import type { AgentResponse } from '../../src/integrations/agent-runtime';

config({ path: resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const DIRECT_DATABASE_URL =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_DIRECT_DATABASE_URL = process.env.DIRECT_DATABASE_URL;

describe('Agent Orchestration Outbox Integration', () => {
  let pgPool: Pool;
  let prismaA: PrismaService;
  let prismaB: PrismaService;
  let outboxA: OutboxService;
  let outboxB: OutboxService;
  let claimerA: JobClaimerService;
  let claimerB: JobClaimerService;
  let persistence: JobPersistenceService;
  let failure: JobFailureService;

  const authUserIds = new Set<string>();

  beforeAll(async () => {
    if (!SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('SUPABASE_PUBLISHABLE_KEY is required for integration tests');
    }

    pgPool = new Pool({ connectionString: DIRECT_DATABASE_URL });

    // Prisma reads DATABASE_URL at construction: point both independent clients
    // at the direct local Postgres and restore the environment afterwards.
    process.env.DATABASE_URL = DIRECT_DATABASE_URL;
    try {
      prismaA = new PrismaService();
      prismaB = new PrismaService();
    } finally {
      if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    }

    outboxA = new OutboxService(prismaA);
    outboxB = new OutboxService(prismaB);
    claimerA = new JobClaimerService(prismaA);
    claimerB = new JobClaimerService(prismaB);
    persistence = new JobPersistenceService(prismaA);
    failure = new JobFailureService(prismaA);
  }, 30000);

  afterEach(async () => {
    // Cascade cleanup: auth.users → users → conversations → messages → agent_jobs → outbox/citations.
    await Promise.all([...authUserIds].map(deleteAuthUser));
    authUserIds.clear();
  });

  afterAll(async () => {
    await prismaA.$disconnect();
    await prismaB.$disconnect();
    await pgPool.end();
    if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    if (ORIGINAL_DIRECT_DATABASE_URL === undefined) delete process.env.DIRECT_DATABASE_URL;
    else process.env.DIRECT_DATABASE_URL = ORIGINAL_DIRECT_DATABASE_URL;
  }, 30000);

  async function deleteAuthUser(userId: string): Promise<void> {
    await pgPool.query('DELETE FROM auth.users WHERE id = $1', [userId]);
  }

  async function signUp(): Promise<string> {
    const email = `agent-orch-${randomUUID()}@example.test`;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY!,
      },
      body: JSON.stringify({ email, password: 'Password123!' }),
    });
    const body = await res.json();
    if (!res.ok || !body.user?.id) {
      throw new Error(`Signup failed: ${JSON.stringify(body)}`);
    }
    authUserIds.add(body.user.id);
    return body.user.id as string;
  }

  async function seedQueuedJob(userId: string): Promise<{
    conversationId: string;
    triggerMessageId: string;
    jobId: string;
    outboxId: string;
  }> {
    const conversationId = randomUUID();
    const triggerMessageId = randomUUID();
    const jobId = randomUUID();
    const outboxId = randomUUID();
    const idempotencyKey = randomUUID();
    const correlationId = randomUUID();

    await pgPool.query(
      `INSERT INTO conversations (id, owner_user_id, title)
       VALUES ($1, $2, 'Integration')`,
      [conversationId, userId],
    );
    await pgPool.query(
      `INSERT INTO messages (id, conversation_id, author_role, content)
       VALUES ($1, $2, 'user', 'What are my rights?')`,
      [triggerMessageId, conversationId],
    );
    await pgPool.query(
      `INSERT INTO agent_jobs
         (id, conversation_id, trigger_message_id, owner_user_id, status,
          idempotency_key, correlation_id, attempt, max_attempts)
       VALUES ($1, $2, $3, $4, 'queued', $5, $6, 0, 3)`,
      [jobId, conversationId, triggerMessageId, userId, idempotencyKey, correlationId],
    );
    await pgPool.query(
      'INSERT INTO agent_job_outbox (id, agent_job_id) VALUES ($1, $2)',
      [outboxId, jobId],
    );

    return { conversationId, triggerMessageId, jobId, outboxId };
  }

  async function forceEligible(jobId: string): Promise<void> {
    await pgPool.query(
      `UPDATE agent_job_outbox
       SET available_at = now() - interval '1 second',
           dispatch_lease_until = NULL,
           dispatch_lease_token = NULL,
           delivery_id = NULL,
           published_at = NULL
       WHERE agent_job_id = $1`,
      [jobId],
    );
    await pgPool.query(
      `UPDATE agent_jobs
       SET next_attempt_at = NULL
       WHERE id = $1`,
      [jobId],
    );
  }

  async function countAssistantMessages(conversationId: string): Promise<number> {
    const { rows } = await pgPool.query(
      `SELECT count(*)::int AS count
       FROM messages
       WHERE conversation_id = $1 AND author_role = 'assistant'`,
      [conversationId],
    );
    return rows[0].count as number;
  }

  async function countCitations(messageId: string | null): Promise<number> {
    if (!messageId) return 0;
    const { rows } = await pgPool.query(
      'SELECT count(*)::int AS count FROM citations WHERE message_id = $1',
      [messageId],
    );
    return rows[0].count as number;
  }

  async function getJob(jobId: string): Promise<{
    status: string;
    delivery_id: string | null;
    lease_token: string | null;
    assistant_message_id: string | null;
    attempt: number;
    dispatch_count: number;
  }> {
    const { rows } = await pgPool.query(
      `SELECT j.status, j.delivery_id, j.lease_token, j.assistant_message_id,
              j.attempt, o.dispatch_count
       FROM agent_jobs j
       LEFT JOIN agent_job_outbox o ON o.agent_job_id = j.id
       WHERE j.id = $1`,
      [jobId],
    );
    return rows[0] as {
      status: string;
      delivery_id: string | null;
      lease_token: string | null;
      assistant_message_id: string | null;
      attempt: number;
      dispatch_count: number;
    };
  }

  async function getOutboxDelivery(jobId: string): Promise<{
    delivery_id: string | null;
    dispatch_lease_token: string | null;
    published_at: Date | null;
    dispatch_count: number;
  }> {
    const { rows } = await pgPool.query(
      `SELECT delivery_id, dispatch_lease_token, published_at, dispatch_count
       FROM agent_job_outbox
       WHERE agent_job_id = $1`,
      [jobId],
    );
    return rows[0] as {
      delivery_id: string | null;
      dispatch_lease_token: string | null;
      published_at: Date | null;
      dispatch_count: number;
    };
  }

  const validResponse = (requestId: string): AgentResponse => ({
    request_id: requestId,
    status: 'success',
    answer: 'Answer from the agent',
    verified_citations: ['[VIC RTA 1997 Sec 63]'],
    citation_verified_rate: 0.5,
    selected_jurisdiction: 'VIC',
    latency_ms: 120,
    trace_id: 'trace-1',
    api_version: '1.0',
    generated_at: new Date().toISOString(),
  });

  describe('concurrent outbox claim', () => {
    it('exactly one claimant wins and the job/outbox agree on the canonical delivery_id', async () => {
      const userId = await signUp();
      const { jobId, outboxId } = await seedQueuedJob(userId);

      const [claimA, claimB] = await Promise.all([
        outboxA.claimForDispatch(jobId),
        outboxB.claimForDispatch(jobId),
      ]);

      const winner = claimA ?? claimB;
      const loser = claimA ? claimB : claimA;
      const nonNullClaims = [claimA, claimB].filter((c) => c !== null).length;

      expect(nonNullClaims).toBe(1);
      expect(winner).not.toBeNull();
      expect(loser).toBeNull();

      // Final invariants, not "two promises started at the same time".
      const job = await getJob(jobId);
      const outbox = await getOutboxDelivery(jobId);
      expect(job.delivery_id).toBe(winner!.deliveryId);
      expect(outbox.delivery_id).toBe(winner!.deliveryId);
      expect(outbox.dispatch_count).toBe(1);
      expect(outbox.dispatch_lease_token).toBe(winner!.dispatchLeaseToken);
      expect(winner!.outboxId).toBe(outboxId);

      // The losing claimant has no valid lease token and cannot publish.
      await expect(
        outboxA.markPublished(outboxId, 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
      ).resolves.toBe(false);
    });
  });

  describe('lease expiry and stale claimant', () => {
    it('an old claimant cannot publish, release, or overwrite a newer dispatch claim', async () => {
      const userId = await signUp();
      const { jobId, outboxId } = await seedQueuedJob(userId);

      // First claimant (A) acquires the dispatch lease.
      const claimA = await outboxA.claimForDispatch(jobId);
      expect(claimA).not.toBeNull();
      const deliveryA = claimA!.deliveryId;

      // Simulate lease expiry (time passes; dispatcher interval elapses).
      await pgPool.query(
        `UPDATE agent_job_outbox
         SET dispatch_lease_until = now() - interval '1 second'
         WHERE id = $1`,
        [outboxId],
      );

      // A new dispatcher generation (B) claims the row with a fresh delivery_id.
      const claimB = await outboxB.claimForDispatch(jobId);
      expect(claimB).not.toBeNull();
      expect(claimB!.deliveryId).not.toBe(deliveryA);

      // Stale claimant A cannot mark the newly claimed row published.
      await expect(
        outboxA.markPublished(outboxId, claimA!.dispatchLeaseToken),
      ).resolves.toBe(false);

      // Stale claimant A cannot release the newer lease or clear its delivery.
      await outboxA.releaseDispatchLease(outboxId, claimA!.dispatchLeaseToken);
      const afterRelease = await getOutboxDelivery(jobId);
      expect(afterRelease.delivery_id).toBe(claimB!.deliveryId);
      expect(afterRelease.dispatch_lease_token).toBe(claimB!.dispatchLeaseToken);
      expect(afterRelease.published_at).toBeNull();

      // The job is NOT permanently queued: it still carries B's delivery and the
      // winner can publish normally.
      const job = await getJob(jobId);
      expect(job.status).toBe('queued');
      expect(job.delivery_id).toBe(claimB!.deliveryId);
      await expect(
        outboxB.markPublished(outboxId, claimB!.dispatchLeaseToken),
      ).resolves.toBe(true);
    });
  });

  describe('stale worker completion after retry', () => {
    it('a completion from an older delivery generation writes zero assistant rows', async () => {
      const userId = await signUp();
      const { jobId, conversationId } = await seedQueuedJob(userId);

      // Dispatcher A delivers generation D1; worker A claims it.
      const claimDispatchA = await outboxA.claimForDispatch(jobId);
      expect(claimDispatchA).not.toBeNull();
      const workerA = await claimerA.claimJob(
        jobId,
        claimDispatchA!.deliveryId,
      );
      expect(workerA).not.toBeNull();

      // DB-authoritative retry: worker A fails retryably; the job re-queues and
      // the outbox re-arms for a future attempt.
      await failure.handleRetryableFailure(workerA!.job, workerA!.job.attempt);

      // Dispatcher B later claims a NEW generation D2; worker B claims it.
      await forceEligible(jobId);
      const claimDispatchB = await outboxB.claimForDispatch(jobId);
      expect(claimDispatchB).not.toBeNull();
      expect(claimDispatchB!.deliveryId).not.toBe(claimDispatchA!.deliveryId);
      const workerB = await claimerB.claimJob(
        jobId,
        claimDispatchB!.deliveryId,
      );
      expect(workerB).not.toBeNull();

      // Stale worker A tries to complete with the OLD claim (lease L1 / delivery D1).
      const stalePersistence = new JobPersistenceService(prismaB);
      await expect(
        stalePersistence.persistSuccess(workerA!.job, validResponse(workerA!.job.correlationId)),
      ).rejects.toThrow('Job persistence fenced update failed');

      // Final invariants: zero assistant rows, zero citations, job still the
      // newer B generation.
      expect(await countAssistantMessages(conversationId)).toBe(0);
      const job = await getJob(jobId);
      expect(job.status).toBe('processing');
      expect(job.delivery_id).toBe(claimDispatchB!.deliveryId);
      expect(job.lease_token).toBe(workerB!.job.leaseToken);
      expect(job.attempt).toBe(2);

      // The legitimate B worker still succeeds.
      const msgId = await persistence.persistSuccess(
        workerB!.job,
        validResponse(workerB!.job.correlationId),
      );
      expect(await countAssistantMessages(conversationId)).toBe(1);
      expect(await countCitations(msgId)).toBe(1);
    });
  });

  describe('assistant_message_id uniqueness/fencing conflict', () => {
    it('a duplicate completion leaves no duplicate assistant message and no orphan citations', async () => {
      const userId = await signUp();
      const { jobId, conversationId } = await seedQueuedJob(userId);

      const claimDispatch = await outboxA.claimForDispatch(jobId);
      expect(claimDispatch).not.toBeNull();
      const worker = await claimerA.claimJob(jobId, claimDispatch!.deliveryId);
      expect(worker).not.toBeNull();

      // First completion succeeds.
      const msgId = await persistence.persistSuccess(
        worker!.job,
        validResponse(worker!.job.correlationId),
      );
      expect(await countAssistantMessages(conversationId)).toBe(1);

      // A duplicate completion with the SAME claim is refused by the fence
      // (job is no longer 'processing' with the same lease/delivery).
      await expect(
        persistence.persistSuccess(worker!.job, validResponse(worker!.job.correlationId)),
      ).rejects.toThrow('Job persistence fenced update failed');

      // Final invariants: exactly one assistant message and only its citations.
      expect(await countAssistantMessages(conversationId)).toBe(1);
      expect(await countCitations(msgId)).toBe(1);

      const job = await getJob(jobId);
      expect(job.status).toBe('succeeded');
      expect(job.assistant_message_id).toBe(msgId);

      const { rows } = await pgPool.query(
        `SELECT count(*)::int AS count FROM citations
         WHERE message_id IN (
           SELECT id FROM messages WHERE conversation_id = $1 AND author_role = 'assistant'
         )`,
        [conversationId],
      );
      expect(rows[0].count as number).toBe(1);
    });
  });
});
