# Frontend Release Governance

Release topology and ownership for the frontend (`apps/web`, Next.js) across local,
staging, and production. This document describes the intended target state that
Step 20 configures. A Vercel project, Cloudflare DNS records, and a production
frontend deployment do not exist yet; nothing here should be read as current fact.

## Deployment Ownership

| System | Responsibility |
|---|---|
| GitHub Actions | CI checks, Supabase migrations, AWS Terraform/API deployment and promotion |
| AWS | API Gateway, Lambda API, ECR, orchestration workers, queues, runtime secrets |
| Vercel | Next.js application deployment for `apps/web` |
| Cloudflare | Domain registration and authoritative DNS |
| Supabase | Auth and database |

## Release Topology

- Feature PRs receive GitHub CI and, after Step 20 configures the Vercel project,
  Vercel Preview deployments.
- Vercel Preview URLs are not trusted API origins and must not be added to the API
  `CORS_ORIGINS` allow-list.
- `main` represents the staging candidate:
  - backend deploys to staging through the existing workflow;
  - frontend deployment to `staging.victenancy.com` is configured in Step 20.
- Production is an explicit human-approved promotion:
  - backend uses the existing production workflow and the previously validated
    image digest;
  - frontend production promotion to `victenancy.com` is configured in Step 20.

### Vercel production-branch constraint

Under this release topology, Vercel must not treat `main` as the Production
Branch. Otherwise, as soon as Step 20 connects the repository, a merge to `main`
would publish to `victenancy.com` automatically, bypassing the
staging-then-manual-promotion strategy. Step 20 must configure an explicit
production-promotion mechanism, such as a protected production branch or a manual
promotion flow.

### Immutable frontend promotion

The frontend promoted to production must correspond to the exact Git revision or
immutable Vercel deployment previously verified in staging; do not rebuild from a
newer branch head during promotion. This mirrors the backend rule that production
runs the same image digest that passed staging.

## Required Manual Setup (Step 20)

Perform these tasks in the external consoles; this document only records them.

### GitHub

1. Enable `main` branch protection:
   - require pull requests;
   - require the successful `Validate API, Web, and Infrastructure` workflow;
   - prevent direct pushes;
   - require branch freshness before merge if enabled by repository policy.
2. GitHub Environments:
   - `staging` exists with its existing AWS/Supabase variables plus `CORS_ORIGINS`;
   - `production` exists with required reviewer approval, its existing AWS/Supabase
     variables, and `CORS_ORIGINS`.

Expected `CORS_ORIGINS` values:

| Environment | `CORS_ORIGINS` |
|---|---|
| staging | `http://localhost:3000,https://staging.victenancy.com` |
| production | `http://localhost:3000,https://victenancy.com,https://www.victenancy.com` |

The local origin is retained for operational/local testing. Preserve exact-origin
matching; do not use wildcards or `*.vercel.app`.

### Vercel

1. Import the GitHub repository.
2. Set the root directory to `apps/web`.
3. Configure staging and production environment variables.
4. Use the existing API Gateway URLs as `NEXT_PUBLIC_API_BASE_URL`.
5. Do not store server-only secrets in `NEXT_PUBLIC_*` values.
6. Configure the production-branch constraint: `main` must not be the Production
   Branch; use an explicit production-promotion mechanism (protected production
   branch or manual promotion flow).

### Supabase

1. Configure Site URL and allowed redirect URLs for local, staging, and production.
2. Retain only authorized redirect origins.

### Cloudflare

1. Point apex, `www`, and staging DNS records to Vercel as instructed by Vercel.
2. Initially use DNS-only records unless a separate Cloudflare proxy decision is
   made.

## Changing API CORS after Deployment

`CORS_ORIGINS` is stored as a GitHub Environment variable. Editing it in the
GitHub UI emits no `push` event, so it does **not** automatically update the
deployed Lambda. To apply a change:

1. Configure or change staging `CORS_ORIGINS`.
2. Manually run the **Deploy API Staging** workflow.
3. Validate staging, then from `main` manually run the **Deploy API Production**
   workflow.
4. The production workflow uses the production Environment's **own** `CORS_ORIGINS`;
   do not copy the staging value.

## Deferred Work

Deferred to Step 19b or later:

- Playwright/browser E2E implementation.
- Automated cross-service end-to-end deployment tests.
- Custom `api.victenancy.com` API Gateway domain, ACM certificate, and DNS.
- Vercel project creation, Vercel deployment automation, and Cloudflare DNS changes.
- Alert routing, dashboards, analytics, and incident automation.

## Related Documents

- [AWS API Deployment](aws-api-deployment.md)
- [Managed Supabase Environments](managed-supabase.md)
