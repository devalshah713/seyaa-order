import { notFound } from "next/navigation";
import { getDemand } from "@/lib/demandStore";
import DemandForm from "../../new/DemandForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Diamond Demand — Seyaa Solitaire" };

export default async function EditDemandPage({ params }: { params: { id: string } }) {
  const d = await getDemand(params.id).catch(() => null);
  if (!d) notFound();

  return (
    <DemandForm
      initial={{
        id: d.id, demandNo: d.demandNo, date: d.date,
        issuedTo: d.issuedTo, notes: d.notes, rows: d.rows,
        pdId: d.pdId, pdNo: d.pdNo,
      }}
    />
  );
}
