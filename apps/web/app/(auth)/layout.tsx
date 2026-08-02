import type { Metadata } from "next";
import Link from "next/link";
import { LandingMark } from "@/components/landing/landing-mark";
import { SkipLink } from "@/components/skip-link";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-warm-white px-5 py-12">
      <SkipLink />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[320px] w-[min(760px,110vw)] -translate-x-1/2 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(94,210,156,0.12), rgba(18,53,42,0.06) 40%, transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-ink/5"
      />

      <div className="relative mb-10">
        <Link href="/" aria-label="VicTenancy home">
          <LandingMark />
        </Link>
      </div>

      <main id="main-content" className="relative flex w-full justify-center">
        {children}
      </main>
    </div>
  );
}
