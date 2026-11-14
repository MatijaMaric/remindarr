import { cn } from "@/lib/utils";

interface PillProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Pill({ children, active, onClick, className, ref }: PillProps) {
  return (
    <button
      type="button"
      ref={ref}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 pointer-coarse:py-[9px] text-xs font-semibold whitespace-nowrap transition-colors",
        active
          ? "bg-primary text-primary-foreground border-transparent"
          : "bg-fill-subtle border border-border text-foreground-secondary hover:text-foreground hover:bg-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}
