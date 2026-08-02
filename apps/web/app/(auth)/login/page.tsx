import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { safeRedirectPath } from "@/lib/auth/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const next = safeRedirectPath(
    typeof sp.next === "string" ? sp.next : null,
  );
  const authError =
    sp.auth_error === "callback_failed" ? "callback_failed" : undefined;

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to ask about your lease, notices, bond, or repairs."
    >
      <LoginForm next={next} authError={authError} />
    </AuthCard>
  );
}
