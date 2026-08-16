import Link from "next/link";
import { notFound } from "next/navigation";
import PdSheetView from "@/components/PdSheetView";
import { getPdSheet } from "@/lib/pdStore";
import PdActions from "./PdActions";
import PiecesPanel from "./PiecesPanel";

export const dynamic = "force-dynamic";

export default async function PdViewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { pdf?: string };
}) {
  const sheet = await getPdSheet(params.id).catch(() => null);
  if (!sheet) notFound();

  // ?pdf=1 is the render target for the PDF generator — no action bar.
  const forPdf = searchParams.pdf === "1";
  const photoUrl = sheet.photoPath
    ? `/api/photo?p=${encodeURIComponent(sheet.photoPath)}`
    : "";

  return (
    <>
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
