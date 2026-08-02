import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function Page() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-[100] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-full focus:bg-mint focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
      >
        Skip to content
      </a>
      <LandingHeader />
      <main id="main-content">
        <HeroSection />
        <HowItWorks />
      </main>
      <LandingFooter />
    </>
  );
}
