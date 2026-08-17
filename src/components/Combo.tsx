"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// A dropdown that also accepts anything typed. Suggestions narrow as you type,
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
  // Narrowing belongs to typing, not to opening. Pressing the arrow on a field
  // that already reads "Received" is asking what else there is; filtering by
  // what is in the box answers with the one thing you were trying to change,
  // and the only way out was to erase it first.
  const [typing, setTyping] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!typing || !q) return options;
    const hit = options.filter((o) => o.toLowerCase().includes(q));
    return hit.length ? hit : options;
  }, [typing, value, options]);

  const show = (on: boolean) => {
    setTyping(false);
    setOpen(on);
  };

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) show(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Open on a long list — 43 sieve sizes — and the current choice may be well
  // out of sight. Bring it into the middle, scrolling the list itself rather
  // than the page under it.
  useEffect(() => {
    if (!open) return;
    const here = list.current?.querySelector<HTMLElement>("button.on");
    if (!here || !list.current) return;
    list.current.scrollTop =
      here.offsetTop - list.current.clientHeight / 2 + here.offsetHeight / 2;
  }, [open, matches]);

  return (
    <div className="combo" ref={box}>
      <input
        className="combo-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setTyping(true); setOpen(true); }}
        onFocus={() => show(true)}
        onKeyDown={(e) => { if (e.key === "Escape") show(false); }}
      />
      <button
        type="button"
        className="combo-toggle"
        aria-label="Show options"
        onClick={() => show(!open)}
      >
        ▾
      </button>
      {open && matches.length > 0 && (
        <div className="combo-list" ref={list}>
          {matches.map((o) => (
            <button
              key={o}
              type="button"
              className={o === value ? "on" : ""}
              onClick={() => { onChange(o); show(false); }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
