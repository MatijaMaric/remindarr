import { cn } from "@/lib/utils";

interface ChipProps {
  children: React.ReactNode;
  variant?: "default" | "amber" | "outline";
  className?: string;
}

export function Chip({ children, variant = "default", className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-block text-[11px] font-semibold px-2 py-0.5 rounded-sm",
        variant === "default" && "bg-accent text-foreground-secondary",
        variant === "amber" && "bg-primary text-primary-foreground",
        variant === "outline" &&
          "bg-transparent border border-primary-border text-primary-text",
        className,
      )}
    >
      {children}
    </span>
  );
}
