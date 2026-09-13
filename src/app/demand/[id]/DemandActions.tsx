"use client";
import Link from "next/link";

export default function DemandActions({ id }: { id: string }) {
  return (
    <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
      <Link href={`/demand/${id}/edit`} className="btn">Edit</Link>
      <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
    </div>
  );
}
