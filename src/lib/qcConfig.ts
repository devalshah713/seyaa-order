// Quality control on a finished piece, after it is in stock.
//
// The checks themselves are not fixed here: a bracelet and a ring are looked
// over for different things, so each category keeps its own list, kept by an
// admin under Lists. What is here is the shape of an answer, how a result is
// worked out from them, and the set Seyaa already uses — offered as a starting
// point rather than imposed.

export type QcAnswer = "yes" | "no" | "na" | "";

export type QcLine = {
  check: string; // the check as the list spells it
  answer: QcAnswer;
  remark: string;
};

export type QcRecord = {
  id: string;
  qcNo: string; // QC-00001
  stockNo: string;
  date: string; // yyyy-mm-dd — QC Date
  checkedBy: string;

  // Copied from the stock entry as it stood, so a QC record still reads
  // correctly if the piece is edited or sold afterwards.
  designNo: string;
  design: string;
  category: string;
  goldDetails: string;
  location: string;
  inchSize: string;
  grossWt: string;
  netWt: string;
  totalDiaWt: string;
  totalDiaPcs: string;
  manufacturer: string;

  lines: QcLine[];
  comments: string;

  stockId?: string;
  createdAt: string;
  updatedAt: string;
};

export type NewQcRecord = Omit<QcRecord, "id" | "qcNo" | "createdAt" | "updatedAt">;

export const ANSWERS: { value: QcAnswer; label: string; short: string }[] = [
  { value: "yes", label: "Yes", short: "YES" },
  { value: "no", label: "No", short: "NO" },
  { value: "na", label: "Not applicable", short: "N/A" },
];

export const answerLabel = (a: QcAnswer) =>
  ANSWERS.find((x) => x.value === a)?.short || "";

// The checks Seyaa's own QC sheet uses. Offered on the Lists screen as a set to
// add to a category in one go — most categories want most of these, and typing
// fifteen names per category is not a job anybody would do twice.
export const STANDARD_QC_CHECKS = [
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
];

export type QcResult = "pass" | "fail" | "open";

// A piece passes when nothing failed and nothing is still unanswered.
//
// "Not applicable" is deliberately not a failure. On the old sheet a bracelet
// was marked NO for Ring size Check — a bracelet has no ring size — and that
// one answer failed the piece. A check that cannot apply must be able to say so.
export function qcResult(lines: QcLine[]): QcResult {
  const real = lines.filter((l) => l.check.trim());
  if (!real.length) return "open";
  if (real.some((l) => l.answer === "no")) return "fail";
  if (real.some((l) => !l.answer)) return "open";
  return "pass";
}

export const RESULT_LABEL: Record<QcResult, string> = {
  pass: "PASS",
  fail: "FAIL",
  open: "In progress",
};

export function failedChecks(lines: QcLine[]): QcLine[] {
  return lines.filter((l) => l.answer === "no");
}

export function answeredCount(lines: QcLine[]): { done: number; total: number } {
  const real = lines.filter((l) => l.check.trim());
  return { done: real.filter((l) => l.answer).length, total: real.length };
}

// The columns of the QC sheet the office already keeps: the piece, who checked
// it and when, then each check with its remark, then the verdict.
export function qcHeaders(checks: string[]): string[] {
  return [
    "QC No.", "Stock No.", "Design Name", "Design Number", "Category",
    "Gold Details", "Location", "Inch Size", "Gross Weight", "Net Weight",
    "Total Diamond Weight", "Total Dia Pcs", "Manufacturer",
    "QC Date", "Checked By",
    ...checks.flatMap((c) => [c, `${c} Remark`]),
    "Result", "Comments",
  ];
}

export function qcRow(rec: QcRecord, checks: string[]): string[] {
  const byCheck = new Map(rec.lines.map((l) => [l.check, l]));
  return [
    rec.qcNo, rec.stockNo, rec.design, rec.designNo, rec.category,
    rec.goldDetails, rec.location, rec.inchSize, rec.grossWt, rec.netWt,
    rec.totalDiaWt, rec.totalDiaPcs, rec.manufacturer,
    rec.date, rec.checkedBy,
    ...checks.flatMap((c) => {
      const line = byCheck.get(c);
      return [line ? answerLabel(line.answer) : "", line?.remark || ""];
    }),
    RESULT_LABEL[qcResult(rec.lines)],
    rec.comments,
  ];
}
