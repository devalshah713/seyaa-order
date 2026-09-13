import Link from "next/link";
import { notFound } from "next/navigation";
import DemandSheetView from "@/components/DemandSheetView";
import { getDemand } from "@/lib/demandStore";
import AutoPrint from "@/app/AutoPrint";
import DemandActions from "./DemandActions";

export const dynamic = "force-dynamic";

export default async function DemandViewPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdf?: string; print?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const demand = await getDemand(params.id).catch(() => null);
  if (!demand) notFound();

  // ?pdf=1 hides the action bar, so what is printed is the demand and nothing
  // else. ?print=1 opens the print dialog on arrival — that is what the PDF
  // links in the history list do.
  const forPdf = searchParams.pdf === "1";
  const autoPrint = searchParams.print === "1";

  return (
    <>
      {autoPrint && <AutoPrint />}
      {!forPdf && (
        <div className="wrap no-print" style={{ paddingBottom: 0 }}>
          <div className="page-head">
            <Link href="/demand" className="btn">← Demands</Link>
            <DemandActions id={params.id} />
          </div>
        </div>
      )}
      <div className="stage">
        <DemandSheetView
          data={{
            demandNo: demand.demandNo,
            date: demand.date,
            issuedTo: demand.issuedTo,
            notes: demand.notes,
            pdNo: demand.pdNo,
            rows: demand.rows,
          }}
        />
      </div>
    </>
  );
}
