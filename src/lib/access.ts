// Which features each account may use.
//
// Deliberately free of Node APIs and of "server-only": middleware runs on the
// Edge and the top bar runs in the browser, and both need this map.
//
// An admin always has everything. For everyone else, access is the explicit
// list of module keys stored on their account and carried in their session.

export type ModuleKey =
  | "memos" | "orders" | "stock" | "pd" | "jangad" | "stockbook" | "qc";

export const MODULES: {
  key: ModuleKey;
  label: string;
  description: string;
  home: string;
}[] = [
  { key: "memos", label: "Memos", description: "Delivery and gold memos, plus history", home: "/memo" },
  { key: "orders", label: "Orders", description: "The order tracking board", home: "/orders" },
  { key: "stock", label: "Stock", description: "Stock list and availability", home: "/stock" },
  { key: "pd", label: "PD Sheets", description: "Product development sheets", home: "/pd" },
  { key: "jangad", label: "Diamond Jangad", description: "Accounts entry for diamonds issued, used and returned", home: "/jangad" },
  { key: "stockbook", label: "Stock Book", description: "Finished jewellery taken into stock and valued", home: "/stockbook" },
  { key: "qc", label: "QC", description: "Checking a finished piece over, once it is in stock", home: "/qc" },
];

export const MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === "string" && (MODULE_KEYS as string[]).includes(v);
}

// Keeps only real module keys, de-duplicated — so nothing arbitrary can be
// stored on an account by a hand-made request.
export function sanitizeModules(input: unknown): ModuleKey[] {
  if (!Array.isArray(input)) return [];
  const out: ModuleKey[] = [];
  for (const v of input) if (isModuleKey(v) && !out.includes(v)) out.push(v);
  return out;
}

// Every path each module owns — pages and the APIs behind them.
const PATH_RULES: { key: ModuleKey; prefixes: string[] }[] = [
  { key: "memos", prefixes: ["/memo", "/api/memos"] },
  { key: "orders", prefixes: ["/orders", "/api/orders"] },
  { key: "stock", prefixes: ["/stock", "/api/stock", "/api/stock-sheet"] },
  // Photo upload/serving exists for the PD sheet's design image.
  // Diamond demands are raised straight off a PD sheet, so they travel with it.
  { key: "pd", prefixes: ["/pd", "/api/pd", "/api/upload", "/demand", "/api/demand"] },
  // The register reads PD sheets and demands to fill itself in, but it is the
  // accounts team's screen — they get this without getting the design module.
  { key: "jangad", prefixes: ["/jangad", "/api/jangad"] },
  // The price list is only ever read to value a piece of stock, so it belongs
  // to this module rather than standing on its own.
  { key: "stockbook", prefixes: ["/stockbook", "/api/stockbook", "/api/prices"] },
  // QC reads the stock book to know what it may check, but it is the checker's
  // screen — they get this without getting the valuations.
  { key: "qc", prefixes: ["/qc", "/api/qc"] },
];

// /api/parties is deliberately not listed: the memo form and the PD sheet both
// read it, so it belongs to neither. Its own route requires a session, and
// admin for anything that writes.
//
// /api/photo is out for the same reason. It only ever serves a design photo,
// and the accounts desk reads the PD sheet of the design it is issuing against
// (/jangad/pd/[id]) without having the design module. Uploading a photo is
// still /api/upload, which stays with PD.
//
// The module a path belongs to, or null for shared things (the home page, auth,
// admin screens) that aren't gated per feature.
export function moduleForPath(pathname: string): ModuleKey | null {
  for (const rule of PATH_RULES) {
    for (const p of rule.prefixes) {
      if (pathname === p || pathname.startsWith(`${p}/`)) return rule.key;
    }
  }
  return null;
}

// Sessions carry the list as `mods` (kept short, it rides in a cookie) while
// stored accounts call it `modules`. Accept either so both can be passed here.
export type Access = { role: string; mods?: string[]; modules?: string[] };

export function allowedModules(a: Access): ModuleKey[] {
  if (a.role === "admin") return MODULE_KEYS;
  const list = Array.isArray(a.mods) ? a.mods : a.modules;
  // Accounts created before per-feature access existed have no list stored.
  // They keep working with everything until an admin narrows them down, so
  // adding this feature never locks anyone out mid-shift.
  if (!Array.isArray(list)) return MODULE_KEYS;
  return sanitizeModules(list);
}

export function canUseModule(a: Access, key: ModuleKey): boolean {
  return allowedModules(a).includes(key);
}

export function canAccessPath(a: Access, pathname: string): boolean {
  const key = moduleForPath(pathname);
  if (!key) return true; // shared / not feature-gated
  return canUseModule(a, key);
}

// Where to send someone who lands on a feature they don't have. Falls back to
// the home page, which explains that they have no features yet.
export function landingPath(a: Access): string {
  const mine = allowedModules(a);
  const first = MODULES.find((m) => mine.includes(m.key));
  return first ? first.home : "/";
}
