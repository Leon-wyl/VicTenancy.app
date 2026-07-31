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
  NestJS API backend, Supabase Auth.
- **Enterprise compliance ready** — designed for Lambda + CloudFront deployment,
  AWS Bedrock-powered Agent Runtime.

## Technical Stack

| Layer | Technology |
|---|---|
| Web | Next.js 15 App Router + React 19 |
| Styling | Tailwind CSS + shadcn/ui — planned |
| API | NestJS (Express) + TypeScript 5.x |
| Database Client | Prisma (client generation) |
| Schema | Supabase SQL migrations |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth — Step 14b complete |
| Realtime | Supabase Realtime — planned |
| Vector DB | Qdrant (local dev) |
| Agent Runtime | AusTenancy.ai (external) |
| Infrastructure (local) | Docker Compose v2 |
| Workspace | npm workspaces (`apps/*`) |
| Frontend Deploy | OpenNext -> CloudFront + Lambda@Edge + S3 — planned |
| E2E Testing | Playwright — planned |
| CI/CD | GitHub Actions (validate, staging auto-promote, production manual approval) |
| Lint/Format | ESLint + Prettier |

## Application API

Step 15 provides authenticated, cursor-paginated conversation and message
endpoints under `/v1`. Submitting a user message creates a durable queued job
but does not invoke the external Agent Runtime until Step 16. Supabase Auth
continues to own signup, login, OAuth, logout, and session refresh.

See [Application API](docs/api/application-api.md) for the complete contract.

## Architecture

```
Browser (localhost:3000)
  |  Auth reads -> Supabase Auth
  |  Realtime -> Supabase Realtime
  |  CRUD writes -> NestJS API (localhost:3001)
  |
NestJS API (:3001)
  |  Reads/Writes -> Supabase PostgreSQL (local:54322, cloud:6543 Supavisor)
  |  Sync read -> Qdrant (:6333)
  |
Supabase (local CLI / managed Cloud)
  |  Local: PostgreSQL :54322, Auth :54321, Studio :54323
  |  Cloud: staging + production managed projects (CI promotion)
  |
Agent Runtime (external, Step 16)
  |  Deployed: AusTenancy.ai Lambda + API Gateway
  |  Invoked server-to-server
```

## Getting Started

```bash
git clone https://github.com/Leon-wyl/VicTenancy.app.git
cd VicTenancy.app

cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local

npm ci
supabase start
supabase db reset

# Fill SUPABASE_PUBLISHABLE_KEY in apps/api/.env from `supabase status`
# Fill NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local from `supabase status`

docker compose up --build
```

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API health | http://localhost:3001/health |
| Qdrant health | http://localhost:6333/healthz |
| Supabase Studio | http://localhost:54323 |

## Workspace Commands

```bash
npm run dev -w @victenancy/api    # API on :3001
npm run dev -w @victenancy/web    # Web on :3000
npm run test -w @victenancy/api   # Unit tests
npm run test:integration -w @victenancy/api  # Auth integration tests (needs Supabase)
npm run lint                       # ESLint all workspaces
npm run build                      # Build all workspaces
```

## Roadmap

See [docs/roadmap.md](docs/roadmap.md) for the full delivery plan (Steps 14a-21).

## CI/CD

### Database Schema

Schema changes are promoted exclusively through CI:

- **PR validation**: `npm ci` → `supabase start` → `db lint` → `db reset` → Prisma generate → lint → build → test
- **Staging**: auto-promotes on merge to main; `supabase db push` + migration history verification + JWKS smoke
- **Production**: manual dispatch from main; verifies staging deployment success → reviewer approval gate → `supabase db push` + verification

### API Deployment

The NestJS API is deployed as a Lambda container image behind API Gateway HTTP API v2:

- **Staging**: auto-deploys on push to main (when API or infra changes); OIDC → build → push ECR → Terraform apply → smoke test
- **Production**: manual dispatch from main; verifies staging API deploy succeeded → approval gate → deploy same ECR digest

See [`docs/operations/aws-api-deployment.md`](docs/operations/aws-api-deployment.md) for the full deployment guide.

See [`.github/workflows/`](.github/workflows/) for the full pipeline definitions.

## API Contracts

- [Agent Runtime Integration](docs/integrations/agent-runtime.md)
- [Application API](docs/api/application-api.md)
- [API Deployment](docs/operations/aws-api-deployment.md)
- [Application Boundaries](docs/architecture/application-boundaries.md)
- [Local Development Environment](docs/development/local-environment.md)

## License

See [LICENSE](./LICENSE).
