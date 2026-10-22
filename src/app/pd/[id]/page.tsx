import Link from "next/link";
import { notFound } from "next/navigation";
import PdSheetView from "@/components/PdSheetView";
import { getPdSheet } from "@/lib/pdStore";
import { photoSrc } from "@/lib/cloudinary";
import AutoPrint from "@/app/AutoPrint";
import PdActions from "./PdActions";
import PiecesPanel from "./PiecesPanel";

export const dynamic = "force-dynamic";

export default async function PdViewPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdf?: string; print?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const sheet = await getPdSheet(params.id).catch(() => null);
  if (!sheet) notFound();

  // ?pdf=1 hides the action bar, so what is printed is the sheet and nothing
  // else. ?print=1 opens the print dialog on arrival — that is what the PDF
  // links in the history list do.
  const forPdf = searchParams.pdf === "1";
  const autoPrint = searchParams.print === "1";
  const photoUrl = photoSrc(sheet.photoPath);

  return (
    <>
      {autoPrint && <AutoPrint />}
      {!forPdf && (
        <div className="wrap no-print" style={{ paddingBottom: 0 }}>
          <div className="page-head">
            <Link href="/pd" className="btn">← PD Sheets</Link>
            <PdActions id={params.id} />
          </div>
        </div>
      )}
      <div className="stage">
        <PdSheetView data={{ ...sheet, photoUrl }} />
      </div>
      {/* The way back. A sheet started from an order has to be findable from
          that order and the order from it, or the pair is only a pair in
          somebody's memory. */}
      {!forPdf && sheet.fromOrderId && (
        <div className="wrap" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div className="ord-pd">
            <h2>Started from an order</h2>
            <p className="hint">
              This sheet was started from order <b>{sheet.fromOrderNo || sheet.fromOrderId}</b>.
            </p>
            <Link href={`/orders/${sheet.fromOrderId}`} className="btn">
              Open the order
            </Link>
          </div>
        </div>
      )}
      {!forPdf && (
        <div className="wrap">
          <PiecesPanel
            id={sheet.id}
            designNo={sheet.sku}
            pieces={sheet.pieces || []}
          />
        </div>
      )}
    </>
  );
}
