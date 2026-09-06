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
          Set <code>GROK_DIAMOND_RECEIPT_WEBHOOK_URL</code> in Vercel to have them
          pushed to Grok as well.
        </p>
      )}
      {error && <p className="save-error">{error}</p>}
      {said && <p className="ch-said">{said}</p>}

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
                      <td colSpan={8}>
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
