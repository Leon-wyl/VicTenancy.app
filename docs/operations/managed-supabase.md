# Managed Supabase Environments

Separate staging and production Supabase Cloud projects. Schema promotion is
CI-only; local `supabase db reset` validates changes before merge.

## Environment Identities

Each Cloud project has its own:

| Property | Staging | Production |
|---|---|---|
| Project ref | `STAGING_PROJECT_REF` (Environment Variable) | `PRODUCTION_PROJECT_REF` (Environment Variable) |
| Supabase URL | `https://PROJECT_REF.supabase.co` | `https://PROJECT_REF.supabase.co` |
| Access token | `SUPABASE_ACCESS_TOKEN` (Environment Secret) | `SUPABASE_ACCESS_TOKEN` (Environment Secret) |
| DB password | `SUPABASE_DB_PASSWORD` (Environment Secret) | `SUPABASE_DB_PASSWORD` (Environment Secret) |
| Plan | Free | Free |

All values above are `${PLACEHOLDER}`. Real project refs, URLs, and credentials
are stored only in GitHub Environment Variables and Secrets; never committed.

## Cloud Auth Configuration

### JWT Signing

Managed Supabase projects use **asymmetric ES256 (ECC P-256)** JWT signing
verified through the JWKS endpoint. This differs from local Supabase CLI which
uses symmetric HS256.

- **Issuer**: `${SUPABASE_URL}/auth/v1`
- **JWKS**: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
- **Algorithm**: ES256 / ECC P-256 (sig)
- Each Cloud project has its own independent JWT signing key lifecycle.
- Private signing keys are managed by Supabase; never retrieve or store private keys.

### Google OAuth

Each Cloud project requires its own Google OAuth client:

- **Supabase Auth callback**: `https://PROJECT_REF.supabase.co/auth/v1/callback`
- **Application redirect**: `${WEB_APP_URL}/auth/callback` (placeholder — real URLs
  set in Supabase Dashboard Authentication settings during Step 20 frontend deployment)

Configured manually in the Supabase Dashboard under Authentication → Providers → Google.

### Dashboard Usage Policy

**Allowed** (via Supabase Dashboard):
- Project settings (name, region, plan)
- Authentication settings (URL, OAuth providers, signing keys)
- Observability (logs, metrics, API usage)
- Backup restore approval (production)
- Database password rotation

**Forbidden** (never use Dashboard for DDL):
- SQL Editor
- Table Editor
- Database functions editor
- Any schema creation or modification
- Row creation or editing

Schema changes go exclusively through `supabase/migrations/` → CI migration promotion.

## Database Connection Modes

| Mode | Variable | Port | Use |
|---|---|---|---|
| Runtime (Supavisor) | `DATABASE_URL` | `:6543` | API runtime connections; transaction-mode pooling; `?pgbouncer=true` |
| Admin (direct) | `DIRECT_DATABASE_URL` | `:5432` | Migrations, administration, controlled integration operations |

Local development uses direct connections on port `:54322` for both variables
since Supavisor is not available locally.

Integration tests prefer `DIRECT_DATABASE_URL` with fallback to `DATABASE_URL`.

## CI Migration Promotion

```
Developer: git push to feature branch
  → PR → validate.yml (db lint, db reset, lint, build, test)

Merge to main (supabase/migrations/ changed)
  → deploy-staging.yml (link → dry-run → db push → verify)

Production (manual, from main only)
  → deploy-production.yml → verify-staging (check GitHub deployment metadata)
    → Production approval gate (reviewer required)
      → link → dry-run → db push → verify
```

### Schema Recovery Policy

**Normal operations**: CI-only migration promotion.
- Staging: automatic on merge to main.
- Production: manual dispatch with staging verification + reviewer approval.

**Break-glass exception**: Manual CLI `supabase db push` is permitted only as a
documented emergency bypass when CI is unavailable. Such operations must be
authorized, logged, and followed by CI verification at the earliest opportunity.

**Never permitted**: `supabase db reset --linked` or any destructive schema
operation against the production database.

## Production Database Access

- Least privilege: only the minimum required PostgreSQL role.
- MFA-protected: all production database access requires multi-factor authentication.
- Time-bounded: access grants expire after the approved operation window.
- Audited: all production access events are logged and reviewed.
- Credential-manager backed: credentials are stored in a password manager,
  never in shell history, dotfiles, or local migration tooling config.

## Network Restrictions

Deferred to Step 15a. After stable AWS/CI egress IPs are known, configure
Supabase network restrictions to allow only those IP ranges. Do not enable an
allowlist that blocks CI migration workflows or future Lambda runtime connectivity.

## Deferred Steps

- **Step 15a**: API Lambda and Gateway Deployment (runtime infrastructure)
- **Step 17**: Frontend Auth and Shell (web application UI)
- **Step 19**: CI/CD, E2E and Release Governance (full pipeline)
- **Step 20**: Frontend AWS Deployment (CloudFront + S3 + Lambda@Edge)
