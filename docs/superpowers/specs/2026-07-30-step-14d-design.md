# Step 14d: Managed Supabase Environments and Database Delivery — Design Spec

## Goal

Establish a secure, CI-only database-delivery path from committed local migrations
to separate managed Supabase staging and production projects, with documented
environment ownership, backup/recovery procedures, and cloud configuration contracts.

## Architecture

Three GitHub Actions workflows form the CI migration pipeline:

1. `validate.yml` — PR guard: `supabase db reset`, `db lint`, Prisma generate,
   lint, build, unit + integration tests on every schema/API change.
2. `deploy-staging.yml` — Pushes committed migrations to the staging Supabase
   project on merge to main (path-filtered) or manual dispatch; GitHub
   auto-creates deployment record via `environment: staging`.
3. `deploy-production.yml` — Two-job split: `verify-staging` (no Environment,
   checks GitHub deployment metadata for same-SHA success) then
   `deploy-production` (needs verify-staging, `environment: production` with
   reviewer approval). Pushes migrations and smoke-checks JWKS.

No application code (API Lambda, frontend) is deployed by these workflows.

## Tech Stack

- GitHub Actions (YAML workflows)
- Supabase CLI (`supabase/setup-cli` action, pinned revision + pinned CLI version)
- GitHub Environments & Deployment API
- `docs/operations/` for new documentation

## Deliverables

### CI Workflows

1. **`validate.yml`** — PR → main, path-filtered, `contents: read`, no cloud credentials.
   Node 22, `supabase start` → `db lint` → `db reset` → `status -o env` → env mapping
   → Prisma generate → lint → build → unit test → integration test.

2. **`deploy-staging.yml`** — push to main (`supabase/migrations/**`) + `workflow_dispatch`.
   `environment: staging`, concurrency group, `contents: read`. Link → dry-run →
   push → fail-closed migration verification → JWKS EC/P-256 smoke. Auto deployment record.

3. **`deploy-production.yml`** — `workflow_dispatch` from main only. Two jobs:
   - `verify-staging`: no Environment, `deployments: read`, queries GitHub API for
     matching SHA with successful staging deployment.
   - `deploy-production`: `needs: verify-staging`, `environment: production`
     (approval gate), `contents: read`. Link → dry-run → push → fail-closed
     verification → JWKS smoke.

### New Documentation

- `docs/operations/managed-supabase.md` — Environment identities, cloud auth (ES256/ECC P-256 JWKS), connection modes, CI path, Dashboard policy, network deferral.
- `docs/operations/backup-restore.md` — Free-plan limitations, GPG `--recipient` model, data-only dump scope (public schema only, no managed schemas), recovery runbook, schema recovery policy (CI-only, CLI break-glass), restore drills in staging only.

### Existing Documentation Updates

AGENT.md, README.md, roadmap.md, application-boundaries.md, local-environment.md,
local-auth-setup.md, apps/api/README.md — updated for cloud identities, CI promotion
path, ES256 JWKS, connection modes, and Dashboard policy.

## Acceptance Criteria

1. Separate staging/production Supabase identities
2. `supabase db reset` reproduces committed schema locally
3. CI is sole schema promotion path (normal operations)
4. Staging auto-promotes from main merges
5. Production: manual approval + same-SHA staging verification (no staging secrets)
6. No credentials, secrets, or private JWT material committed
7. Two-job production workflow with verify-staging preflight
