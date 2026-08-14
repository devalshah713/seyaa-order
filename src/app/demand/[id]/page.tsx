import Link from "next/link";
import { notFound } from "next/navigation";
import DemandSheetView from "@/components/DemandSheetView";
import { getDemand } from "@/lib/demandStore";
import DemandActions from "./DemandActions";

export const dynamic = "force-dynamic";

export default async function DemandViewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { pdf?: string };
}) {
  const demand = await getDemand(params.id).catch(() => null);
  if (!demand) notFound();

  const forPdf = searchParams.pdf === "1";

  return (
    <>
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
