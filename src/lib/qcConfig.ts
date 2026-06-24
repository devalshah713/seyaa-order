// Column layout + checklist for the QC (Quality Check) module. One QC record per
// stock piece, keyed by Stock No., stored in a dedicated "QC" tab (auto-created).
// Each check is a Yes/No with its own remark; an overall Result is derived.
export const QC_TAB = "QC";

// The quality checks, in order. Each becomes a Yes/No + remark on the form and
// two columns ("<check>" and "<check> Remark") in the sheet.
export const QC_CHECKS = [
  "Metal Quality (Gold Machine check 14k, 18k)",
  "Diamond Quality and Color Check",
  "Length Check",
  "Ring size Check",
  "Lock Check",
  "Gold Polish Check",
  "14kt Marking Check",
  "SS Initial Check",
  "Scratch Check",
  "Gold Color Check with Master Piece",
  "Human Wear Check",
  "Prop Wear Check",
  "Alignment Check",
  "Prongs Check",
  "Prong Color Check",
] as const;

// Stock detail fields auto-fetched and stored on the QC record (no price).
const IDENTITY_HEADERS = [
  "Stock No.",
  "Design Name",
  "Design Number",
  "Gold Details",
  "Location",
  "Inch Size",
  "Gross Weight",
  "Net Weight",
  "Total Diamond Weight",
  "Total Dia Pcs",
  "Manufacturer",
  "QC Date",
  "Checked By",
] as const;

export const QC_HEADERS = [
  ...IDENTITY_HEADERS,
  ...QC_CHECKS.flatMap((c) => [c, `${c} Remark`]),
  "Result",
  "Comments",
] as const;

// Derive the overall result from the answers: Fail if any "NO", Pass if all
// answered "YES", otherwise Pending.
export function deriveResult(values: string[]): "PASS" | "FAIL" | "PENDING" {
  if (values.some((v) => v === "NO")) return "FAIL";
  if (values.length === QC_CHECKS.length && values.every((v) => v === "YES")) return "PASS";
  return "PENDING";
}
