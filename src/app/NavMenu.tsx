"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

// Single source of truth for the top-bar navigation. To add a new module,
// just add one line here (set adminOnly: true to restrict it to admins).
type Module = { label: string; href: string; adminOnly?: boolean };
const MODULES: Module[] = [
  { label: "All Orders", href: "/" },
  { label: "New Order", href: "/orders/new" },
  { label: "Diamond Issue", href: "/issues" },
  { label: "New Diamond Issue", href: "/issues/new" },
  { label: "Export Diamond Issues", href: "/issues/export" },
  { label: "Jewellery In", href: "/jewellery-in" },
  { label: "Record Jewellery In", href: "/jewellery-in/new" },
  { label: "Diamond Return Log", href: "/jewellery-in/returns" },
  { label: "Audit Trail", href: "/audit" },
  { label: "Team", href: "/admin/team", adminOnly: true },
];

export default function NavMenu({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const items = MODULES.filter((m) => !m.adminOnly || isAdmin);

  return (
    <div className="nav-menu" ref={wrapRef}>
      <button
        type="button"
        className="btn ghost small"
        style={{ color: "#fff", borderColor: "#3f3f46" }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        ☰ Menu
      </button>
      {open && (
        <div className="nav-menu-panel" onClick={() => setOpen(false)}>
          {items.map((m) => (
            <Link key={m.href} href={m.href} className="nav-menu-item">
              {m.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
