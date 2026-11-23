// The words of a CAD request: the block of text sent to the factory.
//
// Nothing here sends anything. The text is written out, shown on the request's
// own page, and a person shares it on WhatsApp with the photos, the same hand-
// off the order message and the quotation use.
//
// Written for a factory reading it on a phone: short lines, one fact a line,
// in the words the office already writes. A line with nothing in it is left out
// rather than sent as an empty label.
//
// When the owner has asked for changes, the message is the change and not the
// whole request again: the factory already has the request, and what it needs
// is what to change on the CAD it sent.
//
// Pure on purpose: no store, no session, no "server-only".
import type { CadRequest } from "./cadConfig";

export type CadMessageInput = Pick<
  CadRequest,
  | "cadNo" | "factory" | "category" | "goldDetails" | "size" | "stone"
  | "sideStones" | "notes" | "status" | "changeNote"
>;

const clean = (v: string | undefined): string => (v || "").trim();

function stoneLines(r: CadMessageInput): string[] {
  const s = r.stone;
  if (!s) return [];
  const lab = clean(s.lab) && s.lab !== "None" ? s.lab : "";
  return [
    lab && `Certificate: ${lab}${clean(s.certNo) ? ` ${clean(s.certNo)}` : ""}`,
    clean(s.shape) && `Shape: ${clean(s.shape)}`,
    clean(s.carats) && `Weight: ${clean(s.carats)} ct`,
    clean(s.colour) && `Colour: ${clean(s.colour)}`,
    clean(s.clarity) && `Clarity: ${clean(s.clarity)}`,
    clean(s.measurements) && `Size: ${clean(s.measurements)} mm`,
  ].filter((l): l is string => !!l);
}

export function buildCadMessage(r: CadMessageInput): string {
  const to = clean(r.factory);
  const head = `CAD request ${clean(r.cadNo)}${to ? ` for ${to}` : ""}`;

  if (r.status === "changes" && clean(r.changeNote)) {
    return [
      head,
      "Please make these changes to the CAD:",
      clean(r.changeNote),
      "",
      "Please send the new CAD here.",
    ].join("\n");
  }

  const piece = [
    clean(r.category) && `Piece: ${clean(r.category)}`,
    clean(r.goldDetails) && `Gold: ${clean(r.goldDetails)}`,
    clean(r.size) && `Size: ${clean(r.size)}`,
  ].filter((l): l is string => !!l);

  const stone = stoneLines(r);

  const lines: string[] = [
    head,
    "Please make the CAD for this piece. The photos are attached.",
    "",
    ...piece,
  ];
  if (stone.length > 0) {
    lines.push("", "Centre stone:", ...stone);
  }
  if (clean(r.sideStones)) lines.push("", `Side stones: ${clean(r.sideStones)}`);
  if (clean(r.notes)) lines.push(`Please note: ${clean(r.notes)}`);
  lines.push("", "Please send the CAD here.");
  return lines.join("\n");
}
