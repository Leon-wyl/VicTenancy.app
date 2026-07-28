# Phase E Boundaries

## Runtime and CRUD Separation

The Agent Runtime (`AusTenancy.ai`) is an external FastAPI/Mangum service deployed
on AWS Lambda behind API Gateway. It owns the LangGraph agent, RAG retrieval, and
Bedrock integration. It lives in a separate repository.

`services/crud-api/` is the NestJS service for user-scoped application data:
conversations, messages, agent jobs, citations, and related ownership checks.
CRUD endpoints create durable job records and do not synchronously call
retrieval or the Agent Runtime.

Do not place Agent code (LangGraph, FastAPI, RAG, Bedrock, Qdrant seed data,
Terraform) in this repository. The Agent Runtime API contract is documented at
[`docs/integrations/agent-runtime.md`](../docs/integrations/agent-runtime.md).

## Client and Credential Boundary

The browser application in `apps/web/` may use Supabase Auth and Realtime with
browser-safe `NEXT_PUBLIC_*` configuration. Business-data writes go through the
CRUD API. Browser code must not receive AWS IAM credentials, database
credentials, or a Supabase service-role key, and must not directly invoke the
AWS-IAM Agent Runtime route.

Service-role credentials are server-only. User-scoped operations must use the
authenticated user identity and must not rely on a browser-supplied owner ID.

## Infrastructure Boundary

`compose.yaml` is the local development orchestrator for Qdrant, CRUD API, and
the web application. It does not manage cloud infrastructure.

`supabase/` contains non-sensitive Supabase CLI configuration and SQL migrations
that are the schema authority. Supabase cloud project provisioning is deferred
until the local schema and migration path are validated.

## Cross-Repository Contract

Agent invocation remains deferred to Step 16. When implemented, the invocation
must be server-to-server from trusted application infrastructure. The Agent
Runtime API contract is versioned and owned by the AusTenancy.ai repository.
