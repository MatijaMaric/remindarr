export function RatingBadge({
  label,
  score,
  max = 10,
}: {
  label: string;
  score: number | null | undefined;
  max?: number;
}) {
  if (score === null || score === undefined) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-[0.1em]">{label}</span>
      <span className="text-[22px] font-bold text-white leading-none">
        {score.toFixed(1)}
        <span className="text-sm text-zinc-500">/{max}</span>
      </span>
    </div>
  );
}
