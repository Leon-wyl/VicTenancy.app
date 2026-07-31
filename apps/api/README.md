# API Service

VicTenancy.app NestJS API service (`@victenancy/api`).
Infrastructure was established in Steps 14a–14d; Step 15 implements the first
versioned business endpoints.

## Ownership

- This service owns CRUD APIs for conversations, messages, agent jobs, and citations.
- It validates Supabase JWTs and enforces authorization before every user-scoped operation.
- It creates Agent jobs for later asynchronous execution; it must not synchronously invoke
  retrieval or the Agent Runtime from CRUD endpoints.
- The Agent Runtime is external (AusTenancy.ai). Do not place Agent code here.

## Layout

```text
src/
  bootstrap/        # Nest HTTP app factory (shared by main.ts and lambda.ts)
  modules/          # Domain modules (conversations, messages)
    conversation/   #   /v1/conversations CRUD + cursor pagination
    message/        #   /v1/conversations/:id/messages + queued jobs
  common/
    auth/           #   JWT guard, SupabaseAuthService, @Public(), @CurrentUser()
      auth.module.ts
      auth.controller.ts       # GET /auth/me
      jwt.guard.ts             # Global Bearer token enforcement
      supabase-auth.service.ts # JWKS + /auth/v1/user fallback
    correlation/     #   X-Request-Id middleware, AsyncLocalStorage context
    dto/             #   Shared DTOs (pagination bounds)
    pagination/      #   Strict opaque cursor codec and page response envelope
    logging/         #   Structured response-finish request logging middleware
    quota/           #   Per-user quota guard, service, config
  database/         # Prisma service (lazy connect), database config
  integrations/     # External adapters (Agent Runtime client, Step 16+)
  main.ts           # Local HTTP entry point (port 3001)
  lambda.ts         # Future Lambda handler stub
prisma/             # Prisma schema (mirrors supabase/migrations/)
  schema.prisma
test/
    auth/             # Auth unit + integration tests
    correlation/      # X-Request-Id unit tests
    quota/            # Quota config, guard, HTTP, integration tests
    health.controller.spec.ts
    migration.spec.ts
```

## Lambda Deploy Boundary

`src/bootstrap/` creates the Nest app. `main.ts` starts HTTP locally.
`lambda.ts` is a thin adapter that reuses `bootstrap/` to delegate API Gateway
events to Nest. It must not contain business logic, auth rules, or database
operations.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS (Express platform) |
| Database Client | Prisma (client generation only; schema managed by Supabase SQL migrations) |
| Schema Authority | Supabase SQL migrations in `supabase/migrations/` |
| Language | TypeScript 5.x, Node 22 |
| Test | Jest + @nestjs/testing |
| Lint/Format | ESLint 9 + Prettier |

## Data Controls (Step 14c)

| Control | Default | Description |
|---|---|---|
| Request quotas | 20/min, 200/day per user | Per-user atomic PostgreSQL quota counters with advisory locks; 429 + Retry-After on denial |
| Correlation ID | `X-Request-Id` header | Valid client UUIDs preserved; missing/invalid regenerated; propagated on all responses including errors |
| Body size | 16 KiB max | JSON and URL-encoded; 413 on oversized bodies |
| Request timeout | 30 seconds | Node `requestTimeout`; streaming/Agent endpoints will need explicit overrides |
| Validation | Global `ValidationPipe` | whitelist, forbidNonWhitelisted, transform, stopAtFirstError |
| Quota table | `request_quota_counters` | RLS enabled, no browser access; SECURITY INVOKER function; stale cleanup inside function call |

## CRUD API (Step 15)

All business endpoints require a Supabase access token and use the `/v1` prefix:

- `GET` / `POST` `/v1/conversations`
- `GET` / `PATCH` / `DELETE` `/v1/conversations/:conversationId`
- `GET` / `POST` `/v1/conversations/:conversationId/messages`

Message submission requires a UUID `Idempotency-Key`; it atomically creates a
user message and a `queued` agent job. The API never invokes the Agent Runtime
in this step. Login, OAuth, logout, refresh, and password recovery remain
Supabase Auth responsibilities, not NestJS routes.

See [`docs/api/application-api.md`](../../docs/api/application-api.md) for the
complete request, response, pagination, and error contracts.

## Getting Started

```bash
# From repository root
cp apps/api/.env.example apps/api/.env
npm ci
npx -w @victenancy/api prisma generate
npm run dev -w @victenancy/api     # http://localhost:3001/health

# Tests
npm run test -w @victenancy/api    # Jest (unit + HTTP tests)
npm run test:integration -w @victenancy/api  # Auth + migration + quota integration tests
npm run lint -w @victenancy/api    # ESLint
```

## Cloud Database URLs

In managed Supabase environments, two database URLs are used:

| Variable | Purpose | Cloud format |
|---|---|---|
| `DATABASE_URL` | Runtime API connections (Supavisor) | `postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_DATABASE_URL` | Migrations, admin, integration tests | `postgresql://postgres.PROJECT_REF:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres` |

All values above are `${PLACEHOLDER}`. They are never committed. Step 14d GitHub
Environment configuration stores only the migration-scoped Supabase access token
and database password; runtime connection strings are injected from AWS Secrets
Manager when the API is deployed in Step 15a.

## CI Migration Promotion

Schema changes are promoted exclusively through CI:

- **PR validation** (`.github/workflows/validate.yml`): `supabase db lint` →
  `supabase db reset` → Prisma generate → lint → build → unit + integration tests
- **Staging** (`.github/workflows/deploy-staging.yml`): auto-promotes on merge
  to main; `supabase db push` + fail-closed migration history verification + JWKS smoke
- **Production** (`.github/workflows/deploy-production.yml`): manual dispatch
  from main; verifies same-SHA staging deployment → production approval gate →
  `supabase db push` + verification

See [`docs/operations/managed-supabase.md`](../../docs/operations/managed-supabase.md)
for environment identities, connection modes, and access policies.

Never use the Supabase Dashboard SQL Editor, Table Editor, or `supabase db push`
from a local machine for managed environments under normal operations.
