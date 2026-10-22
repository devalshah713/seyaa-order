"use client";
// The owner's two boxes: who is making it, and the design number he gives it.
//
// Hidden from everybody else, and refused for everybody else by the API as
// well — hiding a box only stops the people who were never going to try.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Picker from "@/components/Picker";
import { readReply } from "@/lib/readReply";

export default function OrderAssign({
  id,
  mfg,
  designNo,
  mfgs,
  isAdmin,
}: {
  id: string;
  mfg: string;
  designNo: string;
  mfgs: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [m, setM] = useState(mfg);
  const [d, setD] = useState(designNo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // What is already assigned is worth reading whoever is looking: the factory
  // floor needs to know where a piece went. Only changing it is the owner's.
  if (!isAdmin) {
    if (!mfg && !designNo) return null;
    return (
      <div className="ord-assign">
        <h2>Assigned</h2>
        {mfg && <div className="ord-row"><span>Manufacturer</span><strong>{mfg}</strong></div>}
        {designNo && <div className="ord-row"><span>Design number</span><strong>{designNo}</strong></div>}
      </div>
    );
  }

  async function save() {
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfg: m, designNo: d }),
      });
      await readReply(res, "Could not save.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ord-assign">
      <h2>Assign</h2>
      <p className="group-hint">Only an admin sees these two boxes.</p>
      <div className="two">
        <label className="field"><span>Manufacturer</span>
          <Picker value={m} onChange={setM} options={mfgs} prompt="Choose a manufacturer…" />
        </label>
        <label className="field"><span>Design number</span>
          <input value={d} onChange={(e) => setD(e.target.value)} placeholder="SN-BR-AMF-41" />
        </label>
      </div>
      {mfgs.length === 0 && (
        <p className="dia-note">
          No manufacturers on the list yet — add them under Lists.
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      {saved && <span className="hint" style={{ marginLeft: 10 }}>Saved.</span>}
      {error && <p className="save-error">{error}</p>}
    </div>
  );
}
