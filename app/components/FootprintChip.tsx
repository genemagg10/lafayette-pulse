export default function FootprintChip({
  score,
  label = "Board footprint",
}: {
  score: number;
  label?: string;
}) {
  return (
    <span
      className="flex-shrink-0 text-[10px] font-heading tabular-nums px-1.5 py-0.5 bg-forest-soft text-forest-700 border border-line"
      title={label}
    >
      {score}
    </span>
  );
}
