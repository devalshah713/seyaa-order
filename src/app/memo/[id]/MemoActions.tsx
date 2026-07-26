"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Props = {
  id: string;
  driveEnabled: boolean;
  driveLink?: string;
};

export default function MemoActions({ id, driveEnabled, driveLink }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [link, setLink] = useState<string | undefined>(driveLink);
  const [drive, setDrive] = useState<"idle" | "saving" | "saved" | "error">(
    driveLink ? "saved" : "idle"
  );
  const [driveErr, setDriveErr] = useState("");
  const tried = useRef(false);

  async function saveToDrive() {
    setDrive("saving");
    setDriveErr("");
    try {
      const res = await fetch(`/api/memos/${id}/drive`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Drive upload failed.");
      setLink(data.link);
      setDrive("saved");
    } catch (err) {
      setDrive("error");
      setDriveErr(err instanceof Error ? err.message : "Drive upload failed.");
    }
  }

  // Auto-save to Drive once when the memo isn't in Drive yet.
  useEffect(() => {
    if (driveEnabled && !link && !tried.current) {
      tried.current = true;
      saveToDrive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function downloadPdf() {
    setDownloading(true);
    window.location.href = `/api/memos/${id}/pdf`;
    setTimeout(() => setDownloading(false), 4000);
  }

  return (
    <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {driveEnabled && (
        <span className="drive-status">
          {drive === "saving" && <span className="muted">Saving to Drive…</span>}
          {drive === "saved" && link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="drive-ok">✓ In Google Drive</a>
          )}
          {drive === "error" && (
            <button className="btn" onClick={saveToDrive} title={driveErr}>Retry Drive</button>
          )}
          {drive === "idle" && (
            <button className="btn" onClick={saveToDrive}>Save to Drive</button>
          )}
        </span>
      )}
      <Link href={`/memo/${id}/edit`} className="btn">Edit</Link>
      <button className="btn" onClick={() => window.print()}>Print</button>
      <button className="btn btn-primary" onClick={downloadPdf} disabled={downloading}>
        {downloading ? "Preparing PDF…" : "Download PDF"}
      </button>
    </div>
  );
}
