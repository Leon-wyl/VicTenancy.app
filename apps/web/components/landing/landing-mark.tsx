import { cn } from "@/lib/utils";

export function LandingMark({
  className,
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width="26"
        height="26"
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          width="32"
          height="32"
          rx="7"
          fill={inverted ? "#faf9f6" : "#070b0a"}
        />
        <path
          d="M8 9.5h3.2l4.8 9.6 4.8-9.6H24l-7.4 14h-1.2z"
          fill="#5ed29c"
        />
      </svg>
      <span className="font-display text-[15px] font-bold tracking-tight">
        VicTenancy
      </span>
    </span>
  );
}
