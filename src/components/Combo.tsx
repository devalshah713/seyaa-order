"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// A dropdown that also accepts anything typed. Suggestions filter as you type,
// but the field never rejects a new value — the PD team is never blocked by a
// missing option. (Deliberately not a native <datalist>, which behaved
// inconsistently across browsers in this app before.)
export default function Combo({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    const hit = options.filter((o) => o.toLowerCase().includes(q));
    return hit.length ? hit : options;
  }, [value, options]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="combo" ref={box}>
      <input
        className="combo-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      />
      <button
        type="button"
        className="combo-toggle"
        aria-label="Show options"
        onClick={() => setOpen((o) => !o)}
      >
        ▾
      </button>
      {open && matches.length > 0 && (
        <div className="combo-list">
          {matches.map((o) => (
            <button
              key={o}
              type="button"
              className={o === value ? "on" : ""}
              onClick={() => { onChange(o); setOpen(false); }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
