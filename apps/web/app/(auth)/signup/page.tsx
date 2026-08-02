import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { safeRedirectPath } from "@/lib/auth/redirect";

export default async function SignupPage({
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
      title="Create your workspace"
      description="Create an account to ask questions grounded in Victorian tenancy law and official sources."
    >
      <SignupForm next={next} />
    </AuthCard>
  );
}
