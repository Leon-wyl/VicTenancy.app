"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const { error } = await createClient().auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError("We couldn't update your password. Please try again.");
      return;
    }

    router.replace("/app");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        placeholder="At least 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <FormField
        id="confirm"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        placeholder="Re-enter your password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={confirm && confirm !== password ? "Passwords do not match." : undefined}
      />

      <div
        role="alert"
        aria-live="polite"
        className="min-h-[20px] text-[13px] leading-snug text-[#b91c1c]"
      >
        {error}
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Updating password…" : "Update password"}
      </Button>
    </form>
  );
}
