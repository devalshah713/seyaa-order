"use client";
import { useState } from "react";

export default function PrintActions({ ids }: { ids: string }) {
  const [downloading, setDownloading] = useState(false);

  function downloadPdf() {
    setDownloading(true);
    window.location.href = `/api/jangad/print?ids=${encodeURIComponent(ids)}`;
    setTimeout(() => setDownloading(false), 4000);
  }

  return (
    <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button className="btn" onClick={() => window.print()}>Print</button>
      <button className="btn btn-primary" onClick={downloadPdf} disabled={downloading}>
        {downloading ? "Preparing PDF…" : "Download PDF"}
      </button>
    </div>
  );
}
