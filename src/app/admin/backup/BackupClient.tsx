"use client";
import { useEffect, useState } from "react";

// Where everything is kept, and the two copies of it — said plainly enough that
// anyone can check the copies are actually happening rather than take it on
// trust.

type TabResult = { tab: string; rows: number; error?: string };

type MigrateBatch = {
  sheets: number;
  stillOnBlobBefore: number;
  attempted: number;
  moved: number;
  failed: number;
  remaining: number;
  detail: { pdNo: string; sku: string; error?: string }[];
};

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

  // --- Moving the old design photos to Cloudinary --------------------------
  // A one-off, and the only reason it is a button rather than something that
  // just happens is that it rewrites every PD sheet's photo and somebody
  // should be watching when it does.
  //
  // The route works in batches so it cannot outlast a request timeout, which
  // means somebody has to keep asking until it says there is nothing left.
  // Doing that here rather than in a console is the whole point of this card.
  const [moving, setMoving] = useState(false);
  const [moved, setMoved] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const [totalToMove, setTotalToMove] = useState<number | null>(null);
  const [badPhotos, setBadPhotos] = useState<{ pdNo: string; sku: string; error?: string }[]>([]);
  const [moveError, setMoveError] = useState("");
  const [moveDone, setMoveDone] = useState(false);

  async function movePhotos() {
    setMoving(true);
    setMoveError(""); setMoveDone(false);
    setMoved(0); setLeft(null); setTotalToMove(null); setBadPhotos([]);
    let done = 0;
    try {
      // Bounded rather than "while there is more": a route that always
      // reported work left would otherwise spin here for ever.
      for (let round = 0; round < 200; round++) {
        const res = await fetch("/api/pd/migrate-photos", { method: "POST" });
        const b = (await res.json().catch(() => ({}))) as Partial<MigrateBatch> & { error?: string };
        if (!res.ok) throw new Error(b.error || "The move was refused.");

        if (round === 0) setTotalToMove(b.stillOnBlobBefore ?? 0);
        done += b.moved ?? 0;
        setMoved(done);
        setLeft(b.remaining ?? 0);
        if (b.detail?.length) {
          setBadPhotos((cur) => [...cur, ...b.detail!.filter((d) => d.error)]);
        }
        if (!b.remaining) break;
        // A batch that moved nothing but still reports work left would loop
        // without end — stop and say so rather than hammering the store.
        if (!b.moved) throw new Error("Nothing moved on that pass; the rest need looking at by hand.");
      }
      setMoveDone(true);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "The move did not finish.");
    } finally {
      setMoving(false);
    }
  }

  return (
    <>
      <div className="bk-card">
        <h2>Design photos</h2>
        <p className="bk-lede">
          New photos go straight from the browser to Cloudinary and never touch
          this portal. Photos taken before that change are still in the
          portal&rsquo;s own storage — they display perfectly well, but they are
          what used the storage allowance up, so they are worth moving across.
        </p>
        <p className="bk-lede">
          This is a <b>one-off</b>. It is safe to press twice: it only touches
          photos that have not moved yet, and a sheet is either moved or not —
          both display either way. Nothing else on a sheet is altered.
        </p>
        <button className="btn btn-primary" onClick={movePhotos} disabled={moving}>
          {moving ? "Moving…" : "Move old photos to Cloudinary"}
        </button>

        {(moving || moveDone || moveError) && (
          <p className="bk-lede" style={{ marginTop: 12 }}>
            {totalToMove === 0
              ? "Nothing to move — every photo is already on Cloudinary."
              : <>Moved <b>{moved}</b>{totalToMove ? ` of ${totalToMove}` : ""}
                  {left !== null && left > 0 ? `, ${left} to go…` : ""}</>}
          </p>
        )}
        {moveDone && totalToMove !== 0 && (
          <p className="bk-lede"><b>Finished.</b> Open a PD sheet and check its photo still shows.</p>
        )}
        {badPhotos.length > 0 && (
          <>
            <p className="party-warn">
              {badPhotos.length} photo{badPhotos.length === 1 ? "" : "s"} could not be moved.
              Those sheets still show their photo from the old storage, so nothing is lost —
              but they need looking at:
            </p>
            <ul className="bk-list">
              {badPhotos.map((b, i) => (
                <li key={i}><b>{b.pdNo}</b> {b.sku} — {b.error}</li>
              ))}
            </ul>
          </>
        )}
        {moveError && <p className="save-error">{moveError}</p>}
      </div>

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
