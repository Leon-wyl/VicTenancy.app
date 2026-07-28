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
| Database | Supabase PostgreSQL (local dev) |
| Auth | Supabase Auth — planned (Step 14b) |
| Realtime | Supabase Realtime — planned (Step 18) |
| Vector Database | Qdrant (local dev only) |
| Agent Runtime | AusTenancy.ai (external; integration deferred to Step 16) |
| Deployment | OpenNext -> CloudFront + Lambda@Edge + S3 — planned (Step 20) |
| E2E Testing | Playwright — planned (Step 19) |
| CI/CD | GitHub Actions |
| Language | TypeScript 5.x, Node 22 |
| Lint/Format | ESLint 9 + Prettier |
| Workspace | npm workspaces (`apps/*`) |
| Infrastructure (local) | Docker Compose v2 |
| Infrastructure (cloud) | Supabase + AWS — planned |

## Setup

```bash
# Prerequisites: Node 22, npm, Docker, Supabase CLI
git clone https://github.com/Leon-wyl/VicTenancy.app.git
cd VicTenancy.app

# Copy environment examples
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local

# Install all workspace dependencies
npm ci

# Start Supabase local (initializes PostgreSQL, Auth, Realtime, Studio)
supabase start

# Validate schema migration
supabase db reset

# Start the full local stack
docker compose up --build
```

**Service endpoints after startup:**

| Service | URL | Health check |
|---|---|---|
| Web | http://localhost:3000 | Homepage renders |
| API | http://localhost:3001/health | `{ "status": "ok" }` |
| Qdrant | http://localhost:6333/healthz | 200 OK |
| Supabase Studio | http://localhost:54323 | GUI accessible |
| Supabase API | http://localhost:54321 | — |
| Supabase PostgreSQL | localhost:54322 | — |

## Run

```bash
# Workspace commands (from root)
npm run dev -w @victenancy/api    # API on :3001
npm run dev -w @victenancy/web    # Web on :3000
npm run test -w @victenancy/api   # Jest (health + migration)
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
6. **No Agent Runtime code** — do not copy Agent source (LangGraph, FastAPI, RAG, Bedrock, Qdrant seed data) into this repository.
7. **Local Supabase first** — Supabase Cloud project is provisioned only after local schema and migration path are validated.
8. **Lambda boundary** — `apps/api/src/lambda.ts` is a thin adapter that reuses `src/bootstrap/`. It must not contain business logic, auth rules, or database operations.

## Project Structure

```
apps/
  api/                         # NestJS API service
    src/
      bootstrap/               #   Nest HTTP app factory (shared by main.ts & lambda.ts)
      modules/                 #   Domain modules (health, conversations, messages, jobs)
      database/                #   Prisma service, database config
      common/                  #   Guards, filters, DTO infrastructure, logging
      integrations/            #   External adapters (Agent Runtime client, Step 16+)
      main.ts                  #   Local HTTP entry point (port 3001)
      lambda.ts                #   Future Lambda handler stub
    prisma/                    #   Prisma schema (mirrors supabase/migrations/)
    test/                      #   Jest unit and integration tests
    Dockerfile                 #   Node 22 development image
    .env.example               #   Server-side DATABASE_URL, QDRANT_URL
    package.json               #   @victenancy/api
  web/                         # Next.js App Router application
    app/                       #   App Router routes
    components/                #   Reusable UI (Step 17+)
    features/                  #   Domain-organized frontend features
    lib/                       #   Browser-safe clients and utilities
    public/                    #   Static assets
    tests/                     #   Web unit/component tests
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
  integrations/
    agent-runtime.md           #   Agent Runtime consumer guide
  roadmap.md                   #   Full delivery plan (Steps 14a-21)
scripts/                       # Local verification, DB, and release helpers
tests/
  e2e/                         # Playwright (Step 19)
compose.yaml                   # Local Qdrant + API + Web stack
package.json                   # Root npm workspace
```

## Roadmap

See [docs/roadmap.md](docs/roadmap.md) for the full delivery plan.

## API Contracts

- **Agent Runtime:** [docs/integrations/agent-runtime.md](docs/integrations/agent-runtime.md)
- **Application Boundaries:** [docs/architecture/application-boundaries.md](docs/architecture/application-boundaries.md)
- **Local Environment:** [docs/development/local-environment.md](docs/development/local-environment.md)
