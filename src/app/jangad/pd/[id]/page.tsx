import Link from "next/link";
import { notFound } from "next/navigation";
import PdSheetView from "@/components/PdSheetView";
import { getPdSheet } from "@/lib/pdStore";

export const dynamic = "force-dynamic";
export const metadata = { title: "PD Sheet — Seyaa Solitaire" };

// The PD sheet as the accounts desk needs it while issuing diamonds: to read,
// and nothing else.
//
// It lives under /jangad rather than /pd on purpose. Access is by path, so a
// page under /pd would be shut to the very people this is for — the accounts
// team have the jangad module and not the design one. Putting the sheet here
// hands them the reading of it without handing them the module: there is no
// Edit, no Delete, no pieces panel, and no way in but from the design they are
// working on.
export default async function JangadPdView({ params }: { params: { id: string } }) {
  const sheet = await getPdSheet(params.id).catch(() => null);
  if (!sheet) notFound();

  const photoUrl = sheet.photoPath
    ? `/api/photo?p=${encodeURIComponent(sheet.photoPath)}`
    : "";

  return (
    <>
      <div className="wrap no-print" style={{ paddingBottom: 0 }}>
        <div className="page-head">
          <Link href="/jangad/new" className="btn">← Issue Diamonds</Link>
          <span className="pd-readonly">
            {sheet.pdNo} · <b>{sheet.sku}</b> · view only
          </span>
        </div>
      </div>
      <div className="stage">
        <PdSheetView data={{ ...sheet, photoUrl }} />
      </div>

      {/* The sheet's own photo box is a fixed slot on a paper replica: 176px
          tall and cropped to fill, which is fine for a printed sheet and no use
          for telling one bracelet from another. The design is what the packet
          is being checked against, so it is also shown whole, at a size worth
          looking at, with the original a click away. */}
      {photoUrl && (
        <div className="wrap no-print">
          <figure className="pd-photo-big">
            <figcaption>
              Design photo
              <a href={photoUrl} target="_blank" rel="noreferrer">Open full size ↗</a>
            </figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt={`Design ${sheet.sku}`} />
          </figure>
        </div>
      )}
    </>
  );
}
