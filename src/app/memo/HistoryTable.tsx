"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/memoFormat";
import type { Memo } from "@/lib/memoStore";

export default function HistoryTable({ memos }: { memos: Memo[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return memos;
    return memos.filter((m) => {
      const hay = [
        m.memoNo, m.to, m.through, m.mobile, m.purpose,
        ...m.items.map((it) => it.type),
        ...m.items.flatMap((it) => it.stockNos),
      ].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [q, memos]);

  return (
    <>
      <input
        className="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search memo no., recipient, stock number…"
      />
      <table className="history">
        <thead>
          <tr>
            <th>Memo No.</th>
            <th>Date</th>
            <th>To</th>
            <th>Purpose</th>
            <th className="num">Pcs</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((m) => (
            <tr key={m.id} onClick={() => router.push(`/memo/${m.id}`)}>
              <td className="memono">{m.memoNo}</td>
              <td>{formatDate(m.date)}</td>
              <td>{m.to || "—"}</td>
              <td>{m.purpose}</td>
              <td className="num">{m.totalPcs}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--panel-muted)" }}>No matches.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
