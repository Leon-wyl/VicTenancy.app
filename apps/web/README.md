# Web Application

Next.js 15 App Router application for the VicTenancy.app full-stack chat experience.
Implemented in Step 14a as a placeholder; full implementation begins in Step 17.

## Ownership

- The application will use the Next.js App Router for the authenticated chat
  experience.
- Browser code may use only `NEXT_PUBLIC_*` configuration values.
- Browser code may use Supabase Auth and Realtime directly, but business-data
  writes must go through the CRUD API.
- Browser code must not receive AWS credentials, database credentials, or a
  Supabase service-role key. It must not call the AWS-IAM Agent Runtime route
  directly.

## Planned Layout

Step 17 will create the application files and establish this internal layout:

```text
app/          # App Router routes, layouts, and server components
components/   # Reusable UI components
lib/          # Browser-safe clients and utilities
tests/        # Frontend unit and end-to-end test support
```

Do not add business routes, Tailwind, Supabase SDK, or Agent calls before
Step 17. See [AGENT.md](../AGENT.md) for startup instructions.
