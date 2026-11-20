export default function LoginArtwork() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden p-10 xl:p-14 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(130%_120%_at_12%_8%,#1C8355_0%,#0C3A29_46%,#062318_100%)]" />
      <div className="pointer-events-none absolute -right-28 -top-28 h-[440px] w-[440px] rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -right-6 top-12 h-[300px] w-[300px] rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -right-2 top-40 h-[170px] w-[170px] rounded-full bg-accent/10 blur-xl" />
      <div className="pointer-events-none absolute -bottom-36 -left-24 h-[420px] w-[420px] rounded-full bg-accent/10 blur-3xl" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]" aria-hidden="true">
        <defs>
          <pattern id="emr-grid" width="38" height="38" patternUnits="userSpaceOnUse">
            <path d="M38 0H0V38" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#emr-grid)" />
      </svg>

      <div className="relative mt-10 max-w-sm rounded-2xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-[13px] font-bold text-forest-950">
            AO
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Amaka Obi</p>
            <p className="truncate text-[11px] text-white/60">AFD/2026/0412 · Female · 34 yrs</p>
          </div>
          <span className="chip ml-auto shrink-0 bg-white/10 text-[10px] text-white/80">Checked in</span>
        </div>

        <div className="mt-4 space-y-2">
          <div className="h-2 w-3/4 rounded-full bg-white/20" />
          <div className="h-2 w-1/2 rounded-full bg-white/15" />
        </div>

        <div className="mt-4 rounded-xl bg-forest-950/40 p-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-white/40">
            <span>Vitals</span>
            <span className="text-accent">Stable</span>
          </div>
          <svg
            viewBox="0 0 220 40"
            className="mt-1 h-10 w-full text-accent"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M0 22h30l8-14 10 26 9-18 7 10h26l8-12 9 20 8-14h25l7 8h23" />
          </svg>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip bg-white/10 text-[10px] text-white/75">Vitals recorded</span>
          <span className="chip bg-accent/15 text-[10px] text-accent">Lab result ready</span>
        </div>
      </div>

      <div className="relative mt-10 max-w-md">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Afridetect EMR</p>
        <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight xl:text-[34px]">
          One clinical record, from triage to pharmacy.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          Worklists, notes, orders and results in one place — built for busy Nigerian hospitals and clinics.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-white/50">
          <span>Role-based access</span>
          <span>Immutable audit trail</span>
          <span>15-minute auto sign-out</span>
        </div>
      </div>
    </div>
  );
}
