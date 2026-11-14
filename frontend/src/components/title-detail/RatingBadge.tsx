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
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-[22px] font-bold text-foreground leading-none">
        {score.toFixed(1)}
        <span className="text-sm text-muted-foreground">/{max}</span>
      </span>
    </div>
  );
}
