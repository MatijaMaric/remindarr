import { cn } from "@/lib/utils";

interface PillProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Pill({ children, active, onClick, className }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
        active
          ? "bg-amber-400 text-black border-transparent"
          : "bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.08]",
        className
      )}
    >
      {children}
    </button>
  );
}
