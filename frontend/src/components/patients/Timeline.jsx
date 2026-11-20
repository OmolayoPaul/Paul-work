import {
  Activity,
  AlertTriangle,
  ClipboardList,
  FlaskConical,
  Paperclip,
  Pill,
  Stethoscope,
} from "lucide-react";

import { formatDateTime } from "../../lib/format";

const META = {
  vitals: { icon: Activity, tone: "bg-forest-50 text-forest-700" },
  note: { icon: Stethoscope, tone: "bg-accent-soft text-forest-700" },
  diagnosis: { icon: ClipboardList, tone: "bg-slate-100 text-slate-700" },
  prescription: { icon: Pill, tone: "bg-amber-50 text-amber-700" },
  lab: { icon: FlaskConical, tone: "bg-sky-50 text-sky-700" },
  allergy: { icon: AlertTriangle, tone: "bg-red-50 text-red-700" },
  attachment: { icon: Paperclip, tone: "bg-slate-100 text-slate-600" },
};

const NOTE_SECTIONS = [
  ["subjective", "Subjective"],
  ["objective", "Objective"],
  ["assessment", "Assessment"],
  ["plan", "Plan"],
];

export default function Timeline({ entries, emptyHint }) {
  if (!entries.length) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-[13px] font-semibold text-ink">Nothing recorded in this view yet</p>
        <p className="mx-auto mt-1 max-w-xs text-[12px] leading-relaxed text-ink-muted">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-0">
      {entries.map((entry) => {
        const meta = META[entry.kind] || META.note;
        const Icon = meta.icon;
        return (
          <li key={`${entry.kind}-${entry.id}`} className="relative flex gap-3 px-4 py-3.5 sm:px-5">
            <span className="absolute left-[29px] top-0 h-full w-px bg-line sm:left-[33px]" aria-hidden="true" />
            <span className={`relative z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${meta.tone}`}>
              <Icon size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[12.5px] font-semibold text-ink">{entry.title}</p>
                <p className="text-[11px] text-ink-muted">{formatDateTime(entry.at)}</p>
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">{entry.summary}</p>

              {entry.kind === "note" && (
                <dl className="mt-2 grid gap-1.5 rounded-lg bg-canvas/70 p-2.5 text-[11.5px] leading-relaxed">
                  {NOTE_SECTIONS.filter(([key]) => entry.meta?.[key]).map(([key, label]) => (
                    <div key={key} className="flex gap-2">
                      <dt className="w-20 shrink-0 font-semibold text-ink-muted">{label}</dt>
                      <dd className="text-ink-soft">{entry.meta[key]}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {entry.kind === "prescription" && entry.meta?.items?.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-lg bg-canvas/70 p-2.5 text-[11.5px] text-ink-soft">
                  {entry.meta.items.map((item, index) => (
                    <li key={`${item.drug_name}-${index}`} className="flex flex-wrap gap-x-2">
                      <span className="font-semibold text-ink">{item.drug_name}</span>
                      <span>{[item.dose, item.frequency, item.duration].filter(Boolean).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              )}

              {entry.kind === "lab" && entry.meta?.result_summary && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-sky-50 p-2.5 text-[11.5px] leading-relaxed text-sky-900">
                  <span className="font-semibold">Result</span>
                  <span className="block">{entry.meta.result_summary}</span>
                </p>
              )}

              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
                {entry.author && <span className="font-medium text-ink-soft">{entry.author}</span>}
                {entry.kind === "lab" && entry.meta?.resulted_by_name && (
                  <span className="text-ink-muted">· result by {entry.meta.resulted_by_name}</span>
                )}
                {entry.kind === "lab" && entry.meta?.status && (
                  <span className="chip bg-sky-50 px-2 py-0.5 text-sky-700">{entry.meta.status.replace("_", " ")}</span>
                )}
                {entry.kind === "prescription" && entry.meta?.status && (
                  <span className="chip bg-amber-50 px-2 py-0.5 text-amber-700">{entry.meta.status}</span>
                )}
                {entry.kind === "prescription" && entry.meta?.dispensed_by_name && (
                  <span className="text-ink-muted">· dispensed by {entry.meta.dispensed_by_name}</span>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
