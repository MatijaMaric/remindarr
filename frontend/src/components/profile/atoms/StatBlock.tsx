interface StatBlockProps {
  value: string | number;
  label: string;
  sub?: string;
}

export function StatBlock({ value, label, sub }: StatBlockProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[28px] font-extrabold tracking-[-0.028em] leading-none text-zinc-100">
        {value}
      </div>
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      {sub && <div className="text-[11px] text-zinc-400">{sub}</div>}
    </div>
  );
}
