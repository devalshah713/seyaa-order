"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ORDER_STATUSES, STATUS_LABELS } from "@/lib/formConfig";

export default function StatusControl({
  orderNumber,
  current,
}: {
  orderNumber: string;
  current: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(current);
  const [saving, setSaving] = useState(false);

  async function change(value: string) {
    setStatus(value);
    setSaving(true);
    // Order number is sent in the body (handles spaces/symbols safely).
    await fetch(`/api/orders`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber, status: value }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="row">
      <select
        value={status}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        style={{ width: "auto" }}
      >
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <button type="button" className="btn ghost" onClick={() => window.print()}>
        Print
      </button>
    </div>
  );
}
