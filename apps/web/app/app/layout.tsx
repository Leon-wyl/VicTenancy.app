import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell/app-shell";
import { SkipLink } from "@/components/skip-link";
import { ChatProvider } from "@/features/chat/chat-provider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app");
  }

  return (
    <>
      <SkipLink />
      <ChatProvider userId={user.id}>
        <AppShell email={user.email ?? ""}>{children}</AppShell>
      </ChatProvider>
    </>
  );
}
