"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin-only "delete this order" control for the All Orders table. Deleting is
// irreversible (it removes the order and its diamond records from the Google
// Sheet), so the button asks for an explicit inline confirmation before firing.
export default function DeleteOrderButton({
  orderNumber,
  customerName,
}: {
  orderNumber: string;
  customerName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to delete.");
        setBusy(false);
        return;
      }
      // Gone — refresh the list so the row disappears.
      router.refresh();
    } catch {
      setError("Failed to delete.");
      setBusy(false);
    }
  }

  if (error) {
    return (
      <span className="row" style={{ gap: 6, color: "#dc2626", fontSize: 13 }}>
        {error}
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            setError(null);
            setConfirming(false);
          }}
        >
          Dismiss
        </button>
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="row" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          Delete {orderNumber}?
        </span>
        <button
          type="button"
          className="btn small"
          style={{ background: "#dc2626", color: "#fff" }}
          disabled={busy}
          onClick={doDelete}
        >
          {busy ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          className="btn ghost small"
          disabled={busy}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="btn ghost small"
      style={{ color: "#dc2626", borderColor: "#fecaca" }}
      title={`Delete order ${orderNumber} (${customerName})`}
      onClick={() => setConfirming(true)}
    >
      Delete
    </button>
  );
}
