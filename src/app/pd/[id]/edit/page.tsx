import { notFound } from "next/navigation";
import { getPdSheet } from "@/lib/pdStore";
import PdForm from "../../new/PdForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit PD Sheet — Seyaa Solitaire" };

export default async function EditPdPage({ params }: { params: { id: string } }) {
  const s = await getPdSheet(params.id).catch(() => null);
  if (!s) notFound();

  return (
    <PdForm
      initial={{
        id: s.id, pdNo: s.pdNo, photoPath: s.photoPath, sku: s.sku,
        product: s.product, category: s.category || s.product,
        subCategory: s.subCategory, subSubCategory: s.subSubCategory || "",
        type: s.type, tdw: s.tdw || "",
        diaQuality: s.diaQuality, goldWeight: s.goldWeight, locks: s.locks,
        orderType: s.orderType, assignedDate: s.assignedDate,
        assignedTo: s.assignedTo, size: s.size, diaShape: s.diaShape, zone: s.zone,
        goldPurity: s.goldPurity, goldColor: s.goldColor, priceRange: s.priceRange,
        diaWeightPointers: s.diaWeightPointers, quantity: s.quantity,
        orderBy: s.orderBy, deliveryDate: s.deliveryDate,
        pdMerchandiser: s.pdMerchandiser, remarks: s.remarks,
        diaLines: s.diaLines,
      }}
    />
  );
}
