// A CAD request: asking a factory to draw a piece before it is ordered.
//
// A customer brings a design, or a large certified stone, and before anything
// is ordered the office needs the factory's CAD of it. Today that is a WhatsApp
// message typed by hand: the reference photo, the centre stone's details, "use
// the side stones as per the CAD". The factory sends a CAD image back, the
// owner approves it, and only then is the order raised. Requests typed by hand
// get missed, so the request is raised here first and the WhatsApp message and
// the photos are drafted from it.
//
// Its own book with its own numbers, CAD/26-27/001, per financial year, exactly
// as a quotation is. Most requests become orders, but not all, and a book that
// mixed the two could not say how many of either there were.
//
// Pure on purpose: no store, no session, no "server-only". The form, the
// routes and the pages all read the same rules from here, so a screen and the
// server can never disagree about who may do what.
import { pad } from "./memoFormat";
import { DIA_SHAPES } from "./pdConfig";

// --- Numbering ---------------------------------------------------------------

export function cadNoFor(fy: string, seq: number): string {
  return `CAD/${fy}/${pad(seq)}`;
}

export function cadIdFor(fy: string, seq: number): string {
  return `CAD-${fy}-${pad(seq)}`;
}

// Its own key in the memo book's counter table. "C:" is used by nothing else:
// memos count under "26-27" and "G:26-27", orders under "O:", quotations "Q:".
export function cadCounterKey(fy: string): string {
  return `C:${fy}`;
}

// --- Where a request is ------------------------------------------------------
//
// One line, walked forwards. A request is sent to the factory, a CAD comes
// back, and the owner approves it or asks for changes. Changes asked sends it
// back to the factory, and the next CAD that arrives puts it in front of the
// owner again. Approved can become an order, and then it is finished.
export type CadStatus = "sent" | "received" | "approved" | "changes" | "ordered";

export const CAD_STATUSES: { value: CadStatus; label: string }[] = [
  { value: "sent", label: "Sent to factory" },
  { value: "received", label: "CAD received" },
  { value: "approved", label: "Approved" },
  { value: "changes", label: "Changes asked" },
  { value: "ordered", label: "Order placed" },
];

export function isCadStatus(v: unknown): v is CadStatus {
  return typeof v === "string" && CAD_STATUSES.some((s) => s.value === v);
}

export function cadStatusLabel(v: string | undefined): string {
  return CAD_STATUSES.find((s) => s.value === v)?.label || "Sent to factory";
}

// --- The centre stone --------------------------------------------------------

export const STONE_LABS = ["IGI", "GIA", "None"] as const;
export type StoneLab = (typeof STONE_LABS)[number];

export function isStoneLab(v: unknown): v is StoneLab {
  return typeof v === "string" && (STONE_LABS as readonly string[]).includes(v);
}

export const CAD_SHAPES: readonly string[] = DIA_SHAPES;

// What the side stones line says unless somebody writes otherwise. It is what
// the office already writes to the factory, word for word.
export const DEFAULT_SIDE_STONES = "Use as per the requirement of the CAD";

// One uploaded picture. The same two fields every picture in the portal is
// kept as: where a browser can open it, and Cloudinary's own name for it.
export type CadPhoto = { url: string; publicId: string };

// A CAD image the factory sent back. Kept with who put it on and when, and
// which round it belongs to: a request that went back for changes collects a
// second CAD, and the owner's decision is about the latest one, not the first.
export type CadImage = CadPhoto & { at: string; by: string; round: number };

export type CenterStone = {
  lab: StoneLab;
  certNo: string;
  shape: string; // one of CAD_SHAPES
  carats: string; // as typed, as every weight in this portal is
  colour: string;
  clarity: string;
  measurements: string; // in mm, as typed: "8.10 x 6.02 x 3.80"
  // The certificate, photographed. Images only: the portal's one upload goes to
  // Cloudinary's image endpoint, and a PDF there is not reliably served back.
  certPhoto?: CadPhoto;
};

// --- The trail ---------------------------------------------------------------
//
// Who did what and when, oldest first, the way an order's approval notes are
// kept. Only ever added to.
export type CadAction =
  | "raised" | "edited" | "cad_received" | "approved" | "changes" | "ordered";

export type CadLogEntry = {
  id: string;
  at: string; // ISO
  by: string; // username
  action: CadAction;
  note?: string;
};

const ACTION_WORDS: Record<CadAction, string> = {
  raised: "Raised and sent to the factory",
  edited: "Details changed",
  cad_received: "CAD put on",
  approved: "CAD approved",
  changes: "Changes asked",
  ordered: "Order placed",
};

export function cadActionWords(a: CadAction): string {
  return ACTION_WORDS[a] || a;
}

// --- The request -------------------------------------------------------------

export type CadRequest = {
  id: string; // URL-safe, e.g. "CAD-26-27-001"
  cadNo: string; // printed, e.g. "CAD/26-27/001"
  fy: string;
  seq: number;
  date: string; // yyyy-mm-dd

  factory: string; // from the manufacturer list
  refPhotos: CadPhoto[]; // at least one
  stone: CenterStone;

  category: string; // from the category list
  goldDetails: string; // one of GOLD_DETAILS
  size: string;
  sideStones: string;
  notes: string;

  status: CadStatus;
  cadImages: CadImage[];
  // The owner's words when he asked for changes. Kept while the request is
  // with the factory for them, so the message to the factory can carry them.
  changeNote?: string;
  log: CadLogEntry[];

  enteredBy: string;
  createdAt: string;
  updatedAt?: string;

  // The order it became. Written once, by the save that creates the order.
  orderId?: string;
  orderNo?: string;
};

// What a caller may ask to be saved. The number, the moment, the state and the
// trail are the portal's.
export type NewCadRequest = Pick<
  CadRequest,
  | "factory" | "refPhotos" | "stone" | "category" | "goldDetails" | "size"
  | "sideStones" | "notes" | "enteredBy"
>;

// The details somebody may correct afterwards.
export type CadDetails = Omit<NewCadRequest, "enteredBy">;

// Everything that can change on a saved request, for the store. The routes
// decide which of these a given person may send.
export type CadPatch = Partial<
  CadDetails &
    Pick<CadRequest, "status" | "cadImages" | "changeNote" | "orderId" | "orderNo">
>;

// The latest round of CAD images, which is the one any decision is about.
export function latestCadImages(r: Pick<CadRequest, "cadImages">): CadImage[] {
  const all = r.cadImages || [];
  if (all.length === 0) return [];
  const round = Math.max(...all.map((c) => c.round || 1));
  return all.filter((c) => (c.round || 1) === round);
}

// --- Who may do what ---------------------------------------------------------
//
// Asked by the routes, which are the rule, and by the pages, which only hide
// what the routes would refuse anyway.

export type CadActor = { username: string; isAdmin: boolean };

const mine = (r: Pick<CadRequest, "enteredBy">, me: CadActor) =>
  !!me.username && r.enteredBy === me.username;

// The details. The raiser, only while it is with the factory: once a CAD is
// back, the factory drew what it was sent, and changing the request under it
// would leave the CAD answering a question nobody asked. "Changes asked" opens
// it again, because that is exactly when the request is being corrected.
//
// The owner, at any point before it becomes an order.
export function canEditCad(
  r: Pick<CadRequest, "enteredBy" | "status">,
  me: CadActor
): boolean {
  if (r.status === "ordered") return false;
  if (me.isAdmin) return true;
  return mine(r, me) && (r.status === "sent" || r.status === "changes");
}

// Removing it. The raiser, only his own and only before any CAD has come back:
// up to then it is a question he may withdraw, and after it the factory has
// done work on it. The owner, any, until it has become an order, because the
// order links back to it.
export function canDeleteCad(
  r: Pick<CadRequest, "enteredBy" | "status" | "cadImages">,
  me: CadActor
): boolean {
  if (r.status === "ordered") return false;
  if (me.isAdmin) return true;
  return mine(r, me) && r.status === "sent" && (r.cadImages || []).length === 0;
}

// Putting a CAD on. Anybody signed in, because whoever the factory sent it to
// is the one holding it. Not once approved: a new CAD after approval would be a
// drawing nobody has approved sitting under the word "Approved".
export function canAddCad(r: Pick<CadRequest, "status">): boolean {
  return r.status === "sent" || r.status === "changes" || r.status === "received";
}

// The owner's decision is about a CAD, so there has to be one in front of him.
// Changes can still be asked after approving, until it becomes an order: an
// owner who approves and then sees the problem must not need a new request.
export function canDecideCad(
  r: Pick<CadRequest, "status" | "cadImages">,
  me: CadActor,
  decision: "approve" | "changes"
): boolean {
  if (!me.isAdmin) return false;
  if ((r.cadImages || []).length === 0) return false;
  if (decision === "approve") return r.status === "received";
  return r.status === "received" || r.status === "approved";
}

export function canMakeOrder(r: Pick<CadRequest, "status" | "orderId">): boolean {
  return r.status === "approved" && !r.orderId;
}

// --- The list ----------------------------------------------------------------
//
// What the list page is handed: the few fields it shows and searches, never a
// whole request. See "Projection" in docs/HANDOVER.md.
export type CadRow = {
  id: string;
  cadNo: string;
  date: string;
  status: CadStatus;
  factory: string;
  category: string;
  goldDetails: string;
  shape: string;
  carats: string;
  lab: string;
  certNo: string;
  enteredBy: string;
  thumb: string; // the first reference photo
  orderId: string;
  orderNo: string;
  createdAt: string;
};

export function cadRowOf(r: CadRequest): CadRow {
  return {
    id: r.id,
    cadNo: r.cadNo,
    date: r.date,
    status: isCadStatus(r.status) ? r.status : "sent",
    factory: r.factory || "",
    category: r.category || "",
    goldDetails: r.goldDetails || "",
    shape: r.stone?.shape || "",
    carats: r.stone?.carats || "",
    lab: r.stone?.lab || "",
    certNo: r.stone?.certNo || "",
    enteredBy: r.enteredBy || "",
    thumb: r.refPhotos?.[0]?.url || "",
    orderId: r.orderId || "",
    orderNo: r.orderNo || "",
    createdAt: r.createdAt || "",
  };
}

export function searchCadRows(rows: CadRow[], needle: string): CadRow[] {
  const phrase = (needle || "").trim().toLowerCase();
  if (!phrase) return rows;
  return rows.filter((r) =>
    [
      r.cadNo, r.factory, r.category, r.goldDetails, r.shape, r.carats, r.lab,
      r.certNo, r.enteredBy, r.orderNo, cadStatusLabel(r.status),
    ]
      .join(" ")
      .toLowerCase()
      .includes(phrase)
  );
}

// --- Reading a form ----------------------------------------------------------

function str(v: unknown, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// An uploaded picture comes back as a URL, and a browser has to be able to open
// it again later, so that is the one thing checked.
export function isLink(v: string): boolean {
  return /^https?:\/\/\S+$/i.test(v);
}

function readPhoto(v: unknown): CadPhoto | null {
  const p = (v || {}) as Record<string, unknown>;
  const url = str(p.url, 500);
  if (!url) return null;
  return { url, publicId: str(p.publicId, 200) };
}

export function readPhotos(v: unknown, max = 10): CadPhoto[] | "bad" {
  if (!Array.isArray(v)) return [];
  const out: CadPhoto[] = [];
  for (const raw of v.slice(0, max)) {
    const p = readPhoto(raw);
    if (!p) continue;
    if (!isLink(p.url)) return "bad";
    out.push(p);
  }
  return out;
}

// The request's details as they arrive off the form, checked.
//
// One reader for raising it and for correcting it, so the two can never
// disagree about what a request is. The lists are handed in rather than read
// here, because this file reads nothing.
export function readCadDetails(
  body: Record<string, unknown>,
  lists: { mfgs: string[]; categories: string[]; golds: readonly string[] }
): { ok: true; details: CadDetails } | { ok: false; error: string } {
  const factory = str(body.factory, 120);
  if (!factory) return { ok: false, error: "Choose the factory." };
  if (!lists.mfgs.includes(factory)) {
    return { ok: false, error: "Choose the factory from the list." };
  }

  const photos = readPhotos(body.refPhotos);
  if (photos === "bad") {
    return { ok: false, error: "A reference photo did not upload. Try that photo again." };
  }
  if (photos.length === 0) {
    return { ok: false, error: "Add at least one reference photo." };
  }

  const s = (body.stone || {}) as Record<string, unknown>;
  const labRaw = str(s.lab, 10);
  const lab: StoneLab = isStoneLab(labRaw) ? labRaw : "None";
  const shapeRaw = str(s.shape, 40);
  const shape = CAD_SHAPES.find((x) => x.toLowerCase() === shapeRaw.toLowerCase()) || "";
  if (!shape) return { ok: false, error: "Choose the centre stone's shape." };
  const carats = str(s.carats, 20);
  const ct = parseFloat(carats);
  if (!carats || !(isFinite(ct) && ct > 0)) {
    return { ok: false, error: "Enter the centre stone's weight in carats, for example 2.01." };
  }
  let certPhoto: CadPhoto | undefined;
  if (s.certPhoto) {
    const p = readPhoto(s.certPhoto);
    if (p && !isLink(p.url)) {
      return { ok: false, error: "The certificate photo did not upload. Try it again." };
    }
    certPhoto = p || undefined;
  }

  const category = str(body.category, 80);
  if (!category) return { ok: false, error: "Choose a category." };
  if (!lists.categories.includes(category)) {
    return { ok: false, error: "Choose a category from the list." };
  }

  const goldDetails = str(body.goldDetails, 40).toUpperCase();
  if (!goldDetails) return { ok: false, error: "Choose the gold details." };
  if (!lists.golds.includes(goldDetails)) {
    return { ok: false, error: "Choose the gold details from the list." };
  }

  return {
    ok: true,
    details: {
      factory,
      refPhotos: photos,
      stone: {
        lab,
        // A certificate number means nothing without a lab to look it up at.
        certNo: lab === "None" ? "" : str(s.certNo, 40),
        shape,
        carats,
        colour: str(s.colour, 20),
        clarity: str(s.clarity, 20),
        measurements: str(s.measurements, 60),
        ...(certPhoto ? { certPhoto } : {}),
      },
      category,
      goldDetails,
      size: str(body.size, 60),
      sideStones: str(body.sideStones, 300) || DEFAULT_SIDE_STONES,
      notes: str(body.notes, 1000),
    },
  };
}

// --- The form's boxes --------------------------------------------------------
//
// Here rather than in the form, because the pages that open the form are
// rendered on the server and have to build these before handing them over.

export type CadFormValues = {
  factory: string;
  refPhotos: CadPhoto[];
  lab: StoneLab;
  certNo: string;
  shape: string;
  carats: string;
  colour: string;
  clarity: string;
  measurements: string;
  certPhoto: CadPhoto | null;
  category: string;
  goldDetails: string;
  size: string;
  sideStones: string;
  notes: string;
};

export const BLANK_CAD: CadFormValues = {
  factory: "",
  refPhotos: [],
  lab: "IGI",
  certNo: "",
  shape: "",
  carats: "",
  colour: "",
  clarity: "",
  measurements: "",
  certPhoto: null,
  category: "",
  goldDetails: "",
  size: "",
  sideStones: DEFAULT_SIDE_STONES,
  notes: "",
};

export function cadFormValues(d: CadDetails): CadFormValues {
  return {
    factory: d.factory,
    refPhotos: d.refPhotos,
    lab: d.stone.lab,
    certNo: d.stone.certNo,
    shape: d.stone.shape,
    carats: d.stone.carats,
    colour: d.stone.colour,
    clarity: d.stone.clarity,
    measurements: d.stone.measurements,
    certPhoto: d.stone.certPhoto || null,
    category: d.category,
    goldDetails: d.goldDetails,
    size: d.size,
    sideStones: d.sideStones,
    notes: d.notes,
  };
}

// The centre stone in one line, for the message, the order and the list.
export function stoneWords(s: CenterStone | undefined): string {
  if (!s) return "";
  const cts = parseFloat(s.carats);
  return [
    s.lab && s.lab !== "None" ? `${s.lab}${s.certNo ? ` ${s.certNo}` : ""}` : "",
    s.shape,
    isFinite(cts) && cts > 0 ? `${s.carats} ct` : "",
    [s.colour, s.clarity].filter(Boolean).join(" "),
    s.measurements ? `${s.measurements} mm` : "",
  ]
    .map((x) => (x || "").trim())
    .filter(Boolean)
    .join(", ");
}
