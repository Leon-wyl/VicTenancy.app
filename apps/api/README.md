# API Service

VicTenancy.app NestJS API service (`@victenancy/api`).
Implemented in Step 14a; business endpoints begin in Step 15.

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
  modules/          # Domain modules (health, conversations, messages, jobs)
    health/         #   GET /health → { "status": "ok" } (no database dependency)
  database/         # Prisma service, database configuration
  common/           # Guards, filters, DTO infrastructure, logging
  integrations/     # External adapters (Agent Runtime client, Step 16+)
  main.ts           # Local HTTP entry point (port 3001)
  lambda.ts         # Future Lambda handler stub
prisma/             # Prisma schema (mirrors supabase/migrations/)
  schema.prisma
test/               # Jest unit and integration tests
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

## Getting Started

```bash
# From repository root
cp apps/api/.env.example apps/api/.env
npm ci
npx -w @victenancy/api prisma generate
npm run dev -w @victenancy/api     # http://localhost:3001/health

# Tests
npm run test -w @victenancy/api    # Jest (health + migration)
npm run lint -w @victenancy/api    # ESLint
```
