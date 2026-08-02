import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-ink/15 bg-warm-white px-3 py-2 text-sm text-ink shadow-sm transition-colors duration-150 placeholder:text-ink/40 disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:outline-none focus-visible:border-mint focus-visible:ring-2 focus-visible:ring-mint/40",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
