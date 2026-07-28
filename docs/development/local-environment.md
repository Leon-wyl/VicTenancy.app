# Local Development Environment

Step 14a created the local stack: compose.yaml, supabase/, apps/api/, and apps/web/.
The Agent Runtime lives in a separate repository (`AusTenancy.ai`) and is not
required for local application development.

## Entry Points

Use the repository root as the working directory:

```bash
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

1. `cp apps/api/.env.example apps/api/.env`
2. `cp apps/web/.env.local.example apps/web/.env.local`
3. `npm ci` (from root)
4. `supabase start`
5. `supabase db reset` (validates schema)
6. `docker compose up --build`

## Individual Service Commands

```bash
npm run dev -w @victenancy/api    # API on :3001
npm run dev -w @victenancy/web    # Web on :3000
npm run test -w @victenancy/api   # Jest (health + migration)
npm run lint -w @victenancy/api   # ESLint
npm run build -w @victenancy/web  # Next.js production build
```
