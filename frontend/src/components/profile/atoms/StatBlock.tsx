interface StatBlockProps {
  value: string | number;
  label: string;
  sub?: string;
}

export function StatBlock({ value, label, sub }: StatBlockProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[28px] font-extrabold tracking-[-0.028em] leading-none text-foreground">
        {value}
      </div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
