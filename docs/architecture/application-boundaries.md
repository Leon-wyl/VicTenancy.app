# Application Boundaries

## Runtime and CRUD Separation

The Agent Runtime (`AusTenancy.ai`) is an external FastAPI/Mangum service deployed
on AWS Lambda behind API Gateway. It owns the LangGraph agent, RAG retrieval, and
Bedrock integration. It lives in a separate repository.

`apps/api/` is the NestJS service for user-scoped application data:
conversations, messages, agent jobs, citations, and related ownership checks.
CRUD endpoints create durable job records and do not synchronously call
retrieval or the Agent Runtime.

Do not place Agent code (LangGraph, FastAPI, RAG, Bedrock, Qdrant seed data,
Terraform) in this repository. The Agent Runtime API contract is documented at
[`docs/integrations/agent-runtime.md`](../integrations/agent-runtime.md).

## Lambda Deploy Boundary

`apps/api/src/bootstrap/` creates the Nest HTTP application and is shared
between the local `main.ts` listener and the future `lambda.ts` Lambda handler.

`apps/api/src/lambda.ts` is a future API Gateway/Lambda adapter. It must reuse
the bootstrap factory and must not contain business logic, auth rules, or
database operations.

## Client and Credential Boundary

The browser application in `apps/web/` may use Supabase Auth and Realtime with
browser-safe `NEXT_PUBLIC_*` configuration. Business-data writes go through the
API. Browser code must not receive AWS IAM credentials, database credentials, or
a Supabase service-role key, and must not directly invoke the AWS-IAM Agent
Runtime route.

Service-role credentials are server-only. User-scoped operations must use the
authenticated user identity and must not rely on a browser-supplied owner ID.

## Schema Boundary

Supabase SQL migrations (`supabase/migrations/`) are the sole DDL authority.
Prisma is used only for client generation (`prisma generate`). Do not use
`prisma migrate` or `prisma db push`.

## Infrastructure Boundary

`compose.yaml` is the local development orchestrator for Qdrant, API, and the
web application. It does not manage cloud infrastructure.

`supabase/` contains non-sensitive Supabase CLI configuration. Supabase Cloud
project provisioning is deferred until the local schema and migration path are
validated.

Future cloud IaC belongs in `infra/aws/`. This repository does not contain
Terraform, CDK, SAM, or Serverless Framework configurations.

## Cross-Repository Contract

Agent invocation remains deferred to Step 16. When implemented, the invocation
must be server-to-server from trusted application infrastructure. The Agent
Runtime API contract is versioned and owned by the AusTenancy.ai repository.
