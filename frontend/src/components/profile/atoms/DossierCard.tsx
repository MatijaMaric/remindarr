import { cn } from "@/lib/utils";

interface DossierCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
}

export function DossierCard({ children, className, padding = "md" }: DossierCardProps) {
  return (
    <div
      className={cn(
        "bg-zinc-900 border border-white/[0.06] rounded-xl",
        padding === "sm" && "p-3",
        padding === "md" && "p-[18px]",
        padding === "lg" && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
