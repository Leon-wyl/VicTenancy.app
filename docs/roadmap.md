# Roadmap

Full-stack chat application delivery plan. Phase A–D is complete in the Agent
Runtime repository. Phase E begins here.

| Step | Status | What |
| ---- | ------ | ---- |
| 14a  | Done | **Local Stack and Database** — Docker Compose Qdrant + API + Web, Supabase SQL 5-table migration, Prisma client generation |
| 14b  | []() | **Auth and RLS** — Supabase Auth email/password + Google OAuth, JWT verification via JWKS, Row Level Security policies |
| 14c  | []() | **Backend Data Controls** — Supavisor connections, correlation IDs, quota counters, bounded requests |
| 15   | []() | **CRUD API** — Conversation/message APIs, cursor pagination, title updates, ownership checks, JWT 401/403, API Gateway throttling |
| 16   | []() | **Async Agent Orchestration** — Idempotent agent jobs, server-to-server Agent Runtime invocation, retries, DLQ, state transitions |
| 17   | []() | **Frontend Auth and Shell** — Protected App Router routes, Supabase session, Tailwind + shadcn/ui, sidebar shell |
| 18   | []() | **Chat UI and Realtime** — Streaming responses, citation badges, conversation history, search, rename, delete |
| 18a  | []() | **File Upload and Contract Analysis** — Supabase Storage direct uploads, PDF extraction, dual-source citations |
| 19   | []() | **Full CI/CD and E2E Gate** — GitHub Actions, Playwright E2E, Immutable ECR publication, Lambda aliases |
| 20   | []() | **Frontend AWS Deployment** — OpenNext/SST compatibility spike, CloudFront + S3 + Lambda@Edge |
| 21   | []() | **Polish, Advanced Security and Observability** — Accessibility, dark mode, Sentry, CloudWatch dashboards |

## Deferred Decisions

- Agent invocation is server-to-server only, deferred to Step 16.
- Supabase Cloud project provisioning waits until local schema validation passes.
- E2E tests begin in Step 19.
- AWS IaC for frontend deployment is deferred to Step 20.
