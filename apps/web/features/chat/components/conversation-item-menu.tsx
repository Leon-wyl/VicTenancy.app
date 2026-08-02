"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useChat } from "../chat-provider";
import { ApiError } from "../api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ConversationItemMenu({
  conversationId,
  title,
  isActive,
  onStartRename,
}: {
  conversationId: string;
  title: string;
  isActive: boolean;
  onStartRename: () => void;
}) {
  const router = useRouter();
  const { remove } = useChat();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await remove(conversationId);
      setConfirmOpen(false);
      if (isActive) {
        router.push("/app");
      }
    } catch (e) {
      setError(
        e instanceof ApiError && e.isRateLimited
          ? "Request limit reached — please try again shortly."
          : "Couldn't delete this conversation. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${title}`}
            className="rounded p-1 text-ink/35 opacity-0 transition-opacity hover:bg-ink/5 hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="w-44">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onStartRename();
            }}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setConfirmOpen(true);
            }}
            className="text-[#b91c1c] focus:bg-[#b91c1c]/5"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{title}&rdquo; and all of its messages will be permanently
            removed. This can&rsquo;t be undone.
          </AlertDialogDescription>
          {error && (
            <p role="alert" className="mt-2 text-xs text-[#b91c1c]">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-[#b91c1c] text-white hover:bg-[#b91c1c]/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
