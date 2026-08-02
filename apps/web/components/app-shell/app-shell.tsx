import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

export function AppShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-warm-white text-ink">
      <Sidebar email={email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav email={email} />
        <main id="main-content" className="flex-1 scroll-mt-14">
          {children}
        </main>
      </div>
    </div>
  );
}
