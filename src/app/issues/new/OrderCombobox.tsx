"use client";

import { useState, useRef, useEffect } from "react";

export type OrderOption = { orderNumber: string; customerName: string; product: string };

// A lightweight searchable dropdown (combobox) for picking an order. Built to
// stay fast with hundreds of orders: filtering is plain string matching and we
// only render the first N matches. No external dependency.
export default function OrderCombobox({
  orders,
  value,
  onSelect,
  loading,
}: {
  orders: OrderOption[];
  value: string;
  onSelect: (orderNumber: string) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const needle = query.trim().toLowerCase();
  const filtered = (needle
    ? orders.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(needle) ||
          o.customerName.toLowerCase().includes(needle) ||
          o.product.toLowerCase().includes(needle)
      )
    : orders
  ).slice(0, 50);

  function choose(orderNumber: string) {
    onSelect(orderNumber);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="combo" ref={wrapRef}>
      <input
        type="text"
        value={open ? query : value}
        placeholder={loading ? "Loading orders…" : "Search order # or customer…"}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
      />
      {value && !open && (
        <button
          type="button"
          className="combo-clear"
          aria-label="Clear"
          onClick={() => onSelect("")}
        >
          ×
        </button>
      )}
      {open && (
        <div className="combo-panel">
          {filtered.length === 0 ? (
            <div className="combo-empty">No matching orders</div>
          ) : (
            filtered.map((o) => (
              <button
                type="button"
                key={o.orderNumber}
                className={`combo-item${o.orderNumber === value ? " selected" : ""}`}
                onClick={() => choose(o.orderNumber)}
              >
                <span className="combo-num">{o.orderNumber}</span>
                {(o.customerName || o.product) && (
                  <span className="combo-sub">
                    {[o.customerName, o.product].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            ))
          )}
          {needle && orders.length > filtered.length && (
            <div className="combo-more">Keep typing to narrow down…</div>
          )}
        </div>
      )}
    </div>
  );
}
