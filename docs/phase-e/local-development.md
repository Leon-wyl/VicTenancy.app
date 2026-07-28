# Phase E Local Development Contract

Step 14a created the local stack: compose.yaml, supabase/, services/crud-api/,
and apps/web/. The Agent Runtime lives in a separate repository
(`AusTenancy.ai`) and is not required for local application development.

## Entry Points

Use the repository root as the working directory:

```bash
# Start the local multi-service stack
docker compose up --build

# Initialize or run the local Supabase stack
supabase start
```

`compose.yaml` is the root entrypoint for the local Qdrant, CRUD API, and web
application services. `supabase/` holds the committed, non-sensitive local
configuration and SQL migrations.

## Service Responsibilities

| Service | Responsibility | Local health contract |
|---|---|---|
| Supabase | Auth, PostgreSQL, Realtime, and RLS | Supabase CLI reports all local services healthy |
| Qdrant | Development retrieval data only | HTTP `/healthz` responds 200 |
| CRUD API | User-scoped data APIs and job creation | `GET /health` → `{ "status": "ok" }` |
| Web | Authenticated browser application | Next.js development server on localhost:3000 |

The Agent Runtime (AusTenancy.ai) is external. Local agent invocation is deferred
to Step 16 with a separate setup documented in
[`docs/integrations/agent-runtime.md`](../docs/integrations/agent-runtime.md).

## Configuration Ownership

| Configuration class | Owner | Exposure rule |
|---|---|---|
| Browser Supabase URL and anon key | `apps/web/.env.local` | Must use `NEXT_PUBLIC_*`; public by design |
| CRUD API database, JWKS, and service configuration | `services/crud-api/.env` | Server-only; never commit |
| Local stack defaults | `compose.yaml` and `supabase/config.toml` | Non-sensitive values only |

## Tech Stack

| Layer | Technology |
|---|---|
| CRUD Framework | NestJS (Express platform) |
| Database Client | Prisma (client generation only) |
| Schema Authority | Supabase SQL migrations (`supabase/migrations/`) |
| Language (CRUD) | TypeScript 5.x, Node 22 |
| Web | Next.js 15, React 19 |
| Compose | docker compose v2 |

## Startup Order (Step 14a)

1. `cp services/crud-api/.env.example services/crud-api/.env`
2. `cp apps/web/.env.local.example apps/web/.env.local`
3. `cd services/crud-api && npm ci`
4. `cd apps/web && npm ci`
5. `supabase start`
6. `supabase db reset` (validates schema)
7. `docker compose up --build`
