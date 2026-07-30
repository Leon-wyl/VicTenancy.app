# Web Application

Next.js 15 App Router application for the VicTenancy.app full-stack chat experience.
Step 14a: placeholder. Step 14b: Supabase Auth session plumbing and OAuth callback.
UI shell and protected routes begin in Step 17.

## Ownership

- The application uses the Next.js App Router for the authenticated chat experience.
- Browser code may use only `NEXT_PUBLIC_*` configuration values.
- Browser code may use Supabase Auth and Realtime directly, but business-data
  writes must go through the API.
- Browser code must not receive AWS credentials, database credentials, or a
  Supabase service-role key. It must not call the AWS-IAM Agent Runtime route
  directly.

## Layout

```text
app/
  auth/
    callback/route.ts   # OAuth code exchange (Step 14b)
  layout.tsx
  page.tsx
components/   # Reusable UI components (Step 17+)
features/     # Domain-organized frontend features
lib/
  supabase/
    client.ts  # Browser client factory (createBrowserClient)
    server.ts  # Server client factory (createServerClient)
public/       # Static assets
tests/        # Frontend unit and component tests
middleware.ts  # Session refresh middleware (Step 14b)
```

## Auth Foundation (Step 14b)

- `lib/supabase/client.ts` — browser-safe `createBrowserClient`
- `lib/supabase/server.ts` — server-side `createServerClient` with cookie access
- `middleware.ts` — refreshes session cookies on every request
- `app/auth/callback/route.ts` — exchanges OAuth code for a cookie-backed session

Do not add business routes, Tailwind, Supabase SDK, or Agent calls before
Step 17. See [AGENT.md](../AGENT.md) for startup instructions.
