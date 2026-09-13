"use client";

export default function PrintActions() {
  return (
    <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
    </div>
  );
}
