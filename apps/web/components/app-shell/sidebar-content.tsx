"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { LandingMark } from "@/components/landing/landing-mark";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { UserMenu } from "./user-menu";

export function SidebarContent({
  email,
  onSignedOut,
}: {
  email: string;
  onSignedOut?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Link href="/app" aria-label="VicTenancy home">
          <LandingMark />
        </Link>
      </div>

      <div className="px-3">
        <Link
          href="/app"
          className="flex items-center gap-2.5 rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:border-mint/60 hover:bg-mint/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40"
        >
          <Plus className="h-4 w-4 shrink-0 text-ink/50" aria-hidden="true" />
          New conversation
        </Link>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col px-3 pb-2">
        <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/40">
          Recent conversations
        </p>
        <ConversationList />
      </div>

      <div
        className="border-t border-ink/10 p-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <UserMenu email={email} onSignedOut={onSignedOut} />
      </div>
    </div>
  );
}
