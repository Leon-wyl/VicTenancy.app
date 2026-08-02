"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import { GoogleButton } from "@/components/auth/google-button";

export function LoginForm({
  next,
  authError,
}: {
  next: string;
  authError?: "callback_failed";
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    authError ? "We couldn't complete sign-in. Please try again." : null,
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await createClient().auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      setError("Incorrect email or password.");
      return;
    }

    router.replace(next);
    router.refresh();
  }

  const nextParam = encodeURIComponent(next);

  return (
    <div className="space-y-5">
      <GoogleButton next={next} />

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
          autoComplete="current-password"
          required
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div
          role="alert"
          aria-live="polite"
          className="min-h-[20px] text-[13px] leading-snug text-[#b91c1c]"
        >
          {error}
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <Link
          href={`/signup?next=${nextParam}`}
          className="font-medium text-ink/70 underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Create an account
        </Link>
        <Link
          href={`/forgot-password?next=${nextParam}`}
          className="font-medium text-ink/70 underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
