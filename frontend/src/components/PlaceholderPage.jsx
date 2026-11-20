export default function PlaceholderPage({
  eyebrow,
  title,
  description,
  icon: Icon,
  planned = [],
  note,
}) {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">{description}</p>
      </header>

      <div className="card p-6 sm:p-10">
        <div className="mx-auto max-w-lg text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-forest-50 text-forest-700">
            <Icon size={26} />
          </span>
          <h2 className="mt-4 text-lg font-bold tracking-tight text-ink">The shell is ready</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            {note ||
              "This workspace is connected to the same secure backend, access rules and audit trail as the rest of the EMR."}
          </p>
        </div>

        {planned.length > 0 && (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-dashed border-line bg-canvas/60 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Coming next</p>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {planned.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
