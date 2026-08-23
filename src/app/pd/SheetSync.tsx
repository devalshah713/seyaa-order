"use client";
import { useEffect, useState } from "react";

// The design-number register in a Google Sheet, and the state of it.
//
// The sheet is written whenever a PD sheet is saved, so this is mostly a place
// to see that it is working and to put it right by hand if Google was down when
// something was saved.
type Status = {
  configured: boolean;
  hint: string;
  url: string;
  tab: string;
  designs: number;
};

export default function SheetSync() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let off = false;
    fetch("/api/pd/register")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && d) setStatus(d); })
      .catch(() => {});
    return () => { off = true; };
  }, []);

  async function sync() {
    setBusy(true); setNote(""); setError("");
    try {
      const res = await fetch("/api/pd/register", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not write the sheet.");
      setNote(`${d.designs} design number${d.designs === 1 ? "" : "s"} written to the sheet.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write the sheet.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  // Not set up: say what is missing rather than showing a button that cannot work.
  if (!status.configured) {
    return (
      <p className="sheet-sync off">
        The Google Sheet register is not connected. {status.hint}
      </p>
    );
  }

  return (
    <p className="sheet-sync">
      <span>
        {status.designs} design number{status.designs === 1 ? "" : "s"} kept in the{" "}
        <a href={status.url} target="_blank" rel="noreferrer">Google Sheet</a>, on the{" "}
        <b>{status.tab}</b> tab. It is rewritten every time a PD sheet is saved.
      </span>
      <button type="button" className="linkbtn" onClick={sync} disabled={busy}>
        {busy ? "Writing…" : "Sync now"}
      </button>
      {note && <span className="ok">{note}</span>}
      {error && <span className="bad">{error}</span>}
    </p>
  );
}
