# VicTenancy.app

Victorian residential tenancies full-stack chat application. Provides an authenticated web experience for tenancy law compliance queries powered by an external LangGraph/RAG Agent Runtime.

## Governance

This agent must follow `CONTRIBUTING.md` for all branching, commit, linting, and PR conventions. When relevant to the task, consult documents in `docs/` for boundaries, architecture, and integration guidance.

## Tech Stack

| Layer | Technology |
|---|---|
| Web Framework | Next.js 15 App Router + React 19 |
| Styling | Tailwind CSS + shadcn/ui — planned (Step 17) |
| API Framework | NestJS (Express platform) + TypeScript 5.x |
| Database Client | Prisma (client generation only) |
| Schema Authority | Supabase SQL migrations (`supabase/migrations/`) |
| Database | Supabase PostgreSQL (local dev + managed Cloud) |
| Auth | Supabase Auth — Step 14b complete |
| Data Controls | Correlation IDs, quota counters, bounded requests — Step 14c complete |
| Realtime | Supabase Realtime — planned (Step 18) |
| Vector Database | Qdrant (local dev only) |
| Agent Runtime | AusTenancy.ai (external; integration deferred to Step 16) |
| Deployment | OpenNext -> CloudFront + Lambda@Edge + S3 — planned (Step 20) |
| E2E Testing | Playwright — planned (Step 19) |
| Managed Supabase | Supabase Cloud staging + production, CI-driven migration promotion |
| Language | TypeScript 5.x, Node 22 |
| Lint/Format | ESLint 9 + Prettier |
| Workspace | npm workspaces (`apps/*`) |
| Infrastructure (local) | Docker Compose v2 |
| Infrastructure (cloud) | Supabase + AWS — planned |

## Setup

### Local Development

```bash
# Prerequisites: Node 22, npm, Docker, Supabase CLI
git clone https://github.com/Leon-wyl/VicTenancy.app.git
cd VicTenancy.app

# Copy environment examples
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local

# Install all workspace dependencies
npm ci

# Start Supabase local (initializes PostgreSQL, Auth, Realtime, Studio)
supabase start

# Validate schema migration (includes RLS and auth trigger)
supabase db reset

# Fill in SUPABASE_PUBLISHABLE_KEY in apps/api/.env from `supabase status`
# Fill in NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local from `supabase status`

# Start the full local stack
docker compose up --build
```

### Cloud (Staging and Production)

Managed Supabase Cloud projects are provisioned in Step 14d. Schema changes are
promoted exclusively through CI workflows:

1. **PR validation** (`.github/workflows/validate.yml`): runs `supabase db lint`,
   `supabase db reset`, lint, build, and tests on every PR affecting schema or API code.
2. **Staging promotion** (`.github/workflows/deploy-staging.yml`): automatically
   pushes committed migrations to the staging Supabase project on merge to main.
3. **Production promotion** (`.github/workflows/deploy-production.yml`): manually
   triggered from main, verifies same-SHA staging deployment success, then requires
   a reviewer approval gate before pushing to production.

See [`docs/operations/managed-supabase.md`](docs/operations/managed-supabase.md) for
environment identities, connection modes, and access policies.

**Service endpoints after startup:**

| Service | URL | Health check |
|---|---|---|
| Web | http://localhost:3000 | Homepage renders |
| API | http://localhost:3001/health | `{ "status": "ok" }` |
| Qdrant | http://localhost:6333/healthz | 200 OK |
| Supabase Studio | http://localhost:54323 | GUI accessible |
| Supabase API | http://127.0.0.1:54321 | — |
| Supabase PostgreSQL | localhost:54322 | — |

## Run

```bash
# Workspace commands (from root)
npm run dev -w @victenancy/api    # API on :3001
npm run dev -w @victenancy/web    # Web on :3000
npm run test -w @victenancy/api   # Jest unit tests (no Supabase needed)
npm run test:integration -w @victenancy/api  # Auth integration tests (needs Supabase)
npm run lint                       # All workspaces
npm run build                      # All workspaces

# Schema verification (before any Supabase Cloud provisioning)
supabase db reset
```

## Architecture

```
Browser (localhost:3000)
  |  Auth reads -> Supabase Auth (localhost:54321)
  |  Realtime -> Supabase Realtime
  |  CRUD writes -> NestJS API (localhost:3001)
  |
NestJS API (:3001)
  |  Reads/Writes -> Supabase PostgreSQL (host.docker.internal:54322)
  |  Sync read -> Qdrant (:6333, local dev only)
  |
Supabase (local CLI)
  |  PostgreSQL :54322
  |  Auth :54321
  |  Studio :54323
  |
Agent Runtime (external, Step 16)
  |  Deployed: AusTenancy.ai Lambda + API Gateway
  |  Invoked server-to-server from API worker
```

## Critical Rules

1. **Schema authority** — Supabase SQL migrations are the DDL authority. Prisma is client-generation only. Do not use `prisma migrate` or `prisma db push`.
2. **No browser AWS access** — browser code must not receive AWS IAM credentials or call the Agent Runtime AWS-IAM route directly.
3. **No browser database access** — browser code must not receive database credentials or a Supabase service-role key.
4. **Service-role is server-only** — `SUPABASE_SERVICE_ROLE_KEY` is for the API only, never the browser.
5. **CRUD creates jobs, not Agent** — CRUD endpoints create `agent_jobs` records. Agent invocation is deferred to Step 16 and must be server-to-server.
6. **CRUD API** — Conversation and message endpoints live under `/v1` prefix. Idempotent message creation uses `Idempotency-Key` header. All queries are ownership-scoped via `ownerUserId`, enforced with `@CurrentUser().sub`.
7. **No Agent Runtime code** — do not copy Agent source (LangGraph, FastAPI, RAG, Bedrock, Qdrant seed data) into this repository.
8. **Local Supabase first** — Supabase Cloud staging and production projects are provisioned in Step 14d after local schema validation passes.
9. **Cloud schema promotion is CI-only** — managed Supabase schema changes go exclusively through CI workflows (`validate.yml` → `deploy-staging.yml` → `deploy-production.yml`). Never use Dashboard SQL Editor, Table Editor, or `supabase db push` from a local machine for managed environments under normal operations.
10. **Never echo secrets** — `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and all credentials must never be printed, serialized, or uploaded in CI logs, workflow YAML, or shell commands. Use GitHub Environment Secrets exclusively, referenced as `${{ secrets.SECRET_NAME }}` only in CI steps.
11. **Production requires staging verification** — the production database migration workflow must verify a successful staging deployment for the same commit SHA before entering the production Environment approval gate.
12. **No service-role key in committed files** — service-role credentials are for API runtime only and must never appear in repository files, workflow logs, or browser code.
13. **Lambda boundary** — `apps/api/src/lambda.ts` is a thin adapter that reuses `src/bootstrap/`. It must not contain business logic, auth rules, or database operations.
14. **JWT ownership** — API authorization always derives the authenticated user from verified JWT claims (`principal.sub`). Never from request body, query parameter, or browser-supplied identifier.
15. **RLS + JWT defense in depth** — RLS protects direct Supabase/PostgREST access. The JWT guard protects the API path. Both enforce ownership via `auth.uid()` or verified `sub`.
16. **Database connection** — Use `DATABASE_URL` for runtime (future Supavisor transaction-mode pooling). Use `DIRECT_DATABASE_URL` for migrations, admin, and integration tests. API uses lazy Prisma connect; `GET /health` does not depend on database availability.
17. **Correlation IDs** — Every HTTP response carries an `X-Request-Id` header. Valid client-supplied UUIDs are preserved; non-UUID or missing headers are regenerated. All log entries include the request ID.
18. **Request quotas** — Authenticated routes consume quota atomically per user (20/minute, 200/day defaults). Denied requests return HTTP 429 with `Retry-After` header. Quota counters are stored in `request_quota_counters` with RLS enabled and no browser access.
19. **Request bounds** — JSON/URL-encoded body limit 16 KiB; oversized bodies return 413. Global `ValidationPipe` enforces whitelist, forbidNonWhitelisted, and transform. HTTP request timeout is 30 seconds (streaming/Agent endpoints will require explicit overrides in future steps).

## Project Structure

```
apps/
  api/                         # NestJS API service
    src/
      bootstrap/               #   Nest HTTP app factory (shared by main.ts & lambda.ts)
      modules/                 #   Domain modules (conversations, messages)
      common/
        auth/                  #   JWT guard, SupabaseAuthService, @Public(), @CurrentUser()
        correlation/           #   X-Request-Id middleware, AsyncLocalStorage context
        dto/                   #   Shared DTOs (pagination)
        pagination/            #   Cursor codec, PageResponse DTO
        logging/               #   Structured response-finish request logging middleware
        quota/                 #   Per-user quota guard, service, config
      database/                #   Prisma service, lazy connect
      integrations/            #   External adapters (Agent Runtime client, Step 16+)
      main.ts                  #   Local HTTP entry point (port 3001)
      lambda.ts                #   Future Lambda handler stub
    prisma/                    #   Prisma schema (mirrors supabase/migrations/)
    test/
      auth/                    #   Auth unit + integration tests
      health.controller.spec.ts
      migration.spec.ts
    Dockerfile                 #   Node 22 development image
    .env.example               #   Server-side DATABASE_URL, DIRECT_DATABASE_URL, SUPABASE vars
    .env                     #   Local server-only environment (not committed)
    package.json               #   @victenancy/api
  web/                         # Next.js App Router application
    app/
      auth/
        callback/route.ts      #   OAuth code exchange (Step 14b)
      layout.tsx
      page.tsx
    components/                #   Reusable UI (Step 17+)
    features/                  #   Domain-organized frontend features
    lib/
      supabase/
        client.ts              #   Browser client factory
        server.ts              #   Server client factory
    public/                    #   Static assets
    tests/                     #   Web unit/component tests
    middleware.ts               #   Session refresh middleware (Step 14b)
    Dockerfile                 #   Node 22 development image
    .env.local.example         #   Browser-safe NEXT_PUBLIC_* template
    package.json               #   @victenancy/web
supabase/                      # Supabase CLI configuration and SQL migrations
  config.toml                  #   Non-sensitive project configuration
  migrations/                  #   DDL authority SQL files
docs/
  architecture/
    application-boundaries.md  #   Service boundaries and cross-repo contract
  development/
    local-environment.md       #   Local stack contract and startup order
    local-auth-setup.md        #   Auth environment configuration guide
  integrations/
    agent-runtime.md           #   Agent Runtime consumer guide
  api/
    application-api.md         #   Versioned application CRUD contract
  roadmap.md                   #   Full delivery plan (Steps 14a-21)
scripts/                       # Local verification, DB, and release helpers
tests/
  e2e/                         # Playwright (Step 19)
.env.example                   # Google OAuth placeholder for supabase/config.toml
compose.yaml                   # Local Qdrant + API + Web stack
package.json                   # Root npm workspace
```

## Roadmap

See [docs/roadmap.md](docs/roadmap.md) for the full delivery plan.

## API Contracts

- **Agent Runtime:** [docs/integrations/agent-runtime.md](docs/integrations/agent-runtime.md)
- **Application API:** [docs/api/application-api.md](docs/api/application-api.md)
- **Application Boundaries:** [docs/architecture/application-boundaries.md](docs/architecture/application-boundaries.md)
- **Local Environment:** [docs/development/local-environment.md](docs/development/local-environment.md)
