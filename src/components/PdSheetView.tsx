import { COMPANY, formatDate } from "@/lib/memoFormat";
import { sizeLabel } from "@/lib/pdConfig";

export type PdSheetData = {
  pdNo?: string;
  photoUrl?: string;
  sku: string;
  product: string;
  category: string;
  subCategory: string;
  subSubCategory?: string;
  type: string;
  diaQuality: string;
  goldWeight: string;
  locks: string;
  orderType: string;
  assignedDate: string;
  assignedTo: string;
  size: string;
  diaShape: string;
  zone: string;
  goldPurity: string;
  goldColor: string;
  priceRange: string;
  diaWeightPointers: string;
  quantity: string;
  orderBy: string;
  deliveryDate: string;
  pdMerchandiser: string;
  remarks: string;
};

function goldShort(color: string): string {
  const c = color.trim().toLowerCase();
  if (c.startsWith("white")) return "WG";
  if (c.startsWith("yellow")) return "YG";
  if (c.startsWith("rose")) return "RG";
  return color;
}

type Cell = { label: string; value: string; accent?: boolean };

// Print-ready A4 replica of the paper "PD SHEET".
export default function PdSheetView({ data }: { data: PdSheetData }) {
  const d = (v: string) => (v ? formatDate(v) : "");
  const purity = [data.goldPurity, data.goldColor && `(${goldShort(data.goldColor)})`]
    .filter(Boolean)
    .join(" ");

  const left: Cell[] = [
    { label: "SKU No.", value: data.sku },
    { label: "Category", value: data.category || data.product, accent: true },
    { label: "Sub-category", value: data.subCategory },
    { label: "Sub-sub-category", value: data.subSubCategory || "" },
    { label: "Type", value: data.type },
    { label: "Dia. quality", value: data.diaQuality },
    { label: "Gold weight", value: data.goldWeight },
    { label: "Locks", value: data.locks },
    { label: "Order Type", value: data.orderType },
    { label: "Assigned date", value: d(data.assignedDate) },
  ];

  const right: Cell[] = [
    { label: "Assigned to", value: data.assignedTo },
    { label: sizeLabel(data.category || data.product), value: data.size, accent: true },
    { label: "Dia. Shape", value: data.diaShape },
    { label: "Zone", value: data.zone },
    { label: "Gold purity", value: purity },
    { label: "Price Range", value: data.priceRange },
    { label: "Dia. Weight & Pointers", value: data.diaWeightPointers },
    { label: "Quantity", value: data.quantity },
    { label: "Order by", value: data.orderBy },
    { label: "Delivery date", value: d(data.deliveryDate) },
  ];

  // Third column: heading, then the merchandiser's name, then blank rows.
  const merch = (i: number) => {
    if (i === 0) return <span className="pd-merch-head">PD Merchandiser</span>;
    if (i === 1) return <span className="pd-merch-name">{data.pdMerchandiser}</span>;
    return null;
  };

  return (
    <div className="pd-sheet">
      <span className="pd-rail left" aria-hidden="true" />
      <span className="pd-rail right" aria-hidden="true" />

      <h2 className="pd-title">{COMPANY.name}</h2>

      <div className="pd-top">
        <div className="pd-photo">
          {data.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.photoUrl} alt="Design reference" />
          ) : null}
        </div>
        <div className="pd-toplabel">
          {`${(data.zone || "").toUpperCase()} PD SHEET`.trim()}
        </div>
      </div>

      <table className="pd-table">
        <colgroup>
          <col className="c-lab" />
          <col className="c-val" />
          <col className="c-lab2" />
          <col className="c-val" />
          <col className="c-merch" />
        </colgroup>
        <tbody>
          {left.map((l, i) => (
            <tr key={i}>
              <td className="lab">{l.label} &ndash;</td>
              <td className={l.accent ? "val accent" : "val"}>{l.value}</td>
              <td className="lab">{right[i].label} &ndash;</td>
              <td className={right[i].accent ? "val accent" : "val"}>{right[i].value}</td>
              <td className="merch">{merch(i)}</td>
            </tr>
          ))}
          <tr>
            <td className="lab">Remarks &ndash;</td>
            <td className="val remarks" colSpan={4}>{data.remarks}</td>
          </tr>
          <tr className="spacer">
            <td colSpan={5}>&nbsp;</td>
          </tr>
          <tr>
            <td className="lab sign" colSpan={5}>Signature</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
