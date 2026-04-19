import { Kicker } from "./Kicker";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  kicker: string;
  title: string;
  right?: React.ReactNode;
  className?: string;
}

export function PageHeader({ kicker, title, right, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "px-6 md:px-16 pt-10 pb-6 flex items-end justify-between gap-4",
        className
      )}
    >
      <div>
        <Kicker>{kicker}</Kicker>
        <h1 className="text-4xl md:text-[44px] font-extrabold tracking-[-0.03em] leading-none text-zinc-100">
          {title}
        </h1>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}
