import Link from "next/link";
import { notFound } from "next/navigation";
import { getCadRequest } from "@/lib/memoStore";
import { formatDate } from "@/lib/memoFormat";
import {
  cadActionWords, cadStatusLabel, canAddCad, canDecideCad, canDeleteCad, canEditCad,
  canMakeOrder, latestCadImages, type CadRequest,
} from "@/lib/cadConfig";
import { buildCadMessage } from "@/lib/cadMessage";
import { photoSrc } from "@/lib/cloudinary";
import { currentSession } from "@/lib/currentUser";
import CadActions, { type SharePhoto } from "./CadActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "CAD Request — Seyaa Solitaire" };

function Row({ label, value }: { label: string; value?: string | number }) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) return null;
  return (
    <div className="ord-row">
      <span>{label}</span>
      <strong>{text}</strong>
    </div>
  );
}

const when = (iso: string) => `${formatDate(iso.slice(0, 10))} ${iso.slice(11, 16)}`;

// What goes to the factory with the message. The request itself the first
// time: the customer's photos and the certificate. When changes are asked, the
// CAD being changed, because that is the drawing the factory has to correct.
function photosToSend(r: CadRequest): SharePhoto[] {
  const base = r.cadNo.replace(/\//g, "-");
  if (r.status === "changes") {
    return latestCadImages(r).map((c, i) => ({ url: c.url, name: `${base}-cad-${i + 1}.jpg` }));
  }
  const out: SharePhoto[] = r.refPhotos.map((p, i) => ({ url: p.url, name: `${base}-photo-${i + 1}.jpg` }));
  if (r.stone.certPhoto?.url) out.push({ url: r.stone.certPhoto.url, name: `${base}-certificate.jpg` });
  return out;
}

export default async function CadRequestPage(props: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  const { id } = await props.params;

  // "Not found" and "could not be read" are different sentences.
  let request: CadRequest | null = null;
  let error = "";
  try {
    request = await getCadRequest(id);
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
  if (!request) notFound();
  const r = request;

  const me = { username: session?.username || "", isAdmin: session?.role === "admin" };
  const s = r.stone;
  const latest = latestCadImages(r);
  const latestRound = latest[0]?.round || 0;
  const earlier = r.cadImages.filter((c) => (c.round || 1) !== latestRound);

  return (
    <div className="wrap cad-page">
      <div className="page-head">
        <h1>{r.cadNo}</h1>
        <p>
          {formatDate(r.date)} · {r.factory} ·{" "}
          <span className={`cad-state cad-${r.status}`}>{cadStatusLabel(r.status)}</span>
        </p>
        <Link href="/orders/cad" className="btn">← All CAD requests</Link>
        {canEditCad(r, me) && (
          <Link href={`/orders/cad/${r.id}/edit`} className="btn">Change details</Link>
        )}
      </div>

      {r.status === "changes" && r.changeNote && (
        <section className="cad-note cad-note-changes">
          <h2>Changes asked</h2>
          <p>{r.changeNote}</p>
          <p className="hint">Send this to the factory. When the new CAD comes, put it on below.</p>
        </section>
      )}

      <section className="cad-block">
        <h2>Reference photos</h2>
        <div className="cad-gallery">
          {r.refPhotos.map((p, i) => (
            <a key={p.url} href={photoSrc(p.url)} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc(p.url)} alt={`Reference ${i + 1}`} />
            </a>
          ))}
        </div>
      </section>

      <div className="ord-facts cad-facts">
        <h2>Centre stone</h2>
        <Row label="Certificate" value={s.lab === "None" ? "No certificate" : `${s.lab} ${s.certNo}`} />
        <Row label="Shape" value={s.shape} />
        <Row label="Weight" value={s.carats ? `${s.carats} ct` : ""} />
        <Row label="Colour" value={s.colour} />
        <Row label="Clarity" value={s.clarity} />
        <Row label="Measurements" value={s.measurements ? `${s.measurements} mm` : ""} />
        {s.certPhoto?.url && (
          <div className="ord-row">
            <span>Certificate photo</span>
            <strong>
              <a
                href={photoSrc(s.certPhoto.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
              >
                Open the certificate
              </a>
            </strong>
          </div>
        )}

        <h2 className="cad-sub">Piece</h2>
        <Row label="Factory" value={r.factory} />
        <Row label="Category" value={r.category} />
        <Row label="Gold" value={r.goldDetails} />
        <Row label="Size" value={r.size} />
        <Row label="Side stones" value={r.sideStones} />
        <Row label="Notes" value={r.notes} />
        {r.orderId && (
          <div className="ord-row">
            <span>Became order</span>
            <strong>
              <Link href={`/orders/${r.orderId}`}>{r.orderNo || r.orderId}</Link>
            </strong>
          </div>
        )}
        <div className="ord-stamp">
          <Row label="Raised by" value={r.enteredBy || "not recorded"} />
          <Row label="Raised on" value={when(r.createdAt)} />
        </div>
      </div>

      <section className="cad-block">
        <h2>CAD from the factory</h2>
        {latest.length === 0 ? (
          <p className="hint">No CAD has come back yet.</p>
        ) : (
          <>
            {latestRound > 1 && <p className="hint">The latest CAD, after changes.</p>}
            <div className="cad-gallery cad-gallery-big">
              {latest.map((c, i) => (
                <a key={c.url} href={photoSrc(c.url)} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoSrc(c.url)} alt={`CAD ${i + 1}`} />
                </a>
              ))}
            </div>
            <p className="hint">Put on by {latest[0].by} on {when(latest[0].at)}.</p>
          </>
        )}
        {earlier.length > 0 && (
          <details className="cad-earlier">
            <summary>Earlier CADs ({earlier.length})</summary>
            <div className="cad-gallery">
              {earlier.map((c, i) => (
                <a key={c.url} href={photoSrc(c.url)} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoSrc(c.url)} alt={`Earlier CAD ${i + 1}`} />
                </a>
              ))}
            </div>
          </details>
        )}
      </section>

      <CadActions
        id={r.id}
        cadNo={r.cadNo}
        status={r.status}
        text={buildCadMessage(r)}
        photos={photosToSend(r)}
        canAdd={canAddCad(r)}
        canApprove={canDecideCad(r, me, "approve")}
        canAskChanges={canDecideCad(r, me, "changes")}
        canOrder={canMakeOrder(r)}
        canDelete={canDeleteCad(r, me)}
        isAdmin={me.isAdmin}
      />

      <section className="ord-notes cad-log">
        <h2>What happened</h2>
        {r.log.map((e) => (
          <div key={e.id} className="ord-row">
            <span>{when(e.at)}</span>
            <strong>
              {cadActionWords(e.action)} by {e.by}
              {e.note ? `: ${e.note}` : ""}
            </strong>
          </div>
        ))}
      </section>
    </div>
  );
}
