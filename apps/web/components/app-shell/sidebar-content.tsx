"use client";

import Link from "next/link";
import { Plus, MessageSquare } from "lucide-react";
import { LandingMark } from "@/components/landing/landing-mark";
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
        <div className="flex items-center gap-2.5 rounded-lg border border-ink/10 px-3 py-2.5">
          <Plus className="h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
          <span className="text-sm font-medium text-ink/50">
            New conversation
          </span>
          <span className="ml-auto rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/40">
            Step 18
          </span>
        </div>
      </div>

      <nav
        aria-label="Recent conversations"
        className="mt-6 flex-1 overflow-y-auto px-3"
        style={{ overscrollBehavior: "contain" }}
      >
        <p className="px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/40">
          Recent conversations
        </p>
        <div className="mt-3 flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink/35">
          <MessageSquare
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>No conversations yet</span>
        </div>
      </nav>

      <div
        className="border-t border-ink/10 p-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <UserMenu email={email} onSignedOut={onSignedOut} />
      </div>
    </div>
  );
}
