"use client";

export default function PrintButton() {
  return (
    <button type="button" className="btn gold" onClick={() => window.print()}>
      Download / Print PDF
    </button>
  );
}
