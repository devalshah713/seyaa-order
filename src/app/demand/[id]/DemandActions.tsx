"use client";
import { useState } from "react";
import Link from "next/link";

export default function DemandActions({ id }: { id: string }) {
  const [downloading, setDownloading] = useState(false);

  function downloadPdf() {
    setDownloading(true);
    window.location.href = `/api/demand/${id}/pdf`;
    setTimeout(() => setDownloading(false), 4000);
  }

  return (
    <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
      <Link href={`/demand/${id}/edit`} className="btn">Edit</Link>
      <button className="btn" onClick={() => window.print()}>Print</button>
      <button className="btn btn-primary" onClick={downloadPdf} disabled={downloading}>
        {downloading ? "Preparing PDF…" : "Download PDF"}
      </button>
    </div>
  );
}
