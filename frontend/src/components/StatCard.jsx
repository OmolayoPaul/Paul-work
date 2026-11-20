const TONES = {
  forest: "bg-forest-50 text-forest-700",
  accent: "bg-accent-soft text-forest-700",
  amber: "bg-amber-50 text-amber-600",
  slate: "bg-slate-100 text-slate-600",
};

export default function StatCard({ icon: Icon, label, value, hint, tone = "forest" }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-ink-muted">{hint}</p>}
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONES[tone] || TONES.forest}`}>
          <Icon size={19} />
        </span>
      </div>
    </div>
  );
}
