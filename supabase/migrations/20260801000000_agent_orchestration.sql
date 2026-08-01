-- Migration: Agent orchestration (Step 16)
-- Transactions: agent_job_outbox, attempt semantics, lease/delivery fencing, assistant result uniqueness

-- =============================================================================
-- 1. agent_jobs columns and semantics
-- =============================================================================

-- Change attempt default to 0 (executions claimed, not creation count)
ALTER TABLE agent_jobs ALTER COLUMN attempt SET DEFAULT 0;

-- Relax CHECK to allow attempt >= 0 (unclaimed)
ALTER TABLE agent_jobs DROP CONSTRAINT agent_jobs_attempt_check;
ALTER TABLE agent_jobs ADD CONSTRAINT agent_jobs_attempt_check CHECK (attempt >= 0);

-- Backfill pre-worker queued rows: they were created with attempt=1 but never claimed
UPDATE agent_jobs SET attempt = 0 WHERE status = 'queued' AND attempt = 1;

-- Per-claim lease token: uniquely identifies the active processing attempt
ALTER TABLE agent_jobs ADD COLUMN lease_token UUID;

-- Expected-dispatch fence: the delivery generation the worker must present to claim
ALTER TABLE agent_jobs ADD COLUMN delivery_id UUID;

-- At-most-once assistant result: nullable unique FK to the resulting assistant message.
-- ON DELETE SET NULL so message deletion (via conversation cascade) does not delete
-- the job row; the job is cascade-deleted via its own conversation FK.
ALTER TABLE agent_jobs ADD COLUMN assistant_message_id UUID UNIQUE;
ALTER TABLE agent_jobs ADD CONSTRAINT fk_agent_jobs_assistant_message
  FOREIGN KEY (assistant_message_id) REFERENCES messages(id) ON DELETE SET NULL;

-- Index for expired-lease recovery by the dispatcher
CREATE INDEX idx_agent_jobs_processing_lease
  ON agent_jobs (status, lease_until)
  WHERE status = 'processing';

-- =============================================================================
-- 2. agent_job_outbox — transactional outbox
-- =============================================================================

CREATE TABLE agent_job_outbox (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_job_id          UUID NOT NULL UNIQUE REFERENCES agent_jobs(id) ON DELETE CASCADE,
  available_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at          TIMESTAMPTZ,
  dispatch_lease_token  UUID,
  dispatch_lease_until  TIMESTAMPTZ,
  delivery_id           UUID,
  dispatch_count        INT NOT NULL DEFAULT 0 CHECK (dispatch_count >= 0),
  last_error            JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Preserve jobs created by Step 15 before the transactional outbox existed.
INSERT INTO agent_job_outbox (agent_job_id)
SELECT id
FROM agent_jobs
WHERE status = 'queued'
ON CONFLICT (agent_job_id) DO NOTHING;

CREATE INDEX idx_outbox_due
  ON agent_job_outbox (available_at, dispatch_lease_until)
  WHERE published_at IS NULL;

CREATE TRIGGER trg_agent_job_outbox_updated_at
  BEFORE UPDATE ON agent_job_outbox
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 3. RLS: outbox — no browser access
-- =============================================================================

ALTER TABLE agent_job_outbox ENABLE ROW LEVEL SECURITY;

-- Revoke all access from browser roles; server-side service-role access
-- (via Prisma direct connection) bypasses RLS as the table owner.
REVOKE ALL ON agent_job_outbox FROM anon;
REVOKE ALL ON agent_job_outbox FROM authenticated;
