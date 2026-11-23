import Link from "next/link";
import { notFound } from "next/navigation";
import { getCadRequest } from "@/lib/memoStore";
import { COMPANY, formatDate } from "@/lib/memoFormat";
import { cadStatusLabel, latestCadImages, type CadRequest } from "@/lib/cadConfig";
import { photoSrc } from "@/lib/cloudinary";
import { currentSession } from "@/lib/currentUser";
import AutoPrint from "@/app/AutoPrint";
import PrintActions from "@/app/jangad/print/PrintActions";

export const metadata = { title: "CAD Request — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

// The request on one A4 sheet, for the factory: the photos and the details.
// Printed by the browser, like every sheet in the portal. "Save as PDF" in the
// print box makes the file to send. There is no PDF made on the server.
//
// ?print=1 opens the print box as soon as the photos have loaded.
function Line({ label, value }: { label: string; value?: string }) {
  const text = (value || "").trim();
  if (!text) return null;
  return (
    <tr>
      <th>{label}</th>
      <td>{text}</td>
    </tr>
  );
}

export default async function CadPrintPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  await currentSession();
  const { id } = await props.params;
  const { print } = await props.searchParams;

  let r: CadRequest | null = null;
  let error = "";
  try {
    r = await getCadRequest(id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not read the CAD request.";
  }
  if (error) {
    return (
      <div className="wrap">
        <div className="page-head">
          <h1>CAD request</h1>
          <Link href="/orders/cad" className="btn">← All CAD requests</Link>
        </div>
        <div className="notice">This request could not be read. {error}</div>
      </div>
    );
  }
  if (!r) notFound();

  const s = r.stone;
  const cads = latestCadImages(r);
  const changes = r.status === "changes" && r.changeNote;

  return (
    <>
      {print === "1" && <AutoPrint />}
      <div className="wrap no-print" style={{ paddingBottom: 0 }}>
        <div className="page-head">
          <Link href={`/orders/cad/${r.id}`} className="btn">← Back to the request</Link>
          <PrintActions />
        </div>
      </div>
      <div className="stage">
        <div className="cad-sheet">
          <div className="cad-sheet-head">
            <div>
              <h2>{COMPANY.name}</h2>
              <p>{COMPANY.tagline}</p>
            </div>
            <div className="cad-sheet-no">
              <b>CAD request {r.cadNo}</b>
              <span>{formatDate(r.date)}</span>
              <span>For {r.factory}</span>
            </div>
          </div>

          {changes && (
            <div className="cad-sheet-changes">
              <b>Please make these changes to the CAD</b>
              <p>{r.changeNote}</p>
            </div>
          )}

          <div className="cad-sheet-photos">
            {(changes ? cads : r.refPhotos).map((p, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={p.url} src={photoSrc(p.url)} alt={`Photo ${i + 1}`} />
            ))}
          </div>

          <div className="cad-sheet-grid">
            <table className="cad-sheet-table">
              <caption>Centre stone</caption>
              <tbody>
                <Line label="Certificate" value={s.lab === "None" ? "None" : `${s.lab} ${s.certNo}`} />
                <Line label="Shape" value={s.shape} />
                <Line label="Weight" value={s.carats ? `${s.carats} ct` : ""} />
                <Line label="Colour" value={s.colour} />
                <Line label="Clarity" value={s.clarity} />
                <Line label="Measurements" value={s.measurements ? `${s.measurements} mm` : ""} />
              </tbody>
            </table>
            <table className="cad-sheet-table">
              <caption>Piece</caption>
              <tbody>
                <Line label="Category" value={r.category} />
                <Line label="Gold" value={r.goldDetails} />
                <Line label="Size" value={r.size} />
                <Line label="Side stones" value={r.sideStones} />
                <Line label="Notes" value={r.notes} />
              </tbody>
            </table>
          </div>

          {s.certPhoto?.url && !changes && (
            <div className="cad-sheet-cert">
              <b>Certificate</b>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc(s.certPhoto.url)} alt="Certificate" />
            </div>
          )}

          <p className="cad-sheet-foot">
            {cadStatusLabel(r.status)} · raised by {r.enteredBy || "not recorded"}
          </p>
        </div>
      </div>
    </>
  );
}
