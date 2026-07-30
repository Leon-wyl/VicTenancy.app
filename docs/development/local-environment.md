# Local Development Environment

Step 14a created the local stack: compose.yaml, supabase/, apps/api/, and apps/web/.
The Agent Runtime lives in a separate repository (`AusTenancy.ai`) and is not
required for local application development.

## Entry Points

Use the repository root as the working directory:

```bash
# 1. Configure auth environment (see docs/development/local-auth-setup.md)
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local

# 2. Fill in SUPABASE_PUBLISHABLE_KEY in apps/api/.env (from supabase status)
#    and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local

npm ci                       # Install all workspace dependencies
supabase start               # Start local Supabase (PostgreSQL, Auth, Realtime)
supabase db reset            # Validate schema migration
docker compose up --build    # Start Qdrant + API + Web
```

`compose.yaml` is the root entrypoint for the local Qdrant, API, and web
application services. `supabase/` holds the committed, non-sensitive local
configuration and SQL migrations.

## Service Responsibilities

| Service | Responsibility | Local health contract |
|---|---|---|
| Supabase | Auth, PostgreSQL, Realtime, RLS | Supabase CLI reports all local services healthy |
| Qdrant | Development retrieval data only | HTTP `/healthz` responds 200 |
| API | User-scoped data APIs and job creation | `GET :3001/health` → `{ "status": "ok" }` |
| Web | Authenticated browser application | Next.js dev server on `localhost:3000` |

The Agent Runtime (AusTenancy.ai) is external. Local agent invocation is
deferred to Step 16 with a separate setup documented in
[`docs/integrations/agent-runtime.md`](../integrations/agent-runtime.md).

## Configuration Ownership

| Configuration class | Owner | Exposure rule |
|---|---|---|
| Browser Supabase URL and anon key | `apps/web/.env.local` | Must use `NEXT_PUBLIC_*`; public by design |
| API database, JWKS, and service config | `apps/api/.env` | Server-only; never commit |
| Local stack defaults | `compose.yaml` and `supabase/config.toml` | Non-sensitive values only |

## Tech Stack

| Layer | Technology |
|---|---|
| API Framework | NestJS (Express platform) |
| Database Client | Prisma (client generation only) |
| Schema Authority | Supabase SQL migrations (`supabase/migrations/`) |
| Language | TypeScript 5.x, Node 22 |
| Web | Next.js 15, React 19 |
| Compose | docker compose v2 |

## Startup Order

1. `cp .env.example .env`
2. `cp apps/api/.env.example apps/api/.env`
3. `cp apps/web/.env.local.example apps/web/.env.local`
4. Fill in `SUPABASE_PUBLISHABLE_KEY` in `apps/api/.env` (from `supabase status`)
5. Fill in `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local`
6. `npm ci` (from root)
7. `supabase start`
8. `supabase db reset` (validates schema + runs RLS + data controls migration)
9. `docker compose up --build` (optional; can also run `npm run dev` for individual services)

## Database URLs

| Variable | Purpose | Local value | Cloud value |
|---|---|---|---|
| `DATABASE_URL` | Runtime API connections | `postgresql://postgres:postgres@localhost:54322/postgres` | `postgresql://postgres.PROJECT_REF:DB_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_DATABASE_URL` | Migrations, admin, integration tests | Same as DATABASE_URL locally | `postgresql://postgres.PROJECT_REF:DB_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres` |

In cloud, `DATABASE_URL` uses Supavisor transaction-mode pooling (`:6543?pgbouncer=true`) while `DIRECT_DATABASE_URL` uses the direct database endpoint (`:5432`). Integration tests prefer `DIRECT_DATABASE_URL` with fallback to `DATABASE_URL`.

Local development uses direct connections (`:54322`) for both variables since Supavisor is not available locally.

### Schema Validation

| Environment | Method |
|---|---|
| Local | `supabase db reset` (reset to committed migrations) |
| Cloud (staging/production) | CI `supabase db push` (`.github/workflows/deploy-staging.yml` / `deploy-production.yml`) |

Never use the Supabase Dashboard SQL Editor or Table Editor for schema changes. All DDL flows through `supabase/migrations/` → CI.

## Request Quotas

Authenticated API routes are limited by default:
- `REQUESTS_PER_MINUTE=20` (range 1–1000)
- `REQUESTS_PER_DAY=200` (range 1–10000)

Set these in `apps/api/.env`. Public `GET /health` is excluded from quotas.

## Individual Service Commands

```bash
npm run dev -w @victenancy/api    # API on :3001
npm run dev -w @victenancy/web    # Web on :3000
npm run test -w @victenancy/api   # Jest unit tests (no Supabase needed)
npm run test:integration -w @victenancy/api  # Auth integration tests (requires Supabase)
npm run lint -w @victenancy/api   # ESLint
npm run build -w @victenancy/web  # Next.js production build
```
