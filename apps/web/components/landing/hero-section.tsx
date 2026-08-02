import Link from "next/link";
import { ArrowRight, ArrowDown } from "lucide-react";
import { LandingMotion } from "./landing-motion";
import { HeroVideo } from "./hero-video";
import { TrustCard } from "./trust-card";

export function HeroSection() {
  return (
    <LandingMotion className="relative flex min-h-svh flex-col justify-end overflow-hidden bg-ink text-warm-white">
      <HeroVideo />

      {/* Cinematic overlays */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/40 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/60"
      />

      {/* Grid lines */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden md:block">
        <span className="absolute inset-y-0 left-1/4 w-px bg-white/[0.06]" />
        <span className="absolute inset-y-0 left-2/4 w-px bg-white/[0.06]" />
        <span className="absolute inset-y-0 left-3/4 w-px bg-white/[0.06]" />
      </div>

      {/* Atmosphere */}
      <svg
        aria-hidden="true"
        viewBox="0 0 800 240"
        className="pointer-events-none absolute left-1/2 top-24 h-[180px] w-[min(900px,110vw)] -translate-x-1/2 opacity-45"
      >
        <defs>
          <filter id="hero-ellipse-blur" x="-20%" y="-80%" width="140%" height="260%">
            <feGaussianBlur stdDeviation="25" />
          </filter>
          <linearGradient id="hero-ellipse-gradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#12352a" stopOpacity="0" />
            <stop offset="0.5" stopColor="#79a8a0" stopOpacity="0.8" />
            <stop offset="1" stopColor="#12352a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <ellipse
          cx="400"
          cy="120"
          rx="340"
          ry="42"
          fill="url(#hero-ellipse-gradient)"
          filter="url(#hero-ellipse-blur)"
        />
      </svg>

      {/* Content */}
      <div className="relative mx-auto w-full max-w-6xl px-5 pt-44 pb-20 md:px-8 md:pb-28">
        <div data-anim="card" className="mb-16">
          <TrustCard />
        </div>

        <p
          data-anim="eyebrow"
          className="font-mono text-[11px] tracking-[0.22em] text-white/50"
        >
          VICTORIAN TENANCY LAW
        </p>

        <h1
          data-anim="headline"
          className="mt-5 font-display text-[clamp(2.5rem,7vw,4.75rem)] leading-[1.02] font-extrabold tracking-tight"
        >
          KNOW YOUR RIGHTS.
          <br />
          RENT WITH <span className="text-mint">CONFIDENCE.</span>
        </h1>

        <p
          data-anim="description"
          className="mt-6 max-w-xl text-base leading-relaxed text-white/60 md:text-lg"
        >
          Plain-language answers on leases, notices, bonds and repairs —
          grounded in Victorian tenancy law, with the source behind every
          answer.
        </p>

        <div data-anim="ctas" className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/login"
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-mint px-6 text-sm font-semibold text-ink transition-colors duration-200 hover:bg-[#6fe0ab]"
          >
            Ask your first question
            <ArrowRight
              size={16}
              strokeWidth={2.5}
              className="transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            href="#how-it-works"
            className="group inline-flex h-12 items-center gap-2 rounded-full border border-white/20 px-6 text-sm font-semibold text-warm-white transition-colors duration-200 hover:border-white/45"
          >
            See how it works
            <ArrowDown
              size={16}
              strokeWidth={2.5}
              className="transition-transform duration-200 motion-safe:group-hover:translate-y-0.5"
            />
          </Link>
        </div>
      </div>
    </LandingMotion>
  );
}
