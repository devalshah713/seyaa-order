"use client";
import { useEffect, useState } from "react";

// Where everything is kept, and the two copies of it — said plainly enough that
// anyone can check the copies are actually happening rather than take it on
// trust.

type TabResult = { tab: string; rows: number; error?: string };

type DocResult = {
  path: string;
  label: string;
  did: "copied" | "already there" | "nothing to copy" | "failed";
  bytes: number;
  note: string;
};

export default function BackupClient({
  sheetConfigured,
  sheetHint,
  sheetUrl,
  registerTab,
  pcConfigured,
  r2Configured,
  blobStillSet,
  migrationHint,
}: {
  sheetConfigured: boolean;
  sheetHint: string;
  sheetUrl: string;
  registerTab: string;
  pcConfigured: boolean;
  r2Configured: boolean;
  blobStillSet: boolean;
  migrationHint: string;
}) {
  const [busy, setBusy] = useState(false);
  const [tabs, setTabs] = useState<TabResult[] | null>(null);
  const [at, setAt] = useState("");
  const [error, setError] = useState("");
  const [docs, setDocs] = useState<DocResult[] | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState("");
  // Filled in after the page loads, so the address shown is the one this
  // portal is actually being used on.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

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

  // Look, but touch nothing — what each store holds right now.
  async function checkStores() {
    setMoving(true); setMoveError(""); setDocs(null);
    try {
      const res = await fetch("/api/admin/migrate-storage");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not read the stores.");
      setDocs(d.documents || []);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "Could not read the stores.");
    } finally {
      setMoving(false);
    }
  }

  async function copyToR2() {
    setMoving(true); setMoveError(""); setDocs(null);
    try {
      const res = await fetch("/api/admin/migrate-storage", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "The copy failed.");
      setDocs(d.documents || []);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "The copy failed.");
    } finally {
      setMoving(false);
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
        <p className="bk-lede">
          There are two ways to fill it, and the sheet ends up the same either
          way. Only one needs setting up.
        </p>

        <h3 className="bk-sub">A script in the sheet</h3>
        <p className="bk-lede">
          Nothing to set up on Google&rsquo;s side — no Cloud project, no service
          account, no key file. In the sheet, open <b>Extensions &rarr; Apps
          Script</b>, paste in <b>apps-script/Seyaa.gs</b> from the repository,
          and run <b>setUp</b> once. It asks for the backup token, sets its own
          nightly alarm, and fills the sheet there and then. The script reads:
        </p>
        <p className="bk-url">{origin || "https://…"}/api/backup/tabs</p>

        <h3 className="bk-sub">Or from the portal</h3>
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
            The portal cannot write to the sheet itself — {sheetHint} That is the
            Google Cloud route, and it is only worth doing if you would rather
            the portal pushed than the sheet pulled. The script above needs none
            of it.
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
          A private Cloudflare R2 bucket — reachable only with this
          portal&rsquo;s own key, never public. One file per module:
        </p>
        <ul className="bk-list">
          <li><b>pd/db.json</b> — PD sheets</li>
          <li><b>demand/db.json</b> — diamond demands</li>
          <li><b>jangad/db.json</b> — diamonds issued, used and returned</li>
          <li><b>stockbook/db.json</b> — finished pieces taken into stock</li>
          <li><b>qc/db.json</b> — QC records</li>
          <li><b>memos/db.json</b> — memos, orders and every controlled list</li>
          <li><b>prices/db.json</b> — the gold and diamond rates stock is valued at</li>
          <li><b>users/users.json</b> — who can sign in, and to what</li>
          <li><b>receipt-chase/db.json</b> — diamond demands still being chased</li>
        </ul>
        <p className="bk-lede">
          Each file carries its own running number, which is what keeps
          PD/26-27/007, QC-00001 and the stock numbers counting on correctly.
        </p>
        <p className="bk-lede">
          It is deliberately not the same company that hosts the site. A billing
          problem at one of them now costs a deployment rather than the records.
        </p>
      </div>

      <div className="bk-card">
        <h2>Moving to Cloudflare</h2>
        {migrationHint ? (
          <p className={r2Configured ? "bk-lede" : "party-warn"}>{migrationHint}</p>
        ) : (
          <p className="bk-lede">
            The records are being moved out of the old Vercel store into R2.
            Until <b>BLOB_READ_WRITE_TOKEN</b> is removed, the old store is kept
            current too — every save goes to both — so the move can be abandoned
            at any point by unsetting the four <b>R2_*</b> variables.
          </p>
        )}
        <p className="bk-lede">
          <b>Check</b> reads both stores and says what is where, without changing
          anything. <b>Copy everything across</b> copies each document that R2
          has not got yet. Neither one deletes anything, and both are safe to run
          more than once.
        </p>
        <div className="bk-actions">
          <button className="btn" onClick={checkStores} disabled={moving}>
            {moving ? "Working…" : "Check"}
          </button>
          <button
            className="btn primary"
            onClick={copyToR2}
            disabled={moving || !r2Configured || !blobStillSet}
          >
            Copy everything across
          </button>
        </div>
        {moveError && <p className="party-warn">{moveError}</p>}
        {docs && (
          <table className="bk-table">
            <thead>
              <tr><th>Document</th><th>Result</th></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.path}>
                  <td>{d.label}<br /><small>{d.path}</small></td>
                  <td className={d.did === "failed" ? "bk-bad" : "bk-ok"}>{d.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
