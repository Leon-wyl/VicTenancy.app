"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LandingMark } from "./landing-mark";
import { cn } from "@/lib/utils";

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled
          ? "border-b border-ink/10 bg-warm-white/80 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link
          href="/"
          aria-label="VicTenancy home"
          className={cn(
            "transition-colors duration-300",
            scrolled ? "text-ink" : "text-warm-white",
          )}
        >
          <LandingMark inverted={!scrolled} />
        </Link>
        <nav aria-label="Primary">
          <Link
            href="/login"
            className={cn(
              "inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors duration-300",
              scrolled
                ? "text-ink hover:bg-ink/5"
                : "text-warm-white hover:bg-white/10",
            )}
          >
            Log in
          </Link>
        </nav>
      </div>
    </header>
  );
}
