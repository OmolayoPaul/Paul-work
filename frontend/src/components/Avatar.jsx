import { initials } from "../lib/format";

const SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
};

export default function Avatar({ name = "", src, size = "md" }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${SIZES[size]} shrink-0 rounded-full object-cover ring-2 ring-white/20`}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className={`${SIZES[size]} grid shrink-0 place-items-center rounded-full bg-forest-100 font-bold uppercase text-forest-800 ring-2 ring-white/20`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
