"use client";
import { useState } from "react";

// Where everything is kept, and the two copies of it — said plainly enough that
// anyone can check the copies are actually happening rather than take it on
// trust.

type TabResult = { tab: string; rows: number; error?: string };

export default function BackupClient({
  sheetConfigured,
  sheetHint,
  sheetUrl,
  registerTab,
  pcConfigured,
}: {
  sheetConfigured: boolean;
  sheetHint: string;
  sheetUrl: string;
  registerTab: string;
  pcConfigured: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [tabs, setTabs] = useState<TabResult[] | null>(null);
  const [at, setAt] = useState("");
  const [error, setError] = useState("");

  async function sync() {
    setBusy(true); setError(""); setTabs(null);
    try {
      const res = await fetch("/api/backup/sheets", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (Array.isArray(d.tabs)) { setTabs(d.tabs); setAt(d.at || ""); }
      if (!res.ok && !Array.isArray(d.tabs)) {
        throw new Error(d.error || "Could not write the sheet.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write the sheet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="bk-card">
        <h2>The Google Sheet</h2>
        <p className="bk-lede">
          A readable copy of the whole portal, one tab per module — design
          numbers, PD sheets, diamond demands, the jangad register, the stock
          book, QC and memos. It is rewritten every night at midnight IST, and
          the <b>Backup Log</b> tab says when it last ran.
        </p>

        {sheetConfigured ? (
          <>
            <p className="bk-lede">
              Design numbers keep the <b>{registerTab}</b> tab, as before.{" "}
              <a href={sheetUrl} target="_blank" rel="noreferrer">Open the sheet</a>
            </p>
            <div className="bk-actions">
              <button type="button" className="btn btn-primary" onClick={sync} disabled={busy}>
                {busy ? "Writing…" : "Back up to the sheet now"}
              </button>
              {at && <span className="bk-stamp">Last run from here: {at}</span>}
            </div>
          </>
        ) : (
          <p className="party-warn">
            Not connected yet. {sheetHint} Add it in Vercel &rarr; Settings &rarr;
            Environment Variables, then redeploy.
          </p>
        )}

        {error && <p className="save-error">{error}</p>}

        {tabs && (
          <table className="history bk-table">
            <thead>
              <tr><th>Tab</th><th>Rows</th><th>Result</th></tr>
            </thead>
            <tbody>
              {tabs.map((t) => (
                <tr key={t.tab}>
                  <td>{t.tab}</td>
                  <td>{t.rows}</td>
                  <td className={t.error ? "bk-bad" : "bk-ok"}>{t.error || "Written"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bk-card">
        <h2>The office PC</h2>
        <p className="bk-lede">
          The restorable backup. Every midnight the PC pulls the whole database
          as one file, the Excel workbooks the office already works in — memos,
          jangad, stock book, QC — and every memo PDF, into{" "}
          <b>C:\SeyaaBackups</b>. That run also refreshes the Google Sheet, so
          the two never disagree by more than a day.
        </p>
        {pcConfigured ? (
          <p className="bk-lede">
            Set up. The scheduled task authenticates with the backup token, so it
            needs nobody signed in.
          </p>
        ) : (
          <p className="party-warn">
            BACKUP_TOKEN is not set, so the PC cannot download anything. Add it in
            Vercel and put the same value in <b>windows-backup\backup.ps1</b>.
          </p>
        )}
      </div>

      <div className="bk-card">
        <h2>Where the data itself lives</h2>
        <p className="bk-lede">
          Private storage attached to this Vercel project — reachable only with
          the project&rsquo;s own key, never public. One file per module:
        </p>
        <ul className="bk-list">
          <li><b>pd/db.json</b> — PD sheets</li>
          <li><b>demand/db.json</b> — diamond demands</li>
          <li><b>jangad/db.json</b> — diamonds issued, used and returned</li>
          <li><b>stockbook/db.json</b> — finished pieces taken into stock</li>
          <li><b>qc/db.json</b> — QC records</li>
          <li><b>memos/db.json</b> — memos, orders and every controlled list</li>
          <li><b>prices/db.json</b> — the gold and diamond rates stock is valued at</li>
        </ul>
        <p className="bk-lede">
          Each file carries its own running number, which is what keeps
          PD/26-27/007, QC-00001 and the stock numbers counting on correctly.
        </p>
      </div>
    </>
  );
}
