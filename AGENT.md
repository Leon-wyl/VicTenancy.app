# VicTenancy.app

Victorian residential tenancies full-stack chat application. Provides an authenticated web experience for tenancy law compliance queries powered by an external LangGraph/RAG Agent Runtime.

## Governance

This agent must follow `CONTRIBUTING.md` for all branching, commit, linting, and PR conventions. When relevant to the task, consult documents in `docs/` for boundaries, architecture, and integration guidance.

## Tech Stack

| Layer | Technology |
|---|---|
| Web Framework | Next.js 15 App Router + React 19 |
| Styling | Tailwind CSS + shadcn/ui — planned (Step 17) |
| Backend Framework | NestJS (Express platform) + TypeScript 5.x |
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
| Infrastructure (local) | Docker Compose v2 |
| Infrastructure (cloud) | Supabase + AWS — planned |

## Setup

```bash
# Prerequisites: Node 22, npm, Docker, Supabase CLI
git clone https://github.com/Leon-wyl/VicTenancy.app.git
cd VicTenancy.app

# Copy environment examples
cp services/crud-api/.env.example services/crud-api/.env
cp apps/web/.env.local.example apps/web/.env.local

# Install dependencies
cd services/crud-api && npm ci
cd ../../apps/web && npm ci
cd ../..

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
| CRUD API | http://localhost:3001/health | `{ "status": "ok" }` |
| Qdrant | http://localhost:6333/healthz | 200 OK |
| Supabase Studio | http://localhost:54323 | GUI accessible |
| Supabase API | http://localhost:54321 | — |
| Supabase PostgreSQL | localhost:54322 | — |

## Run

```bash
# Individual services (after supabase start)
cd services/crud-api && npm run start:dev   # NestJS on :3001
cd apps/web && npm run dev                  # Next.js on :3000

# Tests
cd services/crud-api && npm test            # Jest (health + migration)
cd services/crud-api && npm run lint
cd apps/web && npm run lint
cd apps/web && npm run build                # Production build

# Schema verification (before any Supabase Cloud provisioning)
supabase db reset
cd services/crud-api && DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres npm test -- tests/migration.spec.ts
```

## Architecture

```
Browser (localhost:3000)
  |  Auth reads -> Supabase Auth (localhost:54321)
  |  Realtime -> Supabase Realtime
  |  CRUD writes -> NestJS CRUD API (localhost:3001)
  |
NestJS CRUD API (:3001)
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
  |  Invoked server-to-server from CRUD API worker
```

## Critical Rules

1. **Schema authority** — Supabase SQL migrations are the DDL authority. Prisma is client-generation only. Do not use `prisma migrate` or `prisma db push`.
2. **No browser AWS access** — browser code must not receive AWS IAM credentials or call the Agent Runtime AWS-IAM route directly.
3. **No browser database access** — browser code must not receive database credentials or a Supabase service-role key.
4. **Service-role is server-only** — `SUPABASE_SERVICE_ROLE_KEY` is for the CRUD API only, never the browser.
5. **CRUD creates jobs, doesn't invoke Agent** — CRUD endpoints create `agent_jobs` records. Agent invocation is deferred to Step 16 and must be server-to-server.
6. **No Agent Runtime code** — do not copy Agent source (LangGraph, FastAPI, RAG, Bedrock, Qdrant seed data) into this repository.
7. **Local Supabase first** — Supabase Cloud project is provisioned only after local schema and migration path are validated.

## Project Structure

```
apps/web/                     # Next.js 15 App Router application
  app/                        #   App Router routes
  public/                     #   Static assets
  Dockerfile                  #   Node 22 development image
  .env.local.example          #   Browser-safe NEXT_PUBLIC_* template
  package.json                #   Next.js + React + ESLint
services/crud-api/            # NestJS CRUD API service
  src/                        #   NestJS modules (health controller, future CRUD routes)
    main.ts                   #   Bootstrap (port 3001)
    app.module.ts
    health/                   #   GET /health -> { status: "ok" }
  prisma/                     #   Prisma schema (mirrors supabase/migrations/)
    schema.prisma
  tests/                      #   Jest unit and integration tests
  Dockerfile                  #   Node 22 development image
  .env.example                #   Server-side DATABASE_URL, QDRANT_URL
  package.json                #   NestJS + Prisma + Jest + ESLint
supabase/                     # Supabase CLI configuration and SQL migrations
  config.toml                 #   Non-sensitive project configuration
  migrations/                 #   DDL authority SQL files
compose.yaml                  # Local Qdrant + CRUD API + Web stack
docs/                         # Design docs and boundaries
  phase-e/                    #   Phase E documentation
  integrations/               #   External service integration guides
```

## Roadmap

| Step | Status | What |
| ---- | ------ | ---- |
| 14a  | Done | Local Stack and Database — NestJS CRUD, Next.js scaffold, Supabase 5-table schema |
| 14b  | []() | Auth and RLS — Supabase Auth, JWT verification, Row Level Security policies |
| 14c  | []() | Backend Data Controls — Supavisor connections, correlation IDs, quota counters |
| 15   | []() | CRUD API — conversation/message APIs, pagination, ownership checks, JWT 401/403 |
| 16   | []() | Async Agent Orchestration — idempotent jobs, Agent Runtime invocation, retries |
| 17   | []() | Frontend Auth and Shell — protected routes, sidebar, Tailwind + shadcn/ui |
| 18   | []() | Chat UI and Realtime — streaming, citations, conversation history |

## API Contracts

- **Agent Runtime:** [docs/integrations/agent-runtime.md](docs/integrations/agent-runtime.md)
- **Phase E Boundaries:** [docs/phase-e/boundaries.md](docs/phase-e/boundaries.md)
- **Local Dev Contract:** [docs/phase-e/local-development.md](docs/phase-e/local-development.md)
