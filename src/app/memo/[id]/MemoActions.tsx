"use client";
import { useState } from "react";
import Link from "next/link";

export default function MemoActions({ id }: { id: string }) {
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      // Navigating to the route triggers the attachment download.
      window.location.href = `/api/memos/${id}/pdf`;
      // Re-enable after a moment in case the user stays on the page.
      setTimeout(() => setDownloading(false), 4000);
    } catch {
      setDownloading(false);
    }
  }

  return (
    <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
      <Link href="/memo/new" className="btn">+ New</Link>
      <button className="btn" onClick={() => window.print()}>Print</button>
      <button className="btn btn-primary" onClick={downloadPdf} disabled={downloading}>
        {downloading ? "Preparing PDF…" : "Download PDF"}
      </button>
    </div>
  );
}
