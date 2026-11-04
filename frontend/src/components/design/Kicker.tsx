import { cn } from "@/lib/utils";

interface KickerProps {
  children: React.ReactNode;
  className?: string;
}

export function Kicker({ children, className }: KickerProps) {
  return (
    <div className={cn("text-sm font-medium text-zinc-500 mb-1", className)}>
      {children}
    </div>
  );
}
