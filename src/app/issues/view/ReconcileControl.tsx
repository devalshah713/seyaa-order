"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ISSUE_STATUSES, ISSUE_STATUS_LABELS } from "@/lib/diamondIssueConfig";

type LineInput = {
  label: string;
  carats: string;
  diaCtsUsed: string;
  diaPcsUsed: string;
};

export default function ReconcileControl({
  memoNo,
  currentStatus,
  receivedDate,
  lines,
}: {
  memoNo: string;
  currentStatus: string;
  receivedDate: string;
  lines: LineInput[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState(currentStatus === "ISSUED" ? "RECEIVED" : currentStatus);
  const [received, setReceived] = useState(receivedDate || "");
  const [used, setUsed] = useState(
    lines.map((ln) => ({ ctsUsed: ln.diaCtsUsed, pcsUsed: ln.diaPcsUsed }))
  );

  function setCell(i: number, field: "ctsUsed" | "pcsUsed", value: string) {
    setUsed((prev) => prev.map((u, idx) => (idx === i ? { ...u, [field]: value } : u)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/issues", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoNo, status, receivedDate: received, used }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to save.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="row no-print" style={{ marginTop: 16 }}>
        <button type="button" className="btn gold" onClick={() => setOpen(true)}>
          Reconcile / Record Return
        </button>
        <button type="button" className="btn ghost" onClick={() => window.print()}>
          Print
        </button>
      </div>
    );
  }

  return (
    <div className="card no-print" style={{ marginTop: 16 }}>
      <h2>Record Return</h2>
      {error && (
        <div className="card" style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }}>
          {error}
        </div>
      )}

      <div className="grid2">
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ISSUE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Received date</label>
          <input
            type="text"
            value={received}
            placeholder="dd/mm/yyyy"
            onChange={(e) => setReceived(e.target.value)}
          />
        </div>
      </div>

      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>Carats issued</th>
              <th>Cts Used</th>
              <th>Pcs Used</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((ln, i) => (
              <tr key={i}>
                <td>{ln.label}</td>
                <td className="muted">{ln.carats || "—"}</td>
                <td>
                  <input
                    type="number"
                    step="any"
                    value={used[i].ctsUsed}
                    onChange={(e) => setCell(i, "ctsUsed", e.target.value)}
                    style={{ width: 110 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    value={used[i].pcsUsed}
                    onChange={(e) => setCell(i, "pcsUsed", e.target.value)}
                    style={{ width: 110 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn gold" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
