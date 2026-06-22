// Column layout for the "DIAMOND RETURN FOR PARTY" tracker — a clean log of
// every diamond that comes BACK from the factory (unused or broken) when the
// jewellery is received. Stored in a dedicated "Diamond Return" tab of the same
// Google Sheet. Column order matches the owner-supplied template exactly.
export const DIAMOND_RETURN_TAB = "Diamond Return";

// Exact column order of the owner's "DIAMOND RETURN FOR PARTY.xlsx" (A..J).
// Sr NO is auto-numbered. The trailing template columns (K..N) were empty in
// the original file, so they are intentionally omitted.
export const DIAMOND_RETURN_HEADERS = [
  "Sr NO",
  "Date",
  "Description",
  "Diamond Shape",
  "Diamond Size",
  "Carat Weight",
  "No of pcs",
  "Comments",
  "DESIGN NO",
  "REMARK",
] as const;

// How a returned diamond is classified.
export const RETURN_DESCRIPTIONS = ["Unused", "Broken"] as const;
