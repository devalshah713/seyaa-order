"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import OrderCombobox, { OrderOption } from "@/app/issues/new/OrderCombobox";
import { ISSUE_STATUS_LABELS, parseNum, round2 } from "@/lib/diamondIssueConfig";
import { RETURN_DESCRIPTIONS } from "@/lib/diamondReturnConfig";

type Bag = {
  shape: string;
  size: string;
  pcs: string; // issued
  carats: string; // issued
  ctsUsed: string;
  pcsUsed: string;
};
type Memo = {
  memoNo: string;
  date: string;
  status: string;
  receivedDate: string;
  bags: Bag[];
};
type Used = { ctsUsed: string; pcsUsed: string };
type ReturnRow = {
  description: string;
  shape: string;
  size: string;
  caratWeight: string;
  pcs: string;
  comments: string;
  remark: string;
};

// On receiving, the statuses that make sense to set (a memo leaves "Pending").
const RECEIVE_STATUSES = ["RECEIVED", "WHOLE_RETURN"] as const;

function isoToDdmmyyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export default function JewelleryInForm({ initialDesign = "" }: { initialDesign?: string }) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [designNumber, setDesignNumber] = useState(initialDesign);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [used, setUsed] = useState<Used[][]>([]); // [memoIndex][bagIndex]
  const [loadingMemos, setLoadingMemos] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const todayIso = new Date().toISOString().slice(0, 10);
  const [status, setStatus] = useState<string>("RECEIVED");
  const [receivedDate, setReceivedDate] = useState(todayIso);
  const [comments, setComments] = useState("");
  const [returns, setReturns] = useState<ReturnRow[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Order list for the design-number picker (auto-fetch, same as Diamond Issue).
  useEffect(() => {
    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.orders)) setOrders(d.orders);
      })
      .catch(() => {});
  }, []);

  // Build the suggested return lines from the current "used" vs issued amounts.
  const computeReturns = useCallback(
    (memoList: Memo[], usedState: Used[][]): ReturnRow[] => {
      const rows: ReturnRow[] = [];
      memoList.forEach((memo, mi) => {
        memo.bags.forEach((bag, bi) => {
          const u = usedState[mi]?.[bi] || { ctsUsed: "", pcsUsed: "" };
          const retCts = round2(Math.max(0, parseNum(bag.carats) - parseNum(u.ctsUsed)));
          const retPcs = Math.max(0, Math.round(parseNum(bag.pcs) - parseNum(u.pcsUsed)));
          if (retCts > 0 || retPcs > 0) {
            rows.push({
              description: "Unused",
              shape: bag.shape,
              size: bag.size,
              caratWeight: retCts ? String(retCts) : "",
              pcs: retPcs ? String(retPcs) : "",
              comments: "",
              remark: "",
            });
          }
        });
      });
      return rows;
    },
    []
  );

  async function pickDesign(design: string) {
    setDesignNumber(design);
    setMemos([]);
    setUsed([]);
    setReturns([]);
    setLoaded(false);
    setDone(false);
    setError(null);
    if (!design) return;
    setLoadingMemos(true);
    try {
      const res = await fetch(`/api/issues?design=${encodeURIComponent(design)}`);
      const data = res.ok ? await res.json() : null;
      const list: Memo[] = Array.isArray(data?.memos) ? data.memos : [];
      // Default "used" = whatever was already recorded, else the full issued
      // amount (most diamonds are used; lower it for bags that came back).
      const u: Used[][] = list.map((m) =>
        m.bags.map((b) => ({
          ctsUsed: b.ctsUsed || b.carats || "",
          pcsUsed: b.pcsUsed || b.pcs || "",
        }))
      );
      setMemos(list);
      setUsed(u);
      setReturns(computeReturns(list, u));
      setLoaded(true);
    } catch {
      setError("Could not load issued diamonds for this design.");
    } finally {
      setLoadingMemos(false);
    }
  }

  // Preselect a design passed in via ?design=… (from the worklist).
  useEffect(() => {
    if (initialDesign) pickDesign(initialDesign);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setUsedCell(mi: number, bi: number, field: "ctsUsed" | "pcsUsed", value: string) {
    setUsed((prev) =>
      prev.map((memo, m) =>
        m === mi ? memo.map((u, b) => (b === bi ? { ...u, [field]: value } : u)) : memo
      )
    );
  }

  // Switching to "Whole Return Received" means nothing was used — zero out all
  // used cells so the difference (returned) equals the full issued amount.
  function changeStatus(next: string) {
    setStatus(next);
    if (next === "WHOLE_RETURN") {
      const zeroed: Used[][] = memos.map((m) => m.bags.map(() => ({ ctsUsed: "0", pcsUsed: "0" })));
      setUsed(zeroed);
      setReturns(computeReturns(memos, zeroed));
    } else {
      const full: Used[][] = memos.map((m) =>
        m.bags.map((b) => ({ ctsUsed: b.ctsUsed || b.carats || "", pcsUsed: b.pcsUsed || b.pcs || "" }))
      );
      setUsed(full);
      setReturns(computeReturns(memos, full));
    }
  }

  function recalcReturns() {
    setReturns(computeReturns(memos, used));
  }

  function setReturnCell(i: number, field: keyof ReturnRow, value: string) {
    setReturns((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addReturnRow() {
    setReturns((prev) => [
      ...prev,
      { description: "Unused", shape: "", size: "", caratWeight: "", pcs: "", comments: "", remark: "" },
    ]);
  }
  function removeReturnRow(i: number) {
    setReturns((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!designNumber.trim()) return setError("Please pick a design number.");
    if (!memos.length) return setError("This design has no issued diamonds to receive.");

    setSubmitting(true);
    const payload = {
      designNumber,
      status,
      receivedDate: isoToDdmmyyyy(receivedDate),
      comments,
      memos: memos.map((m, mi) => ({
        memoNo: m.memoNo,
        used: (used[mi] || []).map((u) => ({ ctsUsed: u.ctsUsed, pcsUsed: u.pcsUsed })),
      })),
      returns: returns.filter((r) => r.shape || r.size || r.caratWeight || r.pcs),
    };

    const res = await fetch("/api/jewellery-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to record jewellery in.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="card" style={{ borderColor: "#16a34a", background: "#f0fdf4" }}>
        <h2 style={{ marginTop: 0 }}>✅ Recorded</h2>
        <p>
          Jewellery in saved for <b>{designNumber}</b>. Diamonds used &amp; returned have been written
          to the Diamond Issue sheet, and returned/broken diamonds added to the Diamond Return log.
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <Link className="btn gold" href="/jewellery-in">
            Back to worklist
          </Link>
          <Link className="btn ghost" href={`/issues/view?id=${encodeURIComponent(memos[0]?.memoNo || "")}`}>
            View memo
          </Link>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setDone(false);
              pickDesign("");
              setDesignNumber("");
            }}
          >
            Record another
          </button>
        </div>
      </div>
    );
  }

  // A design's diamonds are issued together and are treated as ONE memo, even if
  // the underlying sheet ended up with more than one memo number. Flatten every
  // bag across all of the design's memos into a single list (remembering which
  // memo + bag each came from) so they show as one consolidated section while
  // each row is still written back to its correct memo on submit.
  const flatBags = memos.flatMap((memo, mi) =>
    memo.bags.map((bag, bi) => ({ memo, mi, bag, bi }))
  );

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="card" style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }}>
          {error}
        </div>
      )}

      <div className="card">
        <div className="row spread">
          <h2>Receiving Details</h2>
          {designNumber && (
            <Link
              href={`/audit?order=${encodeURIComponent(designNumber)}`}
              target="_blank"
              className="btn ghost small"
            >
              Audit Trail for {designNumber}
            </Link>
          )}
        </div>
        <div className="grid3">
          <div className="field">
            <label>
              Design Number <span className="req">*</span>
            </label>
            <OrderCombobox
              orders={orders}
              value={designNumber}
              onSelect={pickDesign}
              loading={!orders.length}
            />
            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {loadingMemos ? "Loading issued diamonds…" : "Pick the design whose jewellery has come back."}
            </span>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => changeStatus(e.target.value)}>
              {RECEIVE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ISSUE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Received Date</label>
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </div>
        </div>
      </div>

      {loaded && memos.length === 0 && (
        <div className="card empty">
          No issued diamonds found for <b>{designNumber}</b>.{" "}
          <Link href="/issues/new" style={{ color: "var(--gold)", fontWeight: 600 }}>
            Issue diamonds first →
          </Link>
        </div>
      )}

      {memos.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <div className="row spread">
            <h2 style={{ margin: 0 }}>Diamonds Issued for {designNumber}</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              {flatBags.length} bag{flatBags.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Enter how many diamonds were actually <b>used</b>. The difference is treated as returned.
          </p>
          <table>
            <thead>
              <tr>
                <th>Bag</th>
                <th>Shape</th>
                <th>Size</th>
                <th>Issued cts</th>
                <th>Issued pcs</th>
                <th>Cts Used</th>
                <th>Pcs Used</th>
                <th>Returned cts</th>
                <th>Returned pcs</th>
              </tr>
            </thead>
            <tbody>
              {flatBags.map(({ mi, bi, bag }, gi) => {
                const u = used[mi]?.[bi] || { ctsUsed: "", pcsUsed: "" };
                const retCts = round2(Math.max(0, parseNum(bag.carats) - parseNum(u.ctsUsed)));
                const retPcs = Math.max(0, Math.round(parseNum(bag.pcs) - parseNum(u.pcsUsed)));
                return (
                  <tr key={`${mi}-${bi}`}>
                    <td>{gi + 1}</td>
                    <td>{bag.shape || "—"}</td>
                    <td className="muted">{bag.size || "—"}</td>
                    <td className="muted">{bag.carats || "—"}</td>
                    <td className="muted">{bag.pcs || "—"}</td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={u.ctsUsed}
                        disabled={status === "WHOLE_RETURN"}
                        onChange={(e) => setUsedCell(mi, bi, "ctsUsed", e.target.value)}
                        style={{ width: 100 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={u.pcsUsed}
                        disabled={status === "WHOLE_RETURN"}
                        onChange={(e) => setUsedCell(mi, bi, "pcsUsed", e.target.value)}
                        style={{ width: 100 }}
                      />
                    </td>
                    <td style={{ fontWeight: 600, color: retCts > 0 ? "#0891b2" : undefined }}>{retCts || "—"}</td>
                    <td style={{ fontWeight: 600, color: retPcs > 0 ? "#0891b2" : undefined }}>{retPcs || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {memos.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <div className="row spread">
            <div>
              <h2 style={{ margin: 0 }}>Returned Diamonds</h2>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Logged to the clean Diamond Return sheet. Auto-filled from the differences above —
                edit, mark <b>Broken</b>, or add rows as needed.
              </p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn ghost small" onClick={recalcReturns}>
                Recalculate from differences
              </button>
              <button type="button" className="btn ghost small" onClick={addReturnRow}>
                + Add return
              </button>
            </div>
          </div>

          {returns.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>
              No returned diamonds — everything issued was used.
            </p>
          ) : (
            <table style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Shape</th>
                  <th>Size</th>
                  <th>Carat Weight</th>
                  <th>No of pcs</th>
                  <th>Comments</th>
                  <th>Remark</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        value={r.description}
                        onChange={(e) => setReturnCell(i, "description", e.target.value)}
                      >
                        {RETURN_DESCRIPTIONS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input value={r.shape} onChange={(e) => setReturnCell(i, "shape", e.target.value)} style={{ width: 110 }} />
                    </td>
                    <td>
                      <input value={r.size} onChange={(e) => setReturnCell(i, "size", e.target.value)} style={{ width: 130 }} />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={r.caratWeight}
                        onChange={(e) => setReturnCell(i, "caratWeight", e.target.value)}
                        style={{ width: 100 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={r.pcs}
                        onChange={(e) => setReturnCell(i, "pcs", e.target.value)}
                        style={{ width: 90 }}
                      />
                    </td>
                    <td>
                      <input value={r.comments} onChange={(e) => setReturnCell(i, "comments", e.target.value)} style={{ width: 140 }} />
                    </td>
                    <td>
                      <input value={r.remark} onChange={(e) => setReturnCell(i, "remark", e.target.value)} style={{ width: 120 }} />
                    </td>
                    <td>
                      <button type="button" className="btn ghost small" onClick={() => removeReturnRow(i)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {memos.length > 0 && (
        <>
          <div className="card">
            <div className="field">
              <label>Comments</label>
              <textarea
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Any notes about this receiving — variances, remarks, etc."
              />
            </div>
          </div>

          <div className="row">
            <button className="btn gold" type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Record Jewellery In"}
            </button>
            <button type="button" className="btn ghost" onClick={() => router.push("/jewellery-in")}>
              Cancel
            </button>
          </div>
        </>
      )}
    </form>
  );
}
