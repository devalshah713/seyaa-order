import Link from "next/link";
import { listPhotoshoots } from "@/lib/photoshootStore";
import { isStorageConfigured } from "@/lib/sheetStore";

export const dynamic = "force-dynamic";

// Small helper: render a link cell as a clickable "Open" or a dash.
function LinkCell({ href }: { href: string }) {
  if (!href) return <span className="muted">—</span>;
  return <a href={href} target="_blank" rel="noreferrer">Open</a>;
}

export default async function PhotoshootPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  if (!isStorageConfigured()) {
    return (
      <main className="container">
        <h1>Photoshoot</h1>
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted">Once the Google Sheet is connected, photoshoot records will appear here.</p>
        </div>
      </main>
    );
  }

  const { q } = searchParams;
  let records = await listPhotoshoots();
  if (q) {
    const needle = q.toLowerCase();
    records = records.filter(
      (r) =>
        r.stockNo.toLowerCase().includes(needle) ||
        r.designName.toLowerCase().includes(needle) ||
        r.goldColor.toLowerCase().includes(needle)
    );
  }

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 20 }}>
        <div>
          <h1>Photoshoot &amp; Marketing</h1>
          <p className="muted">
            AI photoshoot & marketing links per stock piece · {records.length} record{records.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/photoshoot/new" className="btn gold">+ New Photoshoot</Link>
      </div>

      <form className="filters no-print" method="get">
        <input name="q" placeholder="Search stock #, design, gold…" defaultValue={q || ""} />
        <button className="btn ghost small" type="submit">Filter</button>
        <Link href="/photoshoot" className="btn ghost small">Reset</Link>
      </form>

      {records.length === 0 ? (
        <div className="card empty">
          No photoshoots yet.{" "}
          <Link href="/photoshoot/new" style={{ color: "var(--gold)", fontWeight: 600 }}>Record one →</Link>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Stock #</th>
              <th>Design Name</th>
              <th>Gold Color</th>
              <th>Date</th>
              <th>Raw</th>
              <th>A</th>
              <th>B</th>
              <th>C</th>
              <th>D</th>
              <th>Video</th>
              <th>IG Post</th>
              <th>IG Reel</th>
              <th>IG Story</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.stockNo}>
                <td style={{ fontWeight: 700 }}>{r.stockNo}</td>
                <td>{r.designName || "—"}</td>
                <td className="muted">{r.goldColor || "—"}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{r.date || "—"}</td>
                <td><LinkCell href={r.rawImages} /></td>
                <td><LinkCell href={r.promptA} /></td>
                <td><LinkCell href={r.promptB} /></td>
                <td><LinkCell href={r.promptC} /></td>
                <td><LinkCell href={r.promptD} /></td>
                <td><LinkCell href={r.video} /></td>
                <td><LinkCell href={r.instagramPost} /></td>
                <td><LinkCell href={r.instagramReel} /></td>
                <td><LinkCell href={r.instagramStory} /></td>
                <td>
                  <Link href={`/photoshoot/new?stock=${encodeURIComponent(r.stockNo)}`} className="btn ghost small">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
