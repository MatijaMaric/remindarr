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
        "inline-block font-mono text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded",
        variant === "default" && "bg-white/[0.08] text-zinc-300",
        variant === "amber" && "bg-amber-400 text-black",
        variant === "outline" && "bg-transparent border border-amber-400/40 text-amber-400",
        className
      )}
    >
      {children}
    </span>
  );
}
