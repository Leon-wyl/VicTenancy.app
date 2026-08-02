# DeepSeek Prompt: VicTenancy Landing Page

## Role and objective

Act as a senior React/Next.js product engineer and design engineer. Implement a
production-quality public landing page for **VicTenancy**, an AI legal assistant
for Victorian renters.

Work in:

```text
/Users/yilangwu/projects/VicTenancy.app/apps/web
```

Replace the current placeholder homepage with a memorable, responsive portfolio
piece that feels like a premium AI product while remaining calm, credible, and
readable as a legal-information tool.

Do not only describe the solution: implement it, install required dependencies,
and run the verification commands at the end.

## Scope

Implement only the public landing page at `/`:

- Landing-page components, typography, design tokens, Hero, header, CTA links,
  HLS video, motion, and light sections below the Hero.
- `Login` links may point to `/login`, but auth must not be implemented here.

Do not modify or implement auth forms, `/app`, chat, realtime, conversations,
citations, uploads, API calls, Supabase clients, middleware, OAuth callback,
database, RLS, backend, Agent Runtime, or infrastructure.

## Product and visual direction

Create a hybrid visual system:

- Dark, cinematic Hero for a strong first impression.
- Warm-white/light-neutral sections below for readability and legal credibility.
- Dark ink: `#070b0a`; primary accent: `#5ed29c`.
- Supporting tones: deep forest green, muted cyan, warm white, soft gray.
- Use refined editorial spacing, intentional overlap, atmospheric depth, and
  strong type hierarchy.
- Avoid generic law-firm styling, purple gradients, excessive neon, Web3 visual
  language, overused glassmorphism, and template-like SaaS cards.

Adapt the CodeNest reference rather than copying it: keep its cinematic
composition, grid, glow, and liquid-glass craft, but replace its coding-school
identity with a trustworthy Victorian tenancy-law product.

## Content

### Header

Create a restrained, Claude-inspired header without copying Claude branding,
assets, text, or exact layout:

- Left: an original geometric VicTenancy mark and `VicTenancy` wordmark.
- Right: one action only, `Login`, linking to `/login`.
- Do not add Pricing, Features, Blog, About, Projects, Contact, Resume, or any
  other navigation item.
- Do not add a hamburger menu; the header has only the brand and Login action.
- Initially overlay the dark Hero with white content.
- After scrolling past the Hero threshold, use a translucent warm-white surface,
  dark text, backdrop blur, and a subtle bottom border.
- Login needs mint hover styling, keyboard focus, and an accessible name.

### Hero copy

Use this copy exactly:

```text
Eyebrow:
VICTORIAN TENANCY LAW

Headline:
KNOW YOUR RIGHTS.
RENT WITH CONFIDENCE.

Description:
Understand Victorian tenancy law with clear, source-grounded guidance for
leases, notices, bonds, repairs, and everyday rental questions.

Primary CTA:
Ask your first question

Secondary CTA:
See how it works
```

The primary CTA links to `/login`; the secondary CTA scrolls to the explanatory
section. Do not claim that VicTenancy provides legal advice, replaces lawyers,
guarantees outcomes, or resolves disputes.

### Below-the-fold content

Add a light `How it works` section with this three-step sequence:

1. **Understand the rule** — turn a rental question into plain-language
   guidance.
2. **See the source** — connect the explanation to legislation and official
   information.
3. **Know your next step** — clarify practical actions and when to seek help.

End with this concise disclaimer:

```text
VicTenancy provides information grounded in tenancy legislation and official
sources. It is not a substitute for professional legal advice.
```

## Visual specification

### Hero background

Use this exact HLS stream as a full-viewport background video:

```text
https://stream.mux.com/tLkHO1qZoaaQOUeVWo8hEBeGQfySP02EPS02BmnNFyXys.m3u8
```

Required layers:

- `object-fit: cover`, approximately 60% video opacity, muted autoplay loop,
  and `playsInline`.
- Left gradient from `#070b0a` to transparent.
- Bottom-up dark gradient for readability and transition into the light section.
- Subtle cyan/deep-green atmospheric overlay; keep it muted rather than neon.
- Three 1px vertical grid lines at 25%, 50%, and 75% viewport positions,
  white at roughly 10% opacity; hide or soften them on narrow screens.
- A large horizontal SVG ellipse in the upper-center area with cyan/dark-green
  color and an SVG Gaussian blur around 25px.
- A static dark fallback if playback fails or is disabled.

### Liquid-glass trust card

Create a floating card exactly `200px × 200px`, positioned above the headline
and shifted upward exactly 50px using `translate-y-[-50px]` or its CSS
equivalent. Center it on mobile and align/offset it with the text column on
desktop without overlapping the CTA.

Use this content:

```text
[ VICTORIAN TENANCY LAW ]
Guidance grounded in legislation
Understand the rules, sources, and next steps behind your tenancy question.
```

Required styling:

```css
background: rgba(255, 255, 255, 0.01);
background-blend-mode: luminosity;
backdrop-filter: blur(4px);
box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
```

Use a `::before` border frame with `inset: 0`, `padding: 1.4px`, a 180-degree
white linear gradient, `-webkit-mask-composite: xor`, and
`mask-composite: exclude`. Keep the card crisp and restrained.

Card typography:

- Tag: 11–14px, uppercase, letter-spaced.
- Headline: 18px; use Instrument Serif italic selectively for `legislation`.
- Description: 11px.

### Typography and CTA

- Eyebrow: Plus Jakarta Sans, bold, about 11px, uppercase, letter-spaced,
  `#5ed29c`.
- Headline: Inter Extra Bold, uppercase, tracking-tight, about 40px mobile and
  72px desktop, with a readable tablet scale. Color the final punctuation or
  final emphasis `#5ed29c`.
- Description: Inter, 14px, approximately 70% white opacity, max-width 512px.
- Primary CTA: rounded-full, `#5ed29c` background, `#070b0a` text, bold, and
  `ArrowRight` icon.
- Secondary CTA: transparent/text-link treatment, visually subordinate.
- Use a warm-white/light-neutral background below the Hero, dark typography,
  quiet borders, sparse mint accents, and an intentional dark-to-light boundary.

## Technology

Use the existing Next.js application and this stack:

| Area | Required technology |
|---|---|
| Framework | Next.js 15 App Router + React 19 |
| Styling | Tailwind CSS v4 configured for Next.js/PostCSS |
| UI primitives | shadcn/ui with Radix-based primitives, only as needed |
| Icons | `lucide-react` — at minimum `ArrowRight` |
| Fonts | `next/font/google`: Inter, Plus Jakarta Sans, Instrument Serif |
| Video | `hls.js` |
| Complex animation | `gsap` + `@gsap/react` |
| Utilities | `clsx` + `tailwind-merge` through a shared `cn()` helper |
| Package manager | npm workspaces; update the npm lockfile with npm only |

Do not copy Rush's Vite, TanStack Router, Auth0, Apollo, GraphQL, Zustand,
Three.js, WASM, or `next-themes` setup. Use VicTenancy CSS variables for the
brand tokens; do not reuse Rush's blue/purple palette.

Keep server components server-side. Isolate browser-only video, scroll state,
and GSAP in focused `"use client"` components. A reasonable structure is:

```text
apps/web/
  app/layout.tsx
  app/page.tsx
  app/globals.css
  components/landing/
    landing-header.tsx
    hero-video.tsx
    hero-section.tsx
    trust-card.tsx
    how-it-works.tsx
    landing-motion.tsx
  components/ui/
  lib/utils.ts
```

## Implementation rules

### HLS

Use a client component. Prefer native HLS when supported; otherwise initialize
`hls.js` after mount with exactly:

```ts
new Hls({ enableWorker: false })
```

Destroy the HLS instance on unmount. Do not block rendering or retry endlessly.
When reduced motion or `navigator.connection.saveData` is active, do not
autoplay; show the fallback while preserving the Hero composition.

### Motion

Use `emil-design-eng` for design judgment and GSAP for complex implementation:

- Create one scoped Hero entrance timeline with `gsap.timeline()` for the trust
  card, eyebrow, headline, description, and CTA.
- Use `@gsap/react`'s `useGSAP()` with a container ref and scoped selectors.
- Use timeline labels/position parameters, not a chain of manual delays.
- Use `gsap.matchMedia()` for responsive differences and reduced motion.
- Use a subtle reveal for the three benefits only if it improves comprehension;
  do not add pinning, scrubbing, mouse followers, or decorative parallax by
  default.
- CSS handles Login hover, focus, button press, and other simple transitions.
- Use ease-out for entrance, `power2.out` or `power3.out`, and 30–80ms related
  staggers. Never use `ease-in` for UI entrance or start from `scale(0)`.
- Prefer transforms and opacity. Avoid animating width, height, top, left,
  margin, or padding. Use `will-change` only on actual animated elements.
- Always clean up GSAP context/timelines on unmount.

## Constraints

- Preserve the existing Next.js App Router and Supabase auth foundation.
- The page must render without Supabase configuration or API requests.
- Do not expose service-role, database, AWS, or Agent Runtime credentials.
- Do not add external images, copied logos, or AI-generated people imagery; the
  specified Mux stream is the only remote visual asset.
- Use an original geometric VicTenancy mark in CSS or inline SVG.
- Use Australian English and semantic HTML (`header`, `nav`, `main`, `section`,
  `footer`).
- Mark video, grid lines, and decorative SVGs `aria-hidden`.
- Give every interactive element an accessible name and visible focus state.
- Gate hover-only behavior to fine-pointer devices.
- Maintain sufficient contrast and no horizontal overflow at 320px width.
- Respect `prefers-reduced-motion`; remove nonessential positional movement while
  retaining helpful opacity/color transitions.
- Do not modify backend, auth, middleware, database, infrastructure, or Git
  history. Do not commit, push, or open a pull request.

## Acceptance criteria

The implementation is complete only if:

1. `/` is a polished VicTenancy landing page, not a placeholder.
2. Header contains only the brand and `Login`.
3. Hero contains the specified HLS behavior, overlays, grid, SVG glow, exact
   trust-card treatment, copy, and CTAs.
4. Video failure/fallback, reduced motion, and data-saving behavior work.
5. Light content includes the three agreed benefits and disclaimer.
6. Hero motion is scoped, responsive, cleaned up, and accessible.
7. Mobile (320/390px), tablet (768px), and desktop (1440px+) are intentionally
   designed with no horizontal scrolling.
8. Login and both CTAs are keyboard accessible and render without auth/API
   state.
9. Existing Supabase auth and backend files are unchanged.

## Verification

Run from the repository root and fix failures rather than bypassing them:

```bash
npm run lint -w @victenancy/web
npm run build -w @victenancy/web
```

Also manually check representative mobile, tablet, and desktop widths, video
fallback, reduced motion, keyboard focus, Hero text contrast, and horizontal
overflow.

## Required final response

After implementation, respond with exactly:

```markdown
## Implemented
- What was built.

## Files changed
- `path` — reason.

## Dependencies added
- `package` — purpose.

## Verification
- `npm run lint -w @victenancy/web` — pass/fail.
- `npm run build -w @victenancy/web` — pass/fail.
- Responsive, fallback, accessibility, and reduced-motion checks.

## Notes
- Deliberate trade-offs or remaining limitations only.
```

Do not output a generic tutorial or unrelated future auth/chat plan.
