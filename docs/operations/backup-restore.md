# Backup and Restore

## Backup Status

Production and staging are on the Supabase **Free** plan:

| Property | Production | Staging |
|---|---|---|
| Managed automatic backups | Unavailable | Unavailable |
| PITR | Disabled | Disabled |
| Backup SLA | None | None |
| Data classification | Pre-launch/demo only | Synthetic test data only |

**Production is a pre-launch/demo deployment target.** Real user data, regulated
data, or sensitive personal data must not be stored while the project remains on
the Free plan. The application does not carry a contractual availability or
recovery SLA.

## Encrypted Logical Dump

Before every schema migration, destructive test, or release affecting the
database, an authorized operator should create an encrypted logical dump.

### Scope and Limitations

`supabase db dump --data-only` protects **application-owned public schema data
only**. Schema and migration history are rebuilt from committed SQL migrations;
the dump does not include remote migration history. It **excludes** Supabase
managed schemas:

- `auth` schema (users, identities, sessions, MFA, audit logs)
- `storage` schema (objects, buckets, policies)
- `realtime` schema (subscription configuration)
- `supabase_migrations` schema (managed by remote migration history)
- OAuth provider settings, JWT signing keys, API keys, Realtime configuration

This is **not a complete Supabase disaster-recovery backup**. Auth-linked
application data cannot be independently restored into a fresh project using
only this dump. Auth users, Storage objects, OAuth settings, JWT keys, and
other managed service state require separate recovery procedures.

### Procedure

Uses **GPG `--recipient` public-key encryption**:

```bash
supabase db dump --data-only --linked --password "$SUPABASE_DB_PASSWORD" \
  | gpg --encrypt --recipient YOUR_GPG_KEY_ID \
  > victenancy-prod-$(date -u +%Y%m%d-%H%M%S).sql.gpg
```

- **Private-key custody**: The operator performing encryption must ensure the
  corresponding GPG private key is held securely by an authorized operator and
  available for decryption during recovery.
- **Decryption**: `gpg --decrypt dump.sql.gpg | psql "$DIRECT_DATABASE_URL"` (run
  by the authorized operator holding the private key).
- **No passphrases** in shell commands, workflow YAML, logs, or examples.
- Dumps must be stored outside Git and outside public CI artifacts.
- Plaintext local dumps must be deleted after encrypted storage is verified.

## Recovery Runbook

### 1. Authorization

- Recovery must be approved by an authorized operator.
- The operator performing recovery must hold the GPG private key corresponding
  to the public key used for encryption.

### 2. Incident Freeze

- Stop all application writes to the affected database.
- In CI, disable the staging or production migration workflow to prevent
  concurrent schema changes.

### 3. Select Recovery Point

- Identify the latest verified encrypted dump.
- Verify the dump file integrity: `gpg --verify dump.sql.gpg` (if signed) or
  `gpg --list-packets dump.sql.gpg` (check encryption metadata).

### 4. Rebuild Schema

**Normal path** (CI available):
Run the CI migration promotion workflow for the target environment. This applies
all committed migrations in order.

**Break-glass exception** (CI unavailable):
Manual CLI migration as a documented emergency bypass:

```bash
supabase link --project-ref "$PROJECT_REF"
supabase db push --password "$SUPABASE_DB_PASSWORD"
```

Must be authorized, logged, and followed by CI verification at the earliest
opportunity.

### 5. Restore Data

```bash
gpg --decrypt victenancy-prod-YYYYMMDD-HHMMSS.sql.gpg \
  | psql "$DIRECT_DATABASE_URL"
```

### 6. Post-Restore Verification

- **Credentials**: confirm `SUPABASE_DB_PASSWORD` is still valid.
- **Migration history**: run `supabase migration list --password` and compare
  against `supabase/migrations/`. All committed migrations must be present.
- **RLS smoke**: query a user-owned resource through the API to verify Row Level
  Security is enforced.
- **JWKS smoke**: `curl -fsS "$SUPABASE_URL/auth/v1/.well-known/jwks.json"` and
  confirm an asymmetric EC/P-256/ES256/sig key is present.
- **Application health**: `GET /health` returns `{ "status": "ok" }`.

### 7. Stakeholder Communication

Notify relevant stakeholders: recovery completed, recovery point used, verified
checks, any known data loss, services resumed.

### 8. Restrictions

**Never** run `supabase db reset --linked` or any destructive schema operation
against the production database.

## Restore Drills

- Run drills **only** against staging or a disposable Supabase clone.
- **Production restore is manual, authorized, and never automated by CI.**
- Drills verify: GPG decryption, data import, migration history reconciliation,
  RLS/JWKS smoke.

## Pre-Launch Recovery Strategy

Until secure offsite backup storage and a tested recovery process exist, the
safe recovery strategy is:

1. Rebuild the schema from committed migrations (CI or break-glass manual).
2. Restore only from a verified operator-created encrypted dump.

## Future Considerations

Before public launch or storing real user data:

- Upgrade to a Supabase paid plan with managed automatic daily backups.
- Enable PITR if the Recovery Point Objective requires less than 24 hours.
- Establish secure offsite encrypted backup storage.
- Implement and test a complete disaster-recovery procedure that covers both
  application data (public schema) and managed service state (auth, storage).
- Document Recovery Time Objective (RTO) and Recovery Point Objective (RPO).
