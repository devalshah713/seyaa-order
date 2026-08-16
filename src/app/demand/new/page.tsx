import { getPdSheet } from "@/lib/pdStore";
import { rowsFromPdSheet } from "@/lib/demandConfig";
import { todayInput } from "@/lib/memoFormat";
import DemandForm from "./DemandForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New Diamond Demand — Seyaa Solitaire" };

// ?pd=<id> seeds the demand from that PD sheet: its design number and one row
// per diamond size already entered there.
export default async function NewDemandPage({
  searchParams,
}: {
  searchParams: { pd?: string };
}) {
  const pdId = searchParams.pd;
  const sheet = pdId ? await getPdSheet(pdId).catch(() => null) : null;
  if (!sheet) return <DemandForm />;

  return (
    <DemandForm
      initial={{
        id: "",
        demandNo: "",
        date: todayInput(),
        issuedTo: "",
        notes: "",
        rows: rowsFromPdSheet(sheet.sku || sheet.pdNo, sheet.diaLines, sheet.quantity),
        pdId: sheet.id,
        pdNo: sheet.pdNo,
      }}
    />
  );
}
