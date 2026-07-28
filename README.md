# VicTenancy.app

Victorian residential tenancies full-stack chat application powered by the
AusTenancy.ai Agent Runtime.

## Value Proposition

- **Jurisdictional precision** — metadata-filtered legal answers grounded in
  Victorian tenancy legislation.
- **Production-grade retrieval** — hybrid search (dense vector + BM25) via Qdrant.
- **Strict citation grounding** — every claim verified with `[VIC RTA 1997 Sec X]`
  format enforcement.
- **Industrial-grade chat** — Next.js frontend with Supabase realtime streaming,
  CRUD NestJS backend, Supabase Auth.
- **Enterprise compliance ready** — designed for Lambda + CloudFront deployment,
  AWS Bedrock-powered Agent Runtime.

## Technical Stack

| Layer | Technology |
|---|---|
| Web | Next.js 15 App Router + React 19 |
| Styling | Tailwind CSS + shadcn/ui — planned |
| Backend API | NestJS (Express) + TypeScript 5.x |
| Database Client | Prisma (client generation) |
| Schema | Supabase SQL migrations |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth — planned |
| Realtime | Supabase Realtime — planned |
| Vector DB | Qdrant (local dev) |
| Agent Runtime | AusTenancy.ai (external) |
| Infrastructure (local) | Docker Compose v2 |
| Frontend Deploy | OpenNext -> CloudFront + Lambda@Edge + S3 — planned |
| E2E Testing | Playwright — planned |
| CI/CD | GitHub Actions |
| Lint/Format | ESLint + Prettier |

## Architecture

```
Browser (localhost:3000)
  |  Auth reads -> Supabase Auth (localhost:54321)
  |  Realtime -> Supabase Realtime
  |  CRUD writes -> NestJS CRUD API (localhost:3001)
  |
NestJS CRUD API (:3001)
  |  Reads/Writes -> Supabase PostgreSQL (host.docker.internal:54322)
  |  Sync read -> Qdrant (:6333)
  |
Agent Runtime (external, Step 16)
  |  Deployed: AusTenancy.ai Lambda + API Gateway
  |  Invoked server-to-server
```

## Getting Started

```bash
git clone https://github.com/Leon-wyl/VicTenancy.app.git
cd VicTenancy.app

cp services/crud-api/.env.example services/crud-api/.env
cp apps/web/.env.local.example apps/web/.env.local

cd services/crud-api && npm ci
cd ../../apps/web && npm ci
cd ..

supabase start
supabase db reset
docker compose up --build
```

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| CRUD API health | http://localhost:3001/health |
| Qdrant health | http://localhost:6333/healthz |
| Supabase Studio | http://localhost:54323 |

## Roadmap

| Step | Status | What |
| ---- | ------ | ---- |
| 14a  | Done | Local Stack and Database |
| 14b  | []() | Auth and RLS |
| 14c  | []() | Backend Data Controls |
| 15   | []() | CRUD API |
| 16   | []() | Async Agent Orchestration |
| 17   | []() | Frontend Auth and Shell |
| 18   | []() | Chat UI and Realtime |

## API Contracts

- [Agent Runtime Integration](docs/integrations/agent-runtime.md)
- [Phase E Boundaries](docs/phase-e/boundaries.md)
- [Local Development Contract](docs/phase-e/local-development.md)

## License

See [LICENSE](./LICENSE).
