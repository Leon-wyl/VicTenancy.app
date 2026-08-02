import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AuthCard } from "@/components/auth/auth-card";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { Button } from "@/components/ui/button";

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthCard
        title="Choose a new password"
        description="This password-reset link is invalid or has expired."
      >
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-ink/60">
            For security, reset links expire after a short time. Request a new
            link and we&apos;ll send it to your email.
          </p>
          <Button asChild className="w-full">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      description="Set a new password for your VicTenancy account."
    >
      <UpdatePasswordForm />
    </AuthCard>
  );
}
