"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { elapsedWords, istClock, relativeTime, MAX_REMINDERS } from "@/lib/chaseTime";
import { isOpenStatus, STATUS_LABEL, type ReceiptChase } from "@/lib/receiptChase";
import { formatDate } from "@/lib/memoFormat";

export default function ReceiptChaseClient({
  chases, isAdmin, webhookOn, renderedAt,
}: {
  chases: ReceiptChase[];
  isAdmin: boolean;
  webhookOn: boolean;
  renderedAt: string;
}) {
  const router = useRouter();
  // "26 hours" has to say the same thing on the server and in the browser or
  // React throws the page away and draws it again. So both start from the
  // moment the page was rendered, and the browser alone moves it on.
  const [now, setNow] = useState(() => Date.parse(renderedAt));
  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [openLog, setOpenLog] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  // Which designs are ticked. Ids, not rows, so a refresh that rebuilds the
  // list does not lose the ticks.
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  const open = useMemo(() => chases.filter((c) => isOpenStatus(c.status)), [chases]);
  const closed = useMemo(() => chases.filter((c) => !isOpenStatus(c.status)), [chases]);
  // Overdue means the first day has run out — the diamond team has had it
  // longer than they are given before anybody is chased.
  const overdue = useMemo(
    () => open.filter((c) => now - Date.parse(c.issuedAt) >= 24 * 3_600_000),
    [open, now]
  );
  const received = useMemo(() => closed.filter((c) => c.status === "done"), [closed]);

  const shown = useMemo(() => {
    const list = showClosed ? chases : open;
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) =>
      [c.designNumber, c.demandNo, c.issuedTo, c.pdNo, c.jangadRef || ""]
        .join(" ").toLowerCase().includes(needle)
    );
  }, [chases, open, showClosed, q]);

  // Only an open chase can be reminded, so only an open row can be ticked.
  const pickable = useMemo(() => shown.filter((c) => isOpenStatus(c.status)), [shown]);
  // A design that has since been received, or cancelled, drops its tick by
  // itself rather than sitting in the count as something that cannot be sent.
  useEffect(() => {
    const live = new Set(open.map((c) => c.id));
    setPicked((was) => {
      const next = new Set(Array.from(was).filter((id) => live.has(id)));
      return next.size === was.size ? was : next;
    });
  }, [open]);

  const pickedCount = picked.size;
  const shownPicked = pickable.filter((c) => picked.has(c.id)).length;
  const allShownPicked = pickable.length > 0 && shownPicked === pickable.length;
  const someShownPicked = shownPicked > 0 && !allShownPicked;

  function togglePick(id: string): void {
    setPicked((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // The header tick works on what is on screen, so a search for one demand and
  // a tick at the top means that demand and nothing else.
  function togglePickAllShown(on: boolean): void {
    setPicked((was) => {
      const next = new Set(was);
      for (const c of pickable) {
        if (on) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  }

  // One request for the whole tickful. The server does the work in a single
  // read and a single write of the chase list, which is the only way fifty
  // designs fit inside what the Worker is allowed to spend on one request.
  async function remindPicked() {
    const ids = Array.from(picked);
    if (!ids.length) return;
    setError(""); setSaid(""); setBusy("bulk");
    try {
      const res = await fetch("/api/receipt-chase/remind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      // When a request runs out of processor time the platform answers with an
      // HTML page, not JSON. Reading the text first means that shows up as a
      // sentence about the server rather than a parsing complaint nobody can
      // act on.
      const text = await res.text();
      let data: Record<string, unknown> = {};
      let readable = true;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        readable = false;
      }
      if (!readable) {
        throw new Error(
          `The server answered with something this page could not read (status ${res.status}). ` +
          "Please try again with fewer designs ticked."
        );
      }
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : "Could not send the reminders."
        );
      }
      if (typeof data.note === "string" && data.note) {
        setSaid(`${ids.length} ${ids.length === 1 ? "design" : "designs"}: ${data.note}`);
      }
      setPicked(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reminders.");
    } finally {
      setBusy("");
    }
  }

  async function act(c: ReceiptChase, action: string, confirmWith = "") {
    if (confirmWith && !window.confirm(confirmWith)) return;
    setError(""); setSaid(""); setBusy(`${c.id}:${action}`);
    try {
      const res = await fetch(`/api/receipt-chase/${encodeURIComponent(c.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update the chase.");
      if (data.note) setSaid(`${c.designNumber}: ${data.note}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the chase.");
    } finally {
      setBusy("");
    }
  }

  async function runNow() {
    setError(""); setSaid(""); setBusy("tick");
    try {
      const res = await fetch("/api/receipt-chase/tick", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not run the checks.");
      setSaid(
        `Checked ${data.open} open ${data.open === 1 ? "design" : "designs"}: ` +
        `${data.due} due, ${data.reminded} reminded, ${data.closed} received.`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the checks.");
    } finally {
      setBusy("");
    }
  }

  // The whole point of the message text is that it goes into WhatsApp, so it
  // has to leave here in one piece. The clipboard is not always available —
  // an insecure origin, a browser that says no — and the text is on screen to
  // be selected either way, so a failure says so rather than pretending.
  async function copy(c: ReceiptChase) {
    const text = c.lastMessageText || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(c.id);
      setTimeout(() => setCopied(""), 2500);
    } catch {
      setError("Could not reach the clipboard — select the text below and copy it by hand.");
    }
  }

  return (
    <>
      <div className="ch-bar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search design no., demand no., diamond team…" style={{ margin: 0 }} />
        <label className="ch-toggle">
          <input type="checkbox" checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)} />
          Show closed ({closed.length})
        </label>
        {isAdmin && (
          <button type="button" className="btn" onClick={runNow} disabled={busy === "tick"}>
            {busy === "tick" ? "Checking…" : "Run the checks now"}
          </button>
        )}
      </div>

      <div className="rc-tally">
        <span className={overdue.length ? "rc-fig rc-fig-warn" : "rc-fig"}>
          <b>{overdue.length}</b> overdue
          <em>past 24 hours, still not on the jangad</em>
        </span>
        <span className="rc-fig">
          <b>{open.length}</b> issued, not received
          <em>being waited on</em>
        </span>
        <span className="rc-fig">
          <b>{received.length}</b> received
          <em>diamonds on the jangad</em>
        </span>
      </div>

      {!webhookOn && (
        <p className="hint">
          The Grok Bot webhook isn&rsquo;t set up, so reminders are only shown here.
          Set <code>GROK_DIAMOND_RECEIPT_WEBHOOK_URL</code> to have them
          pushed to Grok as well.
        </p>
      )}
      {error && <p className="save-error">{error}</p>}
      {said && <p className="ch-said">{said}</p>}

      {pickedCount > 0 && (
        <div className="ch-pickbar">
          <b>{pickedCount} selected</b>
          <button type="button" className="btn btn-small"
            disabled={!!busy} onClick={remindPicked}>
            {busy === "bulk" ? "Sending…" : "Remind selected"}
          </button>
          <button type="button" className="ch-log-btn"
            disabled={!!busy} onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty-state">
          <p>{open.length === 0 && !showClosed
            ? "Nothing outstanding — every demand issued has its diamonds on the jangad."
            : "Nothing to show."}</p>
        </div>
      ) : (
        <table className="history ch-table">
          <thead>
            <tr>
              <th className="ch-pick">
                {/* Ticks everything on screen, which is everything the filter
                    and the search have left. */}
                <input type="checkbox" aria-label="Select every design shown"
                  checked={allShownPicked}
                  disabled={pickable.length === 0}
                  ref={(el) => { if (el) el.indeterminate = someShownPicked; }}
                  onChange={(e) => togglePickAllShown(e.target.checked)} />
              </th>
              <th>Design Number</th><th>Demand</th><th>Issued To</th>
              <th>Waiting</th><th className="num">Reminders</th><th>Next</th>
              <th>Status</th><th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const isOpen = isOpenStatus(c.status);
              const logOpen = openLog === c.id;
              const late = isOpen && now - Date.parse(c.issuedAt) >= 24 * 3_600_000;
              return (
                <Fragment key={c.id}>
                  <tr className={`ch-row ch-${c.status}`}>
                    {/* A received or cancelled design gets no tick: there is
                        nobody left to remind about it. The click is kept off
                        the row so ticking never opens or follows anything. */}
                    <td className="ch-pick" onClick={(e) => e.stopPropagation()}>
                      {isOpen && (
                        <input type="checkbox"
                          aria-label={`Select ${c.designNumber}`}
                          checked={picked.has(c.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => togglePick(c.id)} />
                      )}
                    </td>
                    <td className="memono">
                      {c.designNumber}
                      {c.pdNo && <span className="ch-product">{c.pdNo}</span>}
                    </td>
                    <td>
                      {c.demandNo}
                      <span className="ch-by">{formatDate(c.demandDate)}</span>
                    </td>
                    <td>{c.issuedTo || <span className="pd-nobody">—</span>}</td>
                    <td className={late ? "rc-late" : ""}>
                      {/* A closed chase stops counting at the moment it was
                          answered; an open one is still running. */}
                      {elapsedWords(
                        c.issuedAt,
                        new Date(c.completedAt ? Date.parse(c.completedAt) : now)
                      )}
                    </td>
                    <td className="num">
                      {c.reminderNumber}
                      {c.status === "paused" && <span className="ch-by">of {MAX_REMINDERS}</span>}
                    </td>
                    <td>
                      {isOpen && c.status !== "paused" ? (
                        <>
                          {relativeTime(c.nextReminderAt, new Date(now))}
                          <span className="ch-by">{istClock(c.nextReminderAt)}</span>
                        </>
                      ) : c.jangadRef ? (
                        <span className="ch-demand">{c.jangadRef}</span>
                      ) : (
                        <span className="pd-nobody">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`ch-pill ch-pill-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                    </td>
                    <td className="ch-actions">
                      {isOpen ? (
                        <>
                          {c.status === "paused" ? (
                            <button type="button" className="btn btn-small"
                              disabled={!!busy} onClick={() => act(c, "resume")}>
                              Start again
                            </button>
                          ) : (
                            <button type="button" className="btn btn-small"
                              disabled={!!busy} onClick={() => act(c, "remind")}>
                              {busy === `${c.id}:remind` ? "Sending…" : "Remind now"}
                            </button>
                          )}
                          <button type="button" className="btn btn-small"
                            disabled={!!busy} onClick={() => act(c, "received")}>
                            Mark received
                          </button>
                          <button type="button" className="btn btn-small btn-danger"
                            disabled={!!busy}
                            onClick={() => act(c, "cancel",
                              `Stop waiting on ${c.designNumber}? Nobody will be chased about it again.`)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <span className="pd-nobody">{c.closedBy || ""}</span>
                      )}
                      <button type="button" className="ch-log-btn"
                        onClick={() => setOpenLog(logOpen ? "" : c.id)}>
                        {logOpen ? "Hide" : "Text & log"}
                      </button>
                    </td>
                  </tr>
                  {logOpen && (
                    <tr className="ch-logrow">
                      <td colSpan={9}>
                        {c.lastMessageText ? (
                          <div className="rc-copy">
                            <div className="rc-copy-head">
                              <b>To forward to “Diamond bagging group internal”</b>
                              <button type="button" className="btn btn-small" onClick={() => copy(c)}>
                                {copied === c.id ? "Copied" : "Copy text"}
                              </button>
                            </div>
                            <pre>{c.lastMessageText}</pre>
                          </div>
                        ) : (
                          <p className="hint" style={{ margin: "0 0 8px" }}>
                            No chase text yet — one is written the first time a reminder goes out.
                          </p>
                        )}
                        <ol className="ch-log">
                          {c.events.slice().reverse().map((e, i) => (
                            <li key={i}>
                              <span className="ch-log-at">{istClock(e.at)}</span>
                              {e.note}
                              {e.by && <span className="ch-by">{e.by}</span>}
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
