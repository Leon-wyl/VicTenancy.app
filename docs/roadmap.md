# Roadmap

Full-stack chat application delivery plan. Phase A–D is complete in the Agent
Runtime repository. Phase E begins here.

| Step | Status | What |
| ---- | ------ | ---- |
| 14a  | Done | **Local Stack and Database** — Docker Compose Qdrant + API + Web, Supabase SQL 5-table migration, Prisma client generation |
| 14b  | Done | **Auth and RLS** — Supabase Auth email/password + Google OAuth, JWT verification via JWKS, Row Level Security policies |
| 14c  | Done | **Backend Data Controls** — Supavisor-ready connections, correlation IDs, quota counters, bounded requests |
| 14d  | Done | **Managed Supabase Environments and Database Delivery** — Separate staging and production Supabase Cloud projects. CI-driven migration promotion via GitHub Actions (validate, deploy-staging, deploy-production). JWKS smoke verification. Backup/restore runbook with Free-plan limitations documented. |
| 15   | Done | **CRUD API** — Versioned conversation/message APIs, cursor pagination, title updates, JWT ownership checks, idempotent queued-job creation, and application-level quotas. API Gateway deployment and throttling are deferred to Step 15a. |
| 15a  | []() | **API Lambda and Gateway Deployment** — Implement `apps/api/src/lambda.ts` as a thin adapter reusing `src/bootstrap/`. Build an immutable ECR image, deploy Lambda + HTTP API Gateway + staging alias. Inject configuration via Secrets Manager. Use Supavisor transaction-mode pooler at runtime; migrations and admin operations use direct connection. Provide health check, structured logs, alarms, and a deployment smoke test. |
| 16   | []() | **Async Agent Orchestration** — Idempotent agent jobs, server-to-server Agent Runtime invocation, retries, DLQ, state transitions |
| 17   | []() | **Frontend Auth and Shell** — Protected App Router routes, Supabase session, Tailwind + shadcn/ui, sidebar shell |
| 18   | []() | **Chat UI and Realtime** — Streaming responses, citation badges, conversation history, search, rename, delete |
| 18a  | []() | **File Upload and Contract Analysis** — Supabase Storage direct uploads, PDF extraction, dual-source citations |
| 19   | []() | **CI/CD, E2E and Release Governance** — GitHub Actions pipelines for all workspaces (lint, test, build). Playwright E2E coverage for auth, CRUD, Agent orchestration, Realtime, citations, and auth failures. Staging→production promotion with manual approval gates, rollback procedures, and release checklists. |
| 20   | []() | **Frontend AWS Deployment** — OpenNext/SST compatibility spike, CloudFront + S3 + Lambda@Edge |
| 21   | []() | **Polish, Advanced Security and Observability** — Accessibility, dark mode, Sentry, CloudWatch dashboards |

## Deferred Decisions

- Agent invocation is server-to-server only, deferred to Step 16.
- Supabase Cloud staging and production projects delivered in Step 14d via CI-driven migration promotion.
- E2E tests begin in Step 19.
- AWS IaC for frontend deployment is deferred to Step 20.
- API Lambda deployment is delivered in Step 15a; infrastructure IaC is owned by that step.
