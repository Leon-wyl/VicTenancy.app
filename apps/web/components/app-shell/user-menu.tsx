"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

function getInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[^a-zA-Z]/g, "");
  if (!cleaned) return "?";
  return cleaned.slice(0, 2).toUpperCase();
}

export function UserMenu({
  email,
  onSignedOut,
}: {
  email: string;
  onSignedOut?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSignOut() {
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signOut();
    setLoading(false);
    if (error) {
      setError("Couldn't sign out. Please try again.");
      return;
    }
    onSignedOut?.();
    router.replace("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint text-[13px] font-bold text-ink"
            aria-hidden="true"
          >
            {getInitials(email)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">
              {email || "Account"}
            </span>
            <span className="block text-xs text-ink/45">Signed in</span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-ink/40"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="w-[240px]"
      >
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {error && (
          <p
            aria-live="polite"
            className="px-2.5 py-1.5 text-xs leading-snug text-[#b91c1c]"
          >
            {error}
          </p>
        )}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleSignOut();
          }}
          disabled={loading}
          className="text-[#b91c1c] focus:bg-[#b91c1c]/5"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {loading ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
