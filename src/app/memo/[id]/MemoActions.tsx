"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

export default function MemoActions({ autoPrint }: { autoPrint: boolean }) {
  const done = useRef(false);
  useEffect(() => {
    if (autoPrint && !done.current) {
      done.current = true;
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

  return (
    <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
      <Link href="/memo/new" className="btn">+ New</Link>
      <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
    </div>
  );
}
