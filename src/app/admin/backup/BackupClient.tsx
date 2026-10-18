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

// What the memo records look like in each store, side by side.
type RecordCounts = { memos: number; events: number; orders: number; parties: number };

type SqlCheck = {
  hint: string;
  r2: RecordCounts;
  sql: RecordCounts;
  live: boolean;
};

type CopyReport = {
  at: string;
  copied: RecordCounts;
  skipped: RecordCounts;
  finished: boolean;
  notes: string[];
};

// And the same two questions for the jangad register, which moves on its own.
type JangadCounts = { rows: number };

type JangadCheck = {
  hint: string;
  r2: JangadCounts;
  sql: JangadCounts;
  live: boolean;
};

type JangadCopyReport = {
  at: string;
  copied: JangadCounts;
  skipped: JangadCounts;
  finished: boolean;
  notes: string[];
};

// And again for the PD sheets, the demands and the stock book. Five books, five
// moves, and the shape of the answer is the same every time: how many in each
// store, and what the last copy did. Only the word for a record differs, so
// each card names its own and the rest of the card is the same card.
type PdCounts = { sheets: number };
type DemandCounts = { demands: number };
type StockCounts = { entries: number };

type OneCheck<C> = { hint: string; r2: C; sql: C; live: boolean };
type OneReport<C> = {
  at: string;
  copied: C;
  skipped: C;
  finished: boolean;
  notes: string[];
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
  sqlAttached,
  sqlHint,
}: {
  sheetConfigured: boolean;
  sheetHint: string;
  sheetUrl: string;
  registerTab: string;
  pcConfigured: boolean;
  r2Configured: boolean;
  blobStillSet: boolean;
  migrationHint: string;
  sqlAttached: boolean;
  sqlHint: string;
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

  // The memo move into the Cloudflare database, which is a separate thing from
  // the R2 copy above and has its own button.
  const [sqlBusy, setSqlBusy] = useState(false);
  const [sqlError, setSqlError] = useState("");
  const [sqlCheck, setSqlCheck] = useState<SqlCheck | null>(null);
  const [sqlReport, setSqlReport] = useState<CopyReport | null>(null);

  // The jangad move, which has its own buttons and its own answers.
  const [jgBusy, setJgBusy] = useState(false);
  const [jgError, setJgError] = useState("");
  const [jgCheck, setJgCheck] = useState<JangadCheck | null>(null);
  const [jgReport, setJgReport] = useState<JangadCopyReport | null>(null);

  // The PD sheet move, and the demand move. Each has its own two buttons and
  // its own answers, so neither can be confused with the other.
  const [pdBusy, setPdBusy] = useState(false);
  const [pdError, setPdError] = useState("");
  const [pdCheck, setPdCheck] = useState<OneCheck<PdCounts> | null>(null);
  const [pdReport, setPdReport] = useState<OneReport<PdCounts> | null>(null);

  const [ddBusy, setDdBusy] = useState(false);
  const [ddError, setDdError] = useState("");
  const [ddCheck, setDdCheck] = useState<OneCheck<DemandCounts> | null>(null);
  const [ddReport, setDdReport] = useState<OneReport<DemandCounts> | null>(null);

  // And the stock book, the last of the five.
  const [sbBusy, setSbBusy] = useState(false);
  const [sbError, setSbError] = useState("");
  const [sbCheck, setSbCheck] = useState<OneCheck<StockCounts> | null>(null);
  const [sbReport, setSbReport] = useState<OneReport<StockCounts> | null>(null);

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

  // Look, but touch nothing: how many memo records each store holds.
  async function checkD1() {
    setSqlBusy(true); setSqlError(""); setSqlCheck(null); setSqlReport(null);
    try {
      const res = await fetch("/api/admin/migrate-d1");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not read the stores.");
      setSqlCheck(d as SqlCheck);
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : "Could not read the stores.");
    } finally {
      setSqlBusy(false);
    }
  }

  async function copyToD1() {
    setSqlBusy(true); setSqlError(""); setSqlCheck(null); setSqlReport(null);
    try {
      const res = await fetch("/api/admin/migrate-d1", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "The copy failed.");
      setSqlReport(d as CopyReport);
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : "The copy failed.");
    } finally {
      setSqlBusy(false);
    }
  }

  // Look, but touch nothing: how many register entries each store holds.
  async function checkJangadD1() {
    setJgBusy(true); setJgError(""); setJgCheck(null); setJgReport(null);
    try {
      const res = await fetch("/api/admin/migrate-d1/jangad");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not read the stores.");
      setJgCheck(d as JangadCheck);
    } catch (err) {
      setJgError(err instanceof Error ? err.message : "Could not read the stores.");
    } finally {
      setJgBusy(false);
    }
  }

  async function copyJangadToD1() {
    setJgBusy(true); setJgError(""); setJgCheck(null); setJgReport(null);
    try {
      const res = await fetch("/api/admin/migrate-d1/jangad", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "The copy failed.");
      setJgReport(d as JangadCopyReport);
    } catch (err) {
      setJgError(err instanceof Error ? err.message : "The copy failed.");
    } finally {
      setJgBusy(false);
    }
  }

  // The PD sheets and the demands, asked the same two questions. One pair of
  // functions each rather than one shared pair, so a press on one card can
  // never clear the other card's answer.
  async function checkPdD1() {
    setPdBusy(true); setPdError(""); setPdCheck(null); setPdReport(null);
    try {
      const res = await fetch("/api/admin/migrate-d1/pd");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not read the stores.");
      setPdCheck(d as OneCheck<PdCounts>);
    } catch (err) {
      setPdError(err instanceof Error ? err.message : "Could not read the stores.");
    } finally {
      setPdBusy(false);
    }
  }

  async function copyPdToD1() {
    setPdBusy(true); setPdError(""); setPdCheck(null); setPdReport(null);
    try {
      const res = await fetch("/api/admin/migrate-d1/pd", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "The copy failed.");
      setPdReport(d as OneReport<PdCounts>);
    } catch (err) {
      setPdError(err instanceof Error ? err.message : "The copy failed.");
    } finally {
      setPdBusy(false);
    }
  }

  async function checkDemandD1() {
    setDdBusy(true); setDdError(""); setDdCheck(null); setDdReport(null);
    try {
      const res = await fetch("/api/admin/migrate-d1/demand");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not read the stores.");
      setDdCheck(d as OneCheck<DemandCounts>);
    } catch (err) {
      setDdError(err instanceof Error ? err.message : "Could not read the stores.");
    } finally {
      setDdBusy(false);
    }
  }

  async function copyDemandToD1() {
    setDdBusy(true); setDdError(""); setDdCheck(null); setDdReport(null);
    try {
      const res = await fetch("/api/admin/migrate-d1/demand", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "The copy failed.");
      setDdReport(d as OneReport<DemandCounts>);
    } catch (err) {
      setDdError(err instanceof Error ? err.message : "The copy failed.");
    } finally {
      setDdBusy(false);
    }
  }

  async function checkStockD1() {
    setSbBusy(true); setSbError(""); setSbCheck(null); setSbReport(null);
    try {
      const res = await fetch("/api/admin/migrate-d1/stockbook");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not read the stores.");
      setSbCheck(d as OneCheck<StockCounts>);
    } catch (err) {
      setSbError(err instanceof Error ? err.message : "Could not read the stores.");
    } finally {
      setSbBusy(false);
    }
  }

  async function copyStockToD1() {
    setSbBusy(true); setSbError(""); setSbCheck(null); setSbReport(null);
    try {
      const res = await fetch("/api/admin/migrate-d1/stockbook", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "The copy failed.");
      setSbReport(d as OneReport<StockCounts>);
    } catch (err) {
      setSbError(err instanceof Error ? err.message : "The copy failed.");
    } finally {
      setSbBusy(false);
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

      <div className="bk-card">
        <h2>Memos into the Cloudflare database</h2>
        <p className="bk-lede">
          Saving a memo currently rewrites the whole memo book, so it gets
          slower every month: about 14 thousandths of a second of computing time
          at 200 memos and 26 at 400, against the 10 this free plan allows.
          Cloudflare&rsquo;s own database, which is also free, writes one memo
          as one line instead, and stays the same speed at four thousand memos
          as at four.
        </p>
        <p className="bk-lede">
          This card moves memos, stock entries, orders and the controlled lists
          only. The jangad register, the PD sheets, the diamond demands and the
          stock book have a card each below it. QC, prices, the receipt chase
          and the sign-in list all stay exactly where they are and are not
          touched.
        </p>
        {sqlHint ? (
          <p className={sqlAttached ? "bk-lede" : "party-warn"}>{sqlHint}</p>
        ) : (
          <p className="bk-lede">
            The database is attached. The records are copied into it, and the
            portal only starts reading memos from it once every record is
            across. Before that moment nothing changes for anybody.
          </p>
        )}
        <p className="bk-lede">
          <b>Check</b> counts what is in each store and says nothing else.{" "}
          <b>Copy the memos across</b> reads the R2 file and writes what the
          database has not got yet. Neither one writes to R2, neither one
          deletes anything, and both are safe to press more than once. If there
          are more records than one press can carry, it says so and the next
          press carries on from there.
        </p>
        <div className="bk-actions">
          <button className="btn" onClick={checkD1} disabled={sqlBusy}>
            {sqlBusy ? "Working…" : "Check"}
          </button>
          <button
            className="btn primary"
            onClick={copyToD1}
            disabled={sqlBusy || !sqlAttached || !r2Configured}
          >
            Copy the memos across
          </button>
        </div>
        {sqlError && <p className="party-warn">{sqlError}</p>}

        {sqlCheck && !sqlCheck.hint && (
          <>
            <table className="bk-table">
              <thead>
                <tr><th>Records</th><th>In the R2 file</th><th>In the database</th></tr>
              </thead>
              <tbody>
                {([
                  ["Memos", "memos"],
                  ["Stock entries", "events"],
                  ["Orders", "orders"],
                  ["List names", "parties"],
                ] as const).map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{sqlCheck.r2[key].toLocaleString()}</td>
                    <td className={sqlCheck.sql[key] >= sqlCheck.r2[key] ? "bk-ok" : ""}>
                      {sqlCheck.sql[key].toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="bk-lede">
              {sqlCheck.live
                ? "The portal is reading memos from the database now. The R2 file is left as it was on the day of the move."
                : "The portal is still reading memos from the R2 file."}
            </p>
          </>
        )}
        {sqlCheck?.hint && <p className="party-warn">{sqlCheck.hint}</p>}

        {sqlReport && (
          <>
            <table className="bk-table">
              <thead>
                <tr><th>Records</th><th>Copied in</th><th>Already there</th></tr>
              </thead>
              <tbody>
                {([
                  ["Memos", "memos"],
                  ["Stock entries", "events"],
                  ["Orders", "orders"],
                  ["List names", "parties"],
                ] as const).map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="bk-ok">{sqlReport.copied[key].toLocaleString()}</td>
                    <td>{sqlReport.skipped[key].toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sqlReport.notes.map((note, i) => (
              <p key={i} className={sqlReport.finished ? "bk-lede" : "bk-more"}>{note}</p>
            ))}
          </>
        )}
      </div>

      <div className="bk-card">
        <h2>The jangad register into the Cloudflare database</h2>
        <p className="bk-lede">
          This is the one that had to move. The register is the biggest ledger
          in the portal, thousands of entries of twenty-eight columns, and
          filling in one cell rewrote the whole register. It had grown past the
          10 thousandths of a second of computing time this free plan allows, so
          the save was being cut off part way through and the register page was
          failing outright. Cloudflare&rsquo;s own database writes one entry as
          one line, and stays the same speed at forty thousand entries as at
          four hundred.
        </p>
        <p className="bk-lede">
          This card moves the register only. The other three cards are separate
          moves, and they can be done in any order, or one without the others.
        </p>
        {sqlHint ? (
          <p className={sqlAttached ? "bk-lede" : "party-warn"}>{sqlHint}</p>
        ) : (
          <p className="bk-lede">
            The database is attached. The entries are copied into it, and the
            portal only starts reading the register from it once every entry is
            across. Before that moment nothing changes for anybody.
          </p>
        )}
        <p className="bk-lede">
          <b>Check</b> counts what is in each store and says nothing else.{" "}
          <b>Copy the register across</b> reads the R2 file and writes what the
          database has not got yet. Neither one writes to R2, neither one
          deletes anything, and both are safe to press more than once. If there
          are more entries than one press can carry, it says so and the next
          press carries on from there.
        </p>
        <div className="bk-actions">
          <button className="btn" onClick={checkJangadD1} disabled={jgBusy}>
            {jgBusy ? "Working…" : "Check"}
          </button>
          <button
            className="btn primary"
            onClick={copyJangadToD1}
            disabled={jgBusy || !sqlAttached || !r2Configured}
          >
            Copy the register across
          </button>
        </div>
        {jgError && <p className="party-warn">{jgError}</p>}

        {jgCheck && !jgCheck.hint && (
          <>
            <table className="bk-table">
              <thead>
                <tr><th>Records</th><th>In the R2 file</th><th>In the database</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Register entries</td>
                  <td>{jgCheck.r2.rows.toLocaleString()}</td>
                  <td className={jgCheck.sql.rows >= jgCheck.r2.rows ? "bk-ok" : ""}>
                    {jgCheck.sql.rows.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="bk-lede">
              {jgCheck.live
                ? "The portal is reading the register from the database now. The R2 file is left as it was on the day of the move."
                : "The portal is still reading the register from the R2 file."}
            </p>
          </>
        )}
        {jgCheck?.hint && <p className="party-warn">{jgCheck.hint}</p>}

        {jgReport && (
          <>
            <table className="bk-table">
              <thead>
                <tr><th>Records</th><th>Copied in</th><th>Already there</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Register entries</td>
                  <td className="bk-ok">{jgReport.copied.rows.toLocaleString()}</td>
                  <td>{jgReport.skipped.rows.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            {jgReport.notes.map((note, i) => (
              <p key={i} className={jgReport.finished ? "bk-lede" : "bk-more"}>{note}</p>
            ))}
          </>
        )}
      </div>

      <div className="bk-card">
        <h2>The PD sheets into the Cloudflare database</h2>
        <p className="bk-lede">
          The heaviest save left in the portal. Every design sheet sits in one
          file, so ticking one piece of one design as being made rewrites every
          sheet in the book, and so does changing a photo, and so do the
          diamonds going out on the jangad, which moves the sheet on by itself.
          Cloudflare&rsquo;s own database writes one sheet as one line, and
          stays the same speed at four thousand sheets as at four hundred.
        </p>
        <p className="bk-lede">
          This card moves the design sheets only. The other three cards are
          separate moves, and they can be done in any order, or one without the
          others. The design numbers and the pieces on each sheet go across with
          it, because they are part of the sheet.
        </p>
        {sqlHint ? (
          <p className={sqlAttached ? "bk-lede" : "party-warn"}>{sqlHint}</p>
        ) : (
          <p className="bk-lede">
            The database is attached. The sheets are copied into it, and the
            portal only starts reading them from it once every sheet is across.
            Before that moment nothing changes for anybody.
          </p>
        )}
        <p className="bk-lede">
          <b>Check</b> counts what is in each store and says nothing else.{" "}
          <b>Copy the sheets across</b> reads the R2 file and writes what the
          database has not got yet. Neither one writes to R2, neither one
          deletes anything, and both are safe to press more than once. If there
          are more sheets than one press can carry, it says so and the next
          press carries on from there.
        </p>
        <div className="bk-actions">
          <button className="btn" onClick={checkPdD1} disabled={pdBusy}>
            {pdBusy ? "Working…" : "Check"}
          </button>
          <button
            className="btn primary"
            onClick={copyPdToD1}
            disabled={pdBusy || !sqlAttached || !r2Configured}
          >
            Copy the sheets across
          </button>
        </div>
        {pdError && <p className="party-warn">{pdError}</p>}

        {pdCheck && !pdCheck.hint && (
          <>
            <table className="bk-table">
              <thead>
                <tr><th>Records</th><th>In the R2 file</th><th>In the database</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>PD sheets</td>
                  <td>{pdCheck.r2.sheets.toLocaleString()}</td>
                  <td className={pdCheck.sql.sheets >= pdCheck.r2.sheets ? "bk-ok" : ""}>
                    {pdCheck.sql.sheets.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="bk-lede">
              {pdCheck.live
                ? "The portal is reading the PD sheets from the database now. The R2 file is left as it was on the day of the move."
                : "The portal is still reading the PD sheets from the R2 file."}
            </p>
          </>
        )}
        {pdCheck?.hint && <p className="party-warn">{pdCheck.hint}</p>}

        {pdReport && (
          <>
            <table className="bk-table">
              <thead>
                <tr><th>Records</th><th>Copied in</th><th>Already there</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>PD sheets</td>
                  <td className="bk-ok">{pdReport.copied.sheets.toLocaleString()}</td>
                  <td>{pdReport.skipped.sheets.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            {pdReport.notes.map((note, i) => (
              <p key={i} className={pdReport.finished ? "bk-lede" : "bk-more"}>{note}</p>
            ))}
          </>
        )}
      </div>

      <div className="bk-card">
        <h2>The diamond demands into the Cloudflare database</h2>
        <p className="bk-lede">
          The smallest of the five books, and not the one in trouble. It sits
          beside the PD sheets in the same screens and the same trace, and
          leaving it behind would mean two places to look every time somebody
          follows a design from its sheet to its diamonds. Here too a save
          becomes one line instead of the whole book.
        </p>
        <p className="bk-lede">
          This card moves the demands only. <b>The receipt chase is not part of
          it</b> and is not touched: the reminders about diamonds that have not
          come back keep their own file and go on working exactly as they do
          today, whichever store the demands are in.
        </p>
        {sqlHint ? (
          <p className={sqlAttached ? "bk-lede" : "party-warn"}>{sqlHint}</p>
        ) : (
          <p className="bk-lede">
            The database is attached. The demands are copied into it, and the
            portal only starts reading them from it once every demand is across.
            Before that moment nothing changes for anybody.
          </p>
        )}
        <p className="bk-lede">
          <b>Check</b> counts what is in each store and says nothing else.{" "}
          <b>Copy the demands across</b> reads the R2 file and writes what the
          database has not got yet. Neither one writes to R2, neither one
          deletes anything, and both are safe to press more than once. If there
          are more demands than one press can carry, it says so and the next
          press carries on from there.
        </p>
        <div className="bk-actions">
          <button className="btn" onClick={checkDemandD1} disabled={ddBusy}>
            {ddBusy ? "Working…" : "Check"}
          </button>
          <button
            className="btn primary"
            onClick={copyDemandToD1}
            disabled={ddBusy || !sqlAttached || !r2Configured}
          >
            Copy the demands across
          </button>
        </div>
        {ddError && <p className="party-warn">{ddError}</p>}

        {ddCheck && !ddCheck.hint && (
          <>
            <table className="bk-table">
              <thead>
                <tr><th>Records</th><th>In the R2 file</th><th>In the database</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Diamond demands</td>
                  <td>{ddCheck.r2.demands.toLocaleString()}</td>
                  <td className={ddCheck.sql.demands >= ddCheck.r2.demands ? "bk-ok" : ""}>
                    {ddCheck.sql.demands.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="bk-lede">
              {ddCheck.live
                ? "The portal is reading the demands from the database now. The R2 file is left as it was on the day of the move."
                : "The portal is still reading the demands from the R2 file."}
            </p>
          </>
        )}
        {ddCheck?.hint && <p className="party-warn">{ddCheck.hint}</p>}

        {ddReport && (
          <>
            <table className="bk-table">
              <thead>
                <tr><th>Records</th><th>Copied in</th><th>Already there</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Diamond demands</td>
                  <td className="bk-ok">{ddReport.copied.demands.toLocaleString()}</td>
                  <td>{ddReport.skipped.demands.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            {ddReport.notes.map((note, i) => (
              <p key={i} className={ddReport.finished ? "bk-lede" : "bk-more"}>{note}</p>
            ))}
          </>
        )}
      </div>

      <div className="bk-card">
        <h2>The stock book into the Cloudflare database</h2>
        <p className="bk-lede">
          The last book still kept as one file, and the second one that was
          already over budget. Taking one piece into stock rewrites every entry
          in the book: measured on the 3,429 entries it holds today, that is 2.5
          megabytes read and written and about 18 thousandths of a second of
          computing time, against the 10 this free plan allows. The same file was
          also being handed whole to the Stock Book page. Cloudflare&rsquo;s own
          database writes one entry as one line, and stays the same speed at six
          thousand entries as at five hundred.
        </p>
        <p className="bk-lede">
          This card moves the stock book only. The stock numbers go across with
          it, so S0411 still follows S0410 afterwards. The price list is not part
          of it and is not touched: the gold, labour and diamond rates keep their
          own file, and every figure on the Stock Book page is still worked out
          from them as it is read.
        </p>
        {sqlHint ? (
          <p className={sqlAttached ? "bk-lede" : "party-warn"}>{sqlHint}</p>
        ) : (
          <p className="bk-lede">
            The database is attached. The entries are copied into it, and the
            portal only starts reading the book from it once every entry is
            across. Before that moment nothing changes for anybody.
          </p>
        )}
        <p className="bk-lede">
          <b>Check</b> counts what is in each store and says nothing else.{" "}
          <b>Copy the stock book across</b> reads the R2 file and writes what the
          database has not got yet. Neither one writes to R2, neither one
          deletes anything, and both are safe to press more than once. If there
          are more entries than one press can carry, it says so and the next
          press carries on from there.
        </p>
        <div className="bk-actions">
          <button className="btn" onClick={checkStockD1} disabled={sbBusy}>
            {sbBusy ? "Working…" : "Check"}
          </button>
          <button
            className="btn primary"
            onClick={copyStockToD1}
            disabled={sbBusy || !sqlAttached || !r2Configured}
          >
            Copy the stock book across
          </button>
        </div>
        {sbError && <p className="party-warn">{sbError}</p>}

        {sbCheck && !sbCheck.hint && (
          <>
            <table className="bk-table">
              <thead>
                <tr><th>Records</th><th>In the R2 file</th><th>In the database</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Stock entries</td>
                  <td>{sbCheck.r2.entries.toLocaleString()}</td>
                  <td className={sbCheck.sql.entries >= sbCheck.r2.entries ? "bk-ok" : ""}>
                    {sbCheck.sql.entries.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="bk-lede">
              {sbCheck.live
                ? "The portal is reading the stock book from the database now. The R2 file is left as it was on the day of the move."
                : "The portal is still reading the stock book from the R2 file."}
            </p>
          </>
        )}
        {sbCheck?.hint && <p className="party-warn">{sbCheck.hint}</p>}

        {sbReport && (
          <>
            <table className="bk-table">
              <thead>
                <tr><th>Records</th><th>Copied in</th><th>Already there</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Stock entries</td>
                  <td className="bk-ok">{sbReport.copied.entries.toLocaleString()}</td>
                  <td>{sbReport.skipped.entries.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            {sbReport.notes.map((note, i) => (
              <p key={i} className={sbReport.finished ? "bk-lede" : "bk-more"}>{note}</p>
            ))}
          </>
        )}
      </div>
    </>
  );
}
