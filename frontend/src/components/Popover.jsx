import { useEffect, useRef, useState } from "react";

export default function Popover({ trigger, children, width = "w-64", align = "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((value) => !value), close: () => setOpen(false) })}
      {open && (
        <div
          className={`absolute ${align === "right" ? "right-0" : "left-0"} z-50 mt-2 ${width} rounded-2xl border border-line bg-white p-2 shadow-xl shadow-forest-900/10`}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}
