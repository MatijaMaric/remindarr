import { cn } from "@/lib/utils";

interface KickerProps {
  children: React.ReactNode;
  className?: string;
  color?: "amber" | "zinc";
}

export function Kicker({ children, className, color = "amber" }: KickerProps) {
  return (
    <div
      className={cn(
        "font-mono text-[11px] font-semibold uppercase tracking-[0.15em] mb-3",
        color === "amber" ? "text-amber-400" : "text-zinc-500",
        className
      )}
    >
      {children}
    </div>
  );
}
