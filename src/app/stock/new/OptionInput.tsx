"use client";

import { useRef, useState, useEffect } from "react";

// A field that lets you type a value OR pick from existing options via a
// reliable click-to-open dropdown (not a native <datalist>, which renders
// inconsistently). When the typed value is new, it offers to save it as an
// option for next time. Used for Gold Details, Location, Inch Size, Sieve, etc.
export default function OptionInput({
  value,
  onChange,
  options,
  items,
  onSaveNew,
  placeholder,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  // Optional rich options: shown as `label` in the list, but selecting stores
  // `value` (e.g. the bare product code). Takes precedence over `options`.
  items?: { value: string; label: string }[];
  onSaveNew?: (v: string) => Promise<void> | void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const list: { value: string; label: string }[] = items ?? options.map((o) => ({ value: o, label: o }));
  const trimmed = value.trim();
  const q = trimmed.toLowerCase();
  const exists = list.some((it) => it.value.toLowerCase() === q);
  const canSave = !!onSaveNew && trimmed !== "" && !exists;
  // While typing a new value, narrow the list; once it matches a value exactly
  // (or is empty), show the full list so the arrow always reveals everything.
  const filtered = (q && !exists
    ? list.filter((it) => it.label.toLowerCase().includes(q) || it.value.toLowerCase().includes(q))
    : list
  ).slice(0, 200);

  async function save() {
    if (!onSaveNew) return;
    setSaving(true);
    try {
      await onSaveNew(trimmed);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  return (
    <div className="combo" ref={wrapRef} style={{ display: "inline-block", width: "100%", ...style }}>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{ width: "100%", paddingRight: 26 }}
      />
      <button
        type="button"
        className="combo-toggle"
        aria-label="Show options"
        tabIndex={-1}
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
      >
        ▾
      </button>
      {open && (
        <div className="combo-panel" style={items ? { minWidth: 300 } : undefined}>
          {filtered.map((it) => (
            <button
              type="button"
              key={it.value}
              className={`combo-item${it.value.toLowerCase() === q ? " selected" : ""}`}
              onClick={() => { onChange(it.value); setOpen(false); }}
            >
              {it.label}
            </button>
          ))}
          {canSave && (
            <button type="button" className="combo-item" disabled={saving} onClick={save} style={{ color: "var(--gold-strong, #92400e)", fontWeight: 600 }}>
              {saving ? "Saving…" : `＋ Save “${trimmed}” as an option`}
            </button>
          )}
          {filtered.length === 0 && !canSave && <div className="combo-empty">No options</div>}
        </div>
      )}
    </div>
  );
}
