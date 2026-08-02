"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function LandingMotion({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({
          defaults: { ease: "power3.out" },
        });

        tl.from('[data-anim="card"]', { y: 32, opacity: 0, duration: 0.7 }, 0.1)
          .from(
            '[data-anim="eyebrow"]',
            { y: 18, opacity: 0, duration: 0.45 },
            "-=0.4",
          )
          .from(
            '[data-anim="headline"]',
            { y: 34, opacity: 0, duration: 0.7, ease: "power2.out" },
            "-=0.3",
          )
          .from(
            '[data-anim="description"]',
            { y: 22, opacity: 0, duration: 0.5 },
            "-=0.4",
          )
          .from(
            '[data-anim="ctas"] > *',
            { y: 18, opacity: 0, duration: 0.4, stagger: 0.07 },
            "-=0.3",
          );
      });

      return () => mm.revert();
    },
    { scope },
  );

  return (
    <section ref={scope} className={className} aria-label="Introduction">
      {children}
    </section>
  );
}
