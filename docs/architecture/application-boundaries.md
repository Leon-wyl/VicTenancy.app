# Application Boundaries

## Runtime and CRUD Separation

The Agent Runtime (`AusTenancy.ai`) is an external FastAPI/Mangum service deployed
on AWS Lambda behind API Gateway. It owns the LangGraph agent, RAG retrieval, and
Bedrock integration. It lives in a separate repository.

`apps/api/` is the NestJS service for user-scoped application data:
conversations, messages, agent jobs, citations, and related ownership checks.
CRUD endpoints create durable job records and do not synchronously call
retrieval or the Agent Runtime.

Do not place Agent code (LangGraph, FastAPI, RAG, Bedrock, Qdrant seed data,
Terraform) in this repository. The Agent Runtime API contract is documented at
[`docs/integrations/agent-runtime.md`](../integrations/agent-runtime.md).

## Lambda Deploy Boundary (Step 15a — In Progress)

`apps/api/src/bootstrap/` creates the Nest HTTP application and is shared
between the local `main.ts` listener and the Lambda handler in `lambda.ts`.

`apps/api/src/lambda.ts` is a thin API Gateway v2 adapter that:
1. Loads runtime configuration from AWS Secrets Manager via `loadRuntimeConfig()`
2. Reuses the `createApp()` factory from `src/bootstrap/`
3. Delegates events to `@codegenie/serverless-express`

It must not contain business logic, auth rules, or database operations.

The Lambda reads its `DATABASE_URL` from Secrets Manager at cold start.
`DIRECT_DATABASE_URL` is forbidden in the Lambda runtime. All non-sensitive
configuration (Supabase URL, JWT issuer, quotas) is passed through Lambda
environment variables defined in Terraform.

Runtime infrastructure is managed by Terraform in `infra/aws/`:
- **Bootstrap** (account-level): S3 state bucket, GitHub OIDC provider, ECR
- **Deploy roles**: least-privilege OIDC roles per environment
- **Execution roles**: Lambda access to CloudWatch logs + Secrets Manager secret only
- **Module**: reusable Lambda + API Gateway HTTP API v2 (28s timeout, 512 MB, x86_64)
- **Environments**: staging (reserved concurrency 5) and production (reserved concurrency 10)

API Gateway applies no authorization — all JWT enforcement is performed by the
application's `JwtAuthGuard`, just as in local development.

## Client and Credential Boundary

The browser application in `apps/web/` may use Supabase Auth and Realtime with
browser-safe `NEXT_PUBLIC_*` configuration. Business-data writes go through the
API. Browser code must not receive AWS IAM credentials, database credentials, or
a Supabase service-role key, and must not directly invoke the AWS-IAM Agent
Runtime route.

Service-role credentials are server-only. User-scoped operations must use the
authenticated user identity and must not rely on a browser-supplied owner ID.

## Auth Boundary (Step 14b)

The NestJS API verifies Supabase JWTs via asymmetric JWKS (or a pinned
`/auth/v1/user` fallback for legacy HS256 local environments). A global
`JwtAuthGuard` enforces Bearer-token authentication on all routes except
those explicitly marked `@Public()` (currently `GET /health`).

`GET /auth/me` returns a minimal principal summary derived from verified token
claims. Ownership (`principal.sub`) is always derived from the token, never
from a request body or query parameter.

Next.js middleware refreshes Supabase session cookies on every request but
does not enforce route protection — the UX shell is deferred to Step 17.
The OAuth callback route (`/auth/callback`) exchanges authorization codes for
sessions and validates the redirect target to prevent open-redirect attacks.

The `public.handle_new_user()` SECURITY DEFINER trigger creates a `public.users`
row on every `auth.users` INSERT. This is the sole auto-provisioning path.

## Schema Boundary

Supabase SQL migrations (`supabase/migrations/`) are the sole DDL authority.
Prisma is used only for client generation (`prisma generate`). Do not use
`prisma migrate` or `prisma db push`.

## CRUD API Boundary (Step 15)

Authenticated business endpoints live under `/v1/conversations`. The API owns
conversation creation, cursor-based listing, title updates, hard deletion,
message listing, and user-message submission. Every lookup and mutation derives
the owner from the verified JWT `principal.sub`; unknown and cross-user
conversations return 404.

`POST /v1/conversations/:conversationId/messages` requires a UUID
`Idempotency-Key`. It creates a user message, updates conversation activity,
and creates a queued `agent_jobs` row in one Serializable transaction. A
replayed key with identical conversation and content returns the original
message/job without invoking the Agent Runtime. Agent execution, assistant
messages, citation writes, job processing, retries, and streaming remain
owned by Step 16.

The NestJS API does not own login, logout, OAuth, password reset, refresh, or
session issuance; those remain Supabase Auth and frontend responsibilities.

## Data Controls Boundary (Step 14c)

Every API response carries an `X-Request-Id` header (preserved from client if a
valid UUID, otherwise regenerated). Correlation IDs flow through async-local
storage and are included in structured request logs (never logging secrets,
tokens, or PII).

Authenticated request paths consume per-user quotas atomically in PostgreSQL
via `check_and_increment_quota()`, a `SECURITY INVOKER` function that uses
`pg_advisory_xact_lock` for all-or-nothing atomicity across minute and day
windows. Browser roles are explicitly revoked from the function and the
`request_quota_counters` table. Denied requests return HTTP 429 with a
`Retry-After` header.

Request bodies are bounded at 16 KiB; oversized payloads return 413.
A global `ValidationPipe` enforces whitelist, forbidNonWhitelisted, and
transform. The Prisma service connects lazily — `GET /health` does not depend
on a database connection. `DATABASE_URL` targets runtime connections;
`DIRECT_DATABASE_URL` is for migrations, admin, and integration tests.

## Infrastructure Boundary

`compose.yaml` is the local development orchestrator for Qdrant, API, and the
web application. It does not manage cloud infrastructure.

`supabase/` contains non-sensitive Supabase CLI configuration. Supabase Cloud
project provisioning (staging and production) is delivered in Step 14d
via CI-driven migration promotion.

### Managed Supabase Projects (Step 14d)

Separate staging and production Supabase Cloud projects exist with independent
identities, JWT signing keys, OAuth clients, and connection strings.

**Schema promotion path** (CI only under normal operations):
1. PR validation (`.github/workflows/validate.yml`): `supabase db lint` →
   `supabase db reset` → Prisma generate → lint → build → test.
2. Staging promotion (`.github/workflows/deploy-staging.yml`): automatic on
   merge to main when `supabase/migrations/` changes.
3. Production promotion (`.github/workflows/deploy-production.yml`): manual
   dispatch from main; verifies the same commit SHA has a successful staging
   deployment through GitHub deployment metadata, then requires the protected
   production Environment approval gate.

**Dashboard policy**: Supabase Dashboard is allowed for project settings, OAuth
configuration, JWT signing keys, observability, and backup restore approval.
It must **never** be used for DDL (SQL Editor, Table Editor). All schema changes
flow through committed SQL migrations and CI.

**Connection modes**:
- `DATABASE_URL`: Supavisor transaction-mode pooling (`:6543?pgbouncer=true`)
  for API runtime connections.
- `DIRECT_DATABASE_URL`: direct database endpoint (`:5432`) for migrations,
  administration, and controlled integration operations.

**Production database access**: least privilege, MFA-protected, time-bounded,
audited, and credential-manager backed. See
[`docs/operations/managed-supabase.md`](../operations/managed-supabase.md).

**Network restrictions**: deferred to Step 15a pending stable AWS/CI egress IPs.
Do not enable an allowlist that blocks CI migration workflows or future Lambda
runtime connectivity.

Future cloud IaC belongs in `infra/aws/`. This repository does not contain
Terraform, CDK, SAM, or Serverless Framework configurations.

## Cross-Repository Contract

Agent invocation remains deferred to Step 16. When implemented, the invocation
must be server-to-server from trusted application infrastructure. The Agent
Runtime API contract is versioned and owned by the AusTenancy.ai repository.
