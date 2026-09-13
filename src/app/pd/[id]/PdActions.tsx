"use client";
import Link from "next/link";

export default function PdActions({ id }: { id: string }) {
  return (
    <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
      {/* Carries this design's number and diamond sizes straight into a demand. */}
      <Link href={`/demand/new?pd=${encodeURIComponent(id)}`} className="btn btn-accent">
        Issue Diamond Demand
      </Link>
      <Link href={`/pd/${id}/edit`} className="btn">Edit</Link>
      <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
    </div>
  );
}
