"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import { GoogleButton } from "@/components/auth/google-button";

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState(false);

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

    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/app")}`,
      },
    });

    setLoading(false);

    if (error) {
      setError("We couldn't create your account. Please try again.");
      return;
    }

    if (data.session) {
      router.replace("/app");
      router.refresh();
      return;
    }

    setConfirmation(true);
  }

  if (confirmation) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-mint/15">
          <CheckCircle2 className="h-6 w-6 text-mint" aria-hidden="true" />
        </div>
        <p className="text-sm leading-relaxed text-ink/70">
          We&apos;ve sent a confirmation link to{" "}
          <span className="font-medium text-ink">{email}</span>. Open it to
          verify your account and start asking your tenancy questions.
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
    <div className="space-y-5">
      <GoogleButton next={next} label="Sign up with Google" />

      <div className="relative flex items-center gap-3">
        <div className="h-px flex-1 bg-ink/10" />
        <span className="text-xs text-ink/40">or</span>
        <div className="h-px flex-1 bg-ink/10" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormField
          id="confirm"
          label="Confirm password"
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
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-ink/60">
        Already have an account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-ink/70 underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
