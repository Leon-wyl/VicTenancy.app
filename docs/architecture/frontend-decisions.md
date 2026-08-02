# Frontend Decisions

This document records the frontend decisions for VicTenancy.app, primarily for
Step 17 (Frontend Auth and Shell) and the visual foundation that will support
Step 18 (Chat UI and Realtime).

The decisions are informed by the existing Next.js application and selected
patterns from the `/Users/yilangwu/qdx/rush-v4` project. Rush is a reference for
component organization and UI primitives, not a source to copy wholesale.

## Product and visual direction

VicTenancy is presented as a premium AI legal assistant for Australian renters:

> A polished AI legal assistant combining cinematic product design with
> grounded, readable legal information.

The visual direction is a hybrid system:

- A dark, cinematic Hero creates a memorable first impression suitable for a
  portfolio project.
- Warm-white and light-neutral sections provide readability and legal-product
  credibility.
- The authenticated application shell is light-first and optimized for reading
  legal explanations and citations.
- The primary accent is `#5ed29c`, supported by dark ink (`#070b0a`), deep
  forest green, muted cyan, warm white, and soft gray.
- Avoid excessive neon, purple gradients, Web3 styling, or generic law-firm
  visual language.

The CodeNest reference is adapted rather than copied. Its layout, grid, glow,
liquid-glass card, and cinematic atmosphere are useful; its coding-education
copy and visual identity are not.

## Public landing page

The public entry point is `/` and uses a minimal product-oriented layout.

### Header

The header follows a Claude-inspired level of restraint without copying Claude
branding or assets:

- VicTenancy logo and wordmark on the left.
- A single `Login` action on the right.
- No Projects, Blog, About, Resume, Pricing, or Contact navigation in the MVP.
- Transparent over the Hero, with white text and logo.
- On scroll, transitions to a translucent warm-white surface with dark text,
  blur, and a subtle border.
- The mobile header keeps the same two-item structure; no hamburger menu is
  required for the landing page.

The Hero has the primary action `Ask your first question`, which leads into the
authentication/application flow. `Login` remains the secondary, explicit
authentication entry point.

### Hero

The Hero uses:

- Full-screen HLS background video from the selected Mux stream.
- `hls.js` configured with `{ enableWorker: false }`.
- Muted, autoplay, loop, and `playsInline` playback when allowed.
- Approximately 60% video opacity.
- Left-to-right and bottom-up readability gradients.
- Desktop grid lines at 25%, 50%, and 75% viewport positions.
- A subtle cyan/forest-green SVG ellipse glow with approximately 25px Gaussian
  blur.
- A 200x200px liquid-glass trust card shifted upward by exactly 50px.

The CodeNest copy is replaced with tenancy-specific messaging:

- Eyebrow: `AUSTRALIAN TENANCY LAW`
- Headline: `KNOW YOUR RIGHTS. RENT WITH CONFIDENCE.`
- CTA: `Ask your first question`
- Trust-card message: `Guidance grounded in legislation`

The Hero must remain usable when video playback is unavailable. A dark static
fallback is required. `prefers-reduced-motion` and `Save-Data` must disable
autoplay and preserve the composition with the fallback background.

Below the Hero, light sections explain three product benefits:

1. Understand the rule.
2. See the source.
3. Know your next step.

The page also includes a concise disclaimer that VicTenancy provides
information grounded in legislation and official sources and is not a
substitute for professional legal advice.

## Frontend technology choices

The chosen frontend foundation is:

| Concern | Decision |
|---|---|
| Framework | Next.js 15 App Router + React 19 |
| Styling | Tailwind CSS v4 |
| Component primitives | shadcn/ui with Radix-based primitives |
| Icons | `lucide-react` |
| Fonts | Inter, Plus Jakarta Sans, Instrument Serif italic |
| Auth | Supabase Auth and existing `@supabase/ssr` clients |
| Hero video | `hls.js` with `enableWorker: false` |
| Class composition | `clsx` + `tailwind-merge` via a shared `cn()` helper |
| Frontend tests | Vitest + Testing Library where web test setup is introduced |
| Notifications | `sonner` may be used for auth and network feedback |

Tailwind and shadcn/ui are planned for Step 17 and are not currently present in
the web workspace. Design tokens should be expressed as CSS variables so the
dark Hero, light marketing sections, and authenticated shell share one system.

## Deliberately excluded or deferred technologies

The following Rush technologies are not part of the VicTenancy frontend
foundation:

- Vite and TanStack Router: Next.js App Router is already the application
  routing system.
- Auth0: Supabase Auth is already the established authentication authority.
- Apollo and GraphQL code generation: VicTenancy consumes the versioned REST
  application API.
- Three.js, WASM, and domain-specific scientific visualization: unrelated to
  tenancy-law workflows.
- Zustand: defer until Step 18 demonstrates a need for persistent client-side
  chat state or draft state.
- `next-themes`: the initial product uses a fixed hybrid brand system rather
  than user-selectable dark/light themes.
- Motion libraries for simple states: use CSS transitions for buttons,
  underline states, and basic visibility changes.

## Authentication and route structure

The public landing page and authenticated product are separate experiences:

- `/`: public landing page.
- `/login`: email/password login and Google OAuth entry.
- `/signup`: email registration.
- `/forgot-password`: password recovery entry.
- `/app`: protected product shell.
- `/auth/callback`: existing OAuth code exchange route.

Authentication rules:

- Continue using the existing browser and server Supabase clients.
- Continue refreshing sessions through middleware.
- Redirect unauthenticated users from `/app` to `/login` with a safe `next`
  path.
- Redirect authenticated users away from `/login` and `/signup` to `/app`.
- Preserve the existing open-redirect protections in the callback flow.
- Sign out through the Supabase browser client.
- Keep all service-role keys, database credentials, AWS credentials, and Agent
  Runtime access server-side.

The NestJS API remains the authority for business-data reads and writes. The
browser must not call the Agent Runtime AWS-IAM route directly.

## Authenticated application shell

Step 17 establishes the shell but does not implement the full chat experience.

The protected `/app` shell contains:

- VicTenancy branding.
- A `New conversation` entry point.
- A conversation-history placeholder ready for Step 18.
- User identity/menu and sign out.
- Responsive desktop sidebar and mobile drawer behavior.
- An empty-state main area that can receive the chat UI later.

Step 18 owns conversation loading, message rendering, realtime updates,
citations, search, rename, and delete. Step 18a owns file upload and contract
analysis.

## Animation principles

Use `emil-design-eng` for motion decisions and GSAP for complex implementation.
Their responsibilities are intentionally separate:

- `emil-design-eng` decides whether an interaction should animate, its purpose,
  timing, easing, and restraint.
- `gsap-react` handles React lifecycle, refs, scoping, and cleanup when GSAP is
  needed.
- `gsap-core` handles basic tweens and responsive/reduced-motion behavior.
- `gsap-timeline` handles Hero sequencing and coordinated storytelling.
- `gsap-scrolltrigger` is reserved for scroll sections where motion improves
  comprehension.
- `gsap-performance` guides transform/opacity choices and jank prevention.

GSAP is not required for every interaction:

- CSS handles button press, Login hover, underline, and simple state changes.
- GSAP handles Hero entrance choreography, meaningful scroll narratives, and
  carefully scoped decorative motion.
- hls.js handles video playback; GSAP does not control the stream lifecycle.

Motion requirements:

- Prefer `transform` and `opacity`.
- Use ease-out for entering UI.
- Never enter from `scale(0)`.
- Keep frequent UI interactions short and interruptible.
- Do not animate layout properties without a concrete product reason.
- Support `prefers-reduced-motion` and reduce or remove nonessential movement.
- Do not add animation merely because an element is available to animate.

## Scope boundary

This decision record covers the frontend direction for Step 17 and the
animation foundation for Step 18. It does not authorize changes to:

- Step 16 async orchestration.
- Supabase migrations or RLS policies.
- NestJS API contracts.
- Agent Runtime code.
- Realtime subscriptions, message streaming, citations, or uploads.
- Frontend deployment and E2E release governance planned for later roadmap
  steps.

