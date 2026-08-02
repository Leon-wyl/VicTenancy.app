import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function Page() {
  return (
    <>
      <LandingHeader />
      <main>
        <HeroSection />
        <HowItWorks />
      </main>
      <LandingFooter />
    </>
  );
}
