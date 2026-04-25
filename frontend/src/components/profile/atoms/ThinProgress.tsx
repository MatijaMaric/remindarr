import { cn } from "@/lib/utils";

interface ThinProgressProps {
  value: number;
  max: number;
  color?: string;
  height?: number;
  className?: string;
}

export function ThinProgress({
  value,
  max,
  color = "#fbbf24",
  height = 4,
  className,
}: ThinProgressProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={cn("rounded-full overflow-hidden bg-white/[0.08]", className)}
      style={{ height: `${height}px` }}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
