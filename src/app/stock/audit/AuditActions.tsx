"use client";
import Link from "next/link";

// Printing is the browser's, as everywhere else in the portal: the page carries
// print rules, so Print gives the report on paper and "Save as PDF" in the same
// dialog gives the file. Nothing is rendered on the server.
export default function AuditActions({ nos }: { nos: string }) {
  return (
    <div className="audit-actions no-print">
      <a href={`/api/stock/audit?nos=${encodeURIComponent(nos)}`} className="btn">
        Download for Excel
      </a>
      <button type="button" className="btn btn-primary" onClick={() => window.print()}>
        Print
      </button>
      <Link href="/stock" className="btn">Stock ledger</Link>
    </div>
  );
}
