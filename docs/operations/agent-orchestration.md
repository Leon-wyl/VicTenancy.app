# Agent Orchestration

## Architecture

```
Browser (POST /conversations/:id/messages)
  → NestJS API (Lambda)
    → agent_jobs + agent_job_outbox (atomic tx)
    → SQS FIFO best-effort (low latency; failure swallowed)
      ↓
  SQS FIFO (conversation_id group, delivery_id dedup)
    → Worker Lambda (batch size 1,ReportBatchItemFailures)
      → Claim job (atomic DB lease + delivery_id fence)
      → SigV4-signed POST to Agent Runtime
      → Persist assistant message + citations + succeeded (one tx)
      → or Reschedule retry (30s/120s backoff) / Terminal fail

EventBridge rate(1 minute)
  → Dispatcher Lambda
    → Recover expired processing leases → queued (or failed)
    → Publish due outbox records (delivery_id claim + SQS send)

SQS FIFO DLQ (maxReceiveCount=3)
  → Terminalizer Lambda
    → Mark failed only if job still processing for that exact delivery_id
```

## Shared Agent Runtime

Both staging and production workers invoke the **same deployed AusTenancy.ai Agent Runtime**
endpoint via AWS SigV4. This shares Agent Lambda capacity, Bedrock quotas, cost, and
Agent-side observability across VicTenancy environments. All VicTenancy user data, queues,
databases, jobs, credentials, and logs remain environment-isolated.

The Agent Runtime endpoint URL and exact `execute-api` ARN are configured as
non-secret `TF_VAR_agent_runtime_*` values from GitHub Environment `vars`. They are
never hardcoded in source, Terraform, or documentation.

## Job State Machine

```
queued ──(dispatcher publishes)→ SQS ──(worker claims)→ processing
                                                           │
                         ┌─────────────────────────────────┤
                         │                                 │
                    succeeded                          (Agent error)
                 (assistant msg                         │
                  + citations)                   ┌───────┴────────┐
                                                 │                │
                                            retryable        non-retryable
                                          (attempt < 3)     (attempt ≥ 3
                                          → queued           or 422)
                                          + 30s/120s        → failed
                                          backoff           (terminal)

processing ──(lease expired)→ dispatcher recovery → queued (or failed)
processing ──(DLQ)→ terminalizer (delivery_id fence) → failed (stale otherwise)
```

- `attempt` default 0, incremented **only** by a successful atomic claim.
- `max_attempts = 3`. Claim refuses when `attempt ≥ max_attempts`.
- `succeeded` / `failed` / `cancelled` are terminal; worker claim allows **only** `status = 'queued'`.
- At-most-once assistant result: `agent_jobs.assistant_message_id` UNIQUE FK + fenced claim.

## delivery_id Ownership Model

Every dispatch generates a fresh `delivery_id` UUID, minted in the outbox claim
transaction and written to **both** `agent_job_outbox.delivery_id` and
`agent_jobs.delivery_id` before SQS is sent. The SQS envelope carries the
`deliveryId`. The worker claim requires `agent_jobs.delivery_id = :payloadDeliveryId`
and never overwrites it. All completion, retry, and terminal writes fence on
`id + status='processing' + lease_token + delivery_id`. A payload whose
`deliveryId` no longer matches the job is acknowledged as a stale no-op.

`MessageDeduplicationId = deliveryId` (never `jobId`). The 5-minute FIFO
dedup window never strands a retry because every DB-authoritative retry gets a
**new** `delivery_id`; duplicate sends of the same outbox claim retain the same
`delivery_id` for deduplication.

## Retry Schedule

- `max_attempts = 3`
- Attempt 1 failure → retry after **30 seconds**
- Attempt 2 failure → retry after **120 seconds**
- Attempt 3 failure → **terminal failed**
- Retry count incremented only by successful atomic claim; SQS `ApproximateReceiveCount` is never the application retry count.
- Deterministic; optional bounded jitter only if injectable in tests.

## Operational Runbook

### Queue and DLQ

| Resource | Purpose | Retention |
|---|---|---|
| `victenancy-{env}-agent-jobs.fifo` | Pending deliveries (grouped by conversation) | 4 days |
| `victenancy-{env}-agent-jobs-dlq.fifo` | Worker crashes / unhandled failures | 14 days |

- **Visibility timeout**: 150s (≥ 120s job lease + buffer)
- **Redrive maxReceiveCount**: 3 → DLQ after 3rd failed receive
- **Worker max concurrency**: 2 (event-source `scaling_config.maximum_concurrency`; AWS requires a minimum of 2)
- **Dispatcher interval**: 60s (EventBridge `rate(1 minute)`)

### Safe Replay Behaviour

Any SQS message whose deliveryId no longer matches the job's expected generation
is a no-op (acknowledged without invoking the Agent Runtime). Duplicate same-delivery
messages trigger an atomic claim that returns zero rows (job already processing
or terminal) → acknowledged no-op. The unique `assistant_message_id` constraint
prevents duplicate assistant message creation.

### Monitoring and Alarms

| Alarm | Metric | Threshold |
|---|---|---|
| Worker errors | Lambda `Errors` | > 0 |
| Worker duration (p99) | Lambda `Duration` p99 | > 30s |
| Queue age | SQS `ApproximateAgeOfOldestMessage` | > 5 min |
| Queue backlog | SQS `ApproximateNumberOfMessagesVisible` | > 50 |
| DLQ visible | SQS DLQ `ApproximateNumberOfMessagesVisible` | > 0 |

### Rollback Limitations

SQS FIFO messages are not preserved across queue deletion. A Terraform destroy
of the orchestration module permanently removes in-flight deliveries. Prefer
in-place updates to the Lambda image, queue attributes, or event-source
mapping. The `reserved_concurrency = -1` setting for all orchestration functions
is intentional and must not be raised unless the account concurrency quota has
first been increased above the unreserved minimum.

## Database

| Table | Purpose | Browser Access |
|---|---|---|
| `agent_jobs` | Job state, lease, delivery | SELECT own only |
| `agent_job_outbox` | Transactional outbox | None (RLS enabled, revoked) |

- `agent_jobs.attempt` default 0; backfill `1 → 0` for pre-worker queued rows.
- `agent_jobs.assistant_message_id` UNIQUE FK → `messages(id) ON DELETE SET NULL`.
- `agent_jobs.lease_token` / `delivery_id` cleared on completion or retry re-arm.
- Outbox `published_at` NULL until dispatched; `dispatch_lease_token` / `delivery_id` for claim fencing.

## Local Development

```bash
# Prerequisites: local Supabase, Agent Runtime (AusTenancy.ai) on :8080
# Set AGENT_RUNTIME_MODE=local and AGENT_RUNTIME_INVOKE_URL=http://localhost:8080
# in apps/api/.env
npm run worker:local -w @victenancy/api
```

This recovers expired leases, claims due outbox jobs, and invokes the local Agent
Runtime directly (no SQS). The API best-effort SQS publish is a no-op in local mode.

## External Go-Live Prerequisite

Before production deployment:
1. Obtain the currently deployed Agent Runtime `POST /api/agent/invoke` URL.
2. Obtain the exact `execute-api` ARN for that route (format: `arn:aws:execute-api:ap-southeast-2:<account>:<api-id>/*/POST/api/agent/invoke`).
3. Configure both `staging` and `production` GitHub Environments with these non-secret variables: `AGENT_RUNTIME_MODE=aws_iam`, `AGENT_RUNTIME_INVOKE_URL`, `AGENT_RUNTIME_EXECUTE_API_ARN`.
4. Verify the shared Agent Runtime API Gateway allows `execute-api:Invoke` from the VicTenancy worker IAM roles (same AWS account, resource-based or identity-based policy).
