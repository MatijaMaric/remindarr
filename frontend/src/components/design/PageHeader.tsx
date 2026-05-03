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
        "pt-4 pb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3",
        className
      )}
    >
      <div className="min-w-0">
        <Kicker>{kicker}</Kicker>
        <h1 className="text-4xl md:text-[44px] font-extrabold tracking-[-0.03em] leading-none text-zinc-100">
          {title}
        </h1>
      </div>
      {right && (
        <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
          {right}
        </div>
      )}
    </div>
  );
}
