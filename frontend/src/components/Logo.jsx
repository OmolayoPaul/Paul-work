export default function Logo({ tone = "dark", compact = false }) {
  const onDark = tone === "light";
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-[#04231A] shadow-[0_8px_20px_-8px_rgba(34,197,94,0.85)]">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      {!compact && (
        <span className="leading-tight">
          <span
            className={`block text-[15px] font-bold tracking-tight ${onDark ? "text-white" : "text-ink"}`}
          >
            Afridetect
          </span>
          <span
            className={`block text-[10px] font-semibold uppercase tracking-[0.22em] ${
              onDark ? "text-white/55" : "text-ink-muted"
            }`}
          >
            EMR
          </span>
        </span>
      )}
    </div>
  );
}
