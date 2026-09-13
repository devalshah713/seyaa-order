"use client";
import Link from "next/link";

// Print is the whole of it now. The page carries print CSS, so the browser
// makes the same sheet the server used to, and "Save as PDF" in the print
// dialog makes the same file — without a browser running on the server, which
// is a paid add-on on Cloudflare and was the only thing on this portal that
// needed one.
export default function MemoActions({ id }: { id: string }) {
  return (
    <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Link href={`/memo/${id}/edit`} className="btn">Edit</Link>
      <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
    </div>
  );
}
