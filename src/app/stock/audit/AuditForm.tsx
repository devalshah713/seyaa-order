"use client";
import { useState } from "react";
import { MAX_AUDIT_NOS } from "@/lib/stockAuditFormat";
import { parseStockList } from "@/lib/memoFormat";

// The box the list is pasted into.
//
// A plain form that sends the list in the address, so the report it asks for can
// be printed, kept in a tab and handed to the Excel download as the same
// question. The count under the box is worked out by the very same reader the
// server uses, so what it says will be looked up is what is looked up.
export default function AuditForm({ value }: { value: string }) {
  const [nos, setNos] = useState(value);
  const found = parseStockList(nos);
  const over = Math.max(0, found.length - MAX_AUDIT_NOS);

  return (
    <form method="GET" action="/stock/audit" className="audit-form no-print">
      <label htmlFor="nos">Stock numbers, one on each line</label>
      <textarea
        id="nos"
        name="nos"
        rows={8}
        value={nos}
        onChange={(e) => setNos(e.target.value)}
        placeholder={"746\n2457\nA0232\nS0053C"}
        spellCheck={false}
      />
      <p className="audit-count">
        {found.length === 0
          ? "Paste or type the numbers. Spaces, commas and blank lines do not matter."
          : over > 0
            ? `${found.length} numbers. Only the first ${MAX_AUDIT_NOS} will be looked up; run the rest in a second batch.`
            : `${found.length} number${found.length === 1 ? "" : "s"} will be looked up.`}
      </p>
      <button type="submit" className="btn btn-primary" disabled={found.length === 0}>
        Audit these numbers
      </button>
    </form>
  );
}
