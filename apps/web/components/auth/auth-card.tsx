import * as React from "react";
import { cn } from "@/lib/utils";

export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full max-w-[420px] rounded-2xl border border-ink/10 bg-warm-white p-8 shadow-[0_1px_2px_rgba(7,11,10,0.04)]",
        className,
      )}
    >
      {title && (
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            {title}
          </h1>
          {description && (
            <p className="text-sm leading-relaxed text-ink/60">{description}</p>
          )}
        </div>
      )}
      <div className={cn(title && "mt-6")}>{children}</div>
      {footer && (
        <div className="mt-6 border-t border-ink/10 pt-5 text-center text-sm text-ink/60">
          {footer}
        </div>
      )}
    </div>
  );
}
