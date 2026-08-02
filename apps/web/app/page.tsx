import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SkipLink } from "@/components/skip-link";

export default function Page() {
  return (
    <>
      <SkipLink />
      <LandingHeader />
      <main id="main-content">
        <HeroSection />
        <HowItWorks />
      </main>
      <LandingFooter />
    </>
  );
}
