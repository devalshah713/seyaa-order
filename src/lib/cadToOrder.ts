// An approved CAD request, as the boxes of a new order.
//
// Unlike a quotation, which the server turns into an order on its own, this
// opens the order form filled in. A CAD request does not carry everything an
// order needs (what is being made in words, the quantity, certified or not for
// the side stones), so the seller looks it over, fills what is missing, and
// saves it the way he saves any order. The order route then checks it exactly
// as it checks any order, and takes the request's id only to mark it.
//
// Pure on purpose: it is handed a request and gives back the form's values.
import { formatShapes, parseShapes } from "./pdConfig";
import { latestCadImages, stoneWords, type CadRequest } from "./cadConfig";

// The order form's own boxes, as strings, because that is what a form holds.
export type OrderPrefill = {
  productName: string;
  category: string;
  goldColor: string;
  pcs: string;
  size: string;
  diaShape: string;
  diamondCts: string;
  diaCertification: string;
  photoPath: string;
  photoPublicId: string;
  instructions: string;
};

export function orderPrefillFromCad(r: CadRequest): OrderPrefill {
  const s = r.stone;
  const shape = formatShapes(parseShapes(s?.shape || ""));
  const cts = parseFloat(s?.carats || "");
  // The picture is the CAD that was approved, not the customer's reference:
  // the factory makes what is in the CAD.
  const cad = latestCadImages(r)[0] || r.cadImages?.[r.cadImages.length - 1];
  const certified = s && (s.lab === "IGI" || s.lab === "GIA");

  const made = [
    s?.carats ? `${s.carats} CT` : "",
    s?.shape ? s.shape.toUpperCase() : "",
    (r.category || "").toUpperCase(),
  ].filter(Boolean).join(" ");

  const notes = [
    `From CAD request ${r.cadNo}.`,
    stoneWords(s) && `Centre stone: ${stoneWords(s)}.`,
    (r.sideStones || "").trim() && `Side stones: ${r.sideStones.trim()}.`,
    (r.notes || "").trim(),
  ].filter(Boolean).join(" ");

  return {
    productName: made,
    category: r.category || "",
    goldColor: r.goldDetails || "",
    pcs: "1",
    size: r.size || "",
    diaShape: shape,
    // The centre stone's weight. The side stones are the factory's, by the CAD,
    // so the seller adds them if he knows them.
    diamondCts: isFinite(cts) && cts > 0 ? String(s!.carats) : "",
    // A lab certificate is a certified stone. No lab is left for the seller to
    // answer, rather than guessed.
    diaCertification: certified ? "certified" : "",
    photoPath: cad?.url || "",
    photoPublicId: cad?.publicId || "",
    instructions: notes.slice(0, 1000),
  };
}
