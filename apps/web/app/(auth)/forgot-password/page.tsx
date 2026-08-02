import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { safeRedirectPath } from "@/lib/auth/redirect";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const next = safeRedirectPath(
    typeof sp.next === "string" ? sp.next : null,
  );

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we'll send you a link to choose a new password."
    >
      <ForgotPasswordForm next={next} />
    </AuthCard>
  );
}
