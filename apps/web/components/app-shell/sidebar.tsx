import { SidebarContent } from "./sidebar-content";

export function Sidebar({ email }: { email: string }) {
  return (
    <aside className="hidden w-[272px] shrink-0 border-r border-ink/10 bg-warm-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <SidebarContent email={email} />
    </aside>
  );
}
