import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FormFieldProps
  extends Omit<React.ComponentProps<"input">, "id"> {
  id: string;
  label: string;
  error?: string;
}

export function FormField({
  id,
  label,
  error,
  className,
  ...props
}: FormFieldProps) {
  return (
    <div className="space-y-2 flex flex-col">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(error && "border-[#b91c1c] focus-visible:border-[#b91c1c] focus-visible:ring-[#b91c1c]/30", className)}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-[13px] leading-snug text-[#b91c1c]">
          {error}
        </p>
      )}
    </div>
  );
}
