# AWS API Deployment

NestJS CRUD API deployed as a Lambda container image behind API Gateway HTTP API v2.
Managed by Terraform and deployed via GitHub Actions through OIDC.

## Architecture

```
GitHub Actions (OIDC)
  → assume deploy role
    → push ECR image (staging only)
    → terraform apply environment root
      → Lambda (container, reserved concurrency)
        → Secrets Manager (runtime DATABASE_URL)
        → Supavisor (transaction-mode pooler)
      → API Gateway HTTP API v2
        → GET /health (public)
        → ANY /{proxy+} (JWT-auth in application)
      → CloudWatch Logs + Alarms
```

## Terraform State Isolation

| State Key | Purpose | Deploy Role Access |
|---|---|---|
| `bootstrap/terraform.tfstate` | Account-level resources (ECR, roles, secrets, state bucket) | Read-only for staging and production |
| `api/staging/terraform.tfstate` | Staging Lambda, API Gateway, log groups, alarms | Read-write |
| `api/production/terraform.tfstate` | Production Lambda, API Gateway, log groups, alarms | Read-write |

## Bootstrap Sequence (Manual, One-Time)

### 1. Apply Bootstrap

```bash
cd infra/aws/bootstrap

# Initial apply (local state)
terraform init -backend=false
terraform apply -var-file=terraform.tfvars

# Migrate to S3 backend
terraform init -migrate-state \
  -backend-config="bucket=<state-bucket>" \
  -backend-config="key=bootstrap/terraform.tfstate" \
  -backend-config="region=ap-southeast-2"
```

### 2. Record Bootstrap Outputs

```bash
terraform output state_bucket_name
terraform output ecr_repository_url
terraform output deploy_role_arn_staging
terraform output deploy_role_arn_production
terraform output runtime_secret_arn_staging
terraform output runtime_secret_arn_production
```

### 3. Configure Runtime Secrets

In AWS Secrets Manager Console, for each secret (`/victenancy/staging/api/runtime` and `/victenancy/production/api/runtime`), enter:

```json
{
  "DATABASE_URL": "postgresql://user:password@db.PROJECT_REF.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
}
```

Replace `user`, `password`, and `PROJECT_REF` with the Supabase project's pooler credentials.

### 4. Configure GitHub Environments

In GitHub repo Settings → Environments, for both `staging` and `production`, set these variables:

| Variable | Description |
|---|---|
| `AWS_REGION` | `ap-southeast-2` |
| `AWS_TF_STATE_BUCKET` | Bootstrap S3 bucket name |
| `AWS_DEPLOY_ROLE_ARN` | Staging or production deploy role ARN |
| `SUPABASE_PROJECT_REF` | Staging or production Supabase project ref |
| `SUPABASE_PUBLISHABLE_KEY` | Staging or production Supabase anon key |
| `GITHUB_ORG` | GitHub organization or user name |
| `GITHUB_REPO` | `VicTenancy.app` |

## Deployment Workflows

### Staging (Automatic)

Trigger: push to `main` when API, infra, or workflow files change. Also `workflow_dispatch`.

1. OIDC login as staging deploy role
2. `docker buildx build --platform linux/amd64 --push` with commit SHA tag
3. Query ECR for immutable digest
4. `terraform init → validate → plan → apply` with digest URI
5. Smoke: `GET /health` → 200, `GET /auth/me` → 401

### Production (Manual)

Trigger: `workflow_dispatch` from `main` only.

1. Verify staging `deploy-api-staging.yml` workflow run succeeded for same commit SHA
2. Production environment approval gate
3. OIDC login as production deploy role
4. Retrieve exact ECR digest from staging (no rebuild)
5. `terraform init → validate → plan → apply` with same digest
6. Smoke tests

## Rollback

To roll back to a prior image:

1. Find the ECR digest for a previous tag:  
   `aws ecr describe-images --repository-name victenancy-api --image-ids imageTag="<old-sha>"`
2. Run `terraform apply` in the environment root with the desired `image_uri`:  
   `terraform apply -var="image_uri=<ecr_repo_url>@sha256:<digest>" -var="source_git_sha=<old-sha>"`

## IAM Role Boundaries

### Deploy Roles

| Permission | Staging | Production |
|---|---|---|
| ECR push | Yes | No |
| ECR pull (deploy) | Yes | Yes |
| Lambda CRUD | `victenancy-staging-api` only | `victenancy-production-api` only |
| API Gateway | All APIs (scoped by tag via Terraform) | All APIs |
| CloudWatch Logs | `victenancy-staging*` groups | `victenancy-production*` groups |
| CloudWatch Alarms | `victenancy-staging*` alarms | `victenancy-production*` alarms |
| IAM PassRole | Lambda exec role only | Lambda exec role only |
| S3 state bucket | Read-write | Read-write |

### Lambda Execution Roles

- `logs:CreateLogStream`, `logs:PutLogEvents` → own log group only
- `secretsmanager:GetSecretValue` → own runtime secret only

## Lambda Runtime Configuration

### Provided via Environment Variables

```
NODE_ENV=production
LOG_LEVEL=info
REQUESTS_PER_MINUTE=20
REQUESTS_PER_DAY=200
SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon-key>
SUPABASE_JWT_ISSUER=https://<PROJECT_REF>.supabase.co/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
RUNTIME_SECRET_ARN=<secret-arn>
```

### Fetched from Secrets Manager at Cold Start

```
DATABASE_URL (must be Supavisor pooler: port 6543, pgbouncer=true, connection_limit=1)
```

## Lambda Specs

| Property | Value |
|---|---|
| Runtime | `public.ecr.aws/lambda/nodejs:22` (container) |
| Architecture | x86_64 |
| Memory | 512 MB |
| Timeout | 28 seconds |
| Reserved Concurrency | 5 (staging), 10 (production) |
| Alias | `live` |

## Log Groups

| Resource | Pattern |
|---|---|
| Lambda | `/aws/lambda/victenancy-<env>-api` |
| API Gateway | `/aws/apigateway/victenancy-<env>-api` |

Retention: 30 days. Deletion protection: enabled.

## Alarms

| Alarm | Metric | Threshold |
|---|---|---|
| Lambda errors | `AWS/Lambda Errors` | > 0 |
| Lambda throttles | `AWS/Lambda Throttles` | > 0 |
| Lambda duration | `AWS/Lambda Duration (max)` | > 25s |
| API 5xx | `AWS/ApiGateway 5xx` | > 0 |

## Deferred Scope

- CORS origins (deferred to Step 20 — frontend deployment)
- Agent invocation (deferred to Step 16)
- Queues, async jobs, streaming (deferred to Step 16)
- Observability dashboards (deferred to Step 18a/21)
- Automated secret rotation
- Frontend CloudFront+S3 deployment (deferred to Step 20)

## Related Documents

- [Managed Supabase Environments](managed-supabase.md)
- [Application Boundaries](../architecture/application-boundaries.md)
- [Application API Reference](../api/application-api.md)
- [Local Development Environment](../development/local-environment.md)
