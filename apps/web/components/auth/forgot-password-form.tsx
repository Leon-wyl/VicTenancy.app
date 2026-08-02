"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";

export function ForgotPasswordForm({ next }: { next: string }) {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/update-password")}`,
    });

    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-mint/15">
          <CheckCircle2 className="h-6 w-6 text-mint" aria-hidden="true" />
        </div>
        <p className="text-sm leading-relaxed text-ink/70">
          If an account exists for{" "}
          <span className="font-medium text-ink">{email || "that email"}</span>,
          we&apos;ve sent a link to reset your password. Check your inbox and
          follow the link to choose a new password.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="inline-block text-sm font-medium text-ink/70 underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Sending link…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-ink/60">
        Remembered it?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-ink/70 underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
