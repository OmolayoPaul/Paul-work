export default function ConfidenceChip({ confidence }) {
  if (!confidence) return null;
  const tone =
    confidence === "high"
      ? "bg-forest-50 text-forest-700"
      : confidence === "medium"
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";
  return (
    <span className={`chip px-1.5 py-0.5 text-[10px] ${tone}`} title={`AI confidence: ${confidence}`}>
      {confidence}
    </span>
  );
}
