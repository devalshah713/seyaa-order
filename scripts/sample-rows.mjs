// Pull a few real rows out of the live store, for someone building a reader
// against this data.
//
// Run it with the same four settings the portal uses. They are on the Worker
// under Settings, Variables and Secrets. The two secrets cannot be read back
// from the dashboard, so use the pair from the R2 API token itself.
//
//   R2_ACCOUNT_ID=... R2_BUCKET=seyaa-data \
//   R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
//   node scripts/sample-rows.mjs
//
// It only reads. Nothing is written back.
//
// Party, customer and supplier names are replaced before anything is printed.
// Design numbers, stock numbers, weights and dates are left alone, because
// those are the fields a reader has to match on.
import { AwsClient } from "aws4fetch";

const need = ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Set ${missing.join(", ")} first. See the comment at the top of this file.`);
  process.exit(1);
}

const aws = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});

const url = (path) =>
  `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${path}`;

async function read(path) {
  const res = await aws.fetch(url(path), { method: "GET", cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} came back ${res.status}`);
  return res.json();
}

// Anything that names a person or a firm. Same input always gives the same
// mask, so rows that referred to one party still refer to one party.
const seen = new Map();
function mask(name) {
  const key = String(name || "").trim();
  if (!key) return "";
  if (!seen.has(key)) seen.set(key, `PARTY_${String(seen.size + 1).padStart(3, "0")}`);
  return seen.get(key);
}

const take = (list, n = 5) => (Array.isArray(list) ? list.slice(0, n) : []);
const show = (label, rows) => {
  console.log(`\n========== ${label} — ${rows.length} row(s) ==========`);
  console.log(JSON.stringify(rows, null, 2));
};

const [pd, demand, chase, jangad, prices] = await Promise.all([
  read("pd/db.json"),
  read("demand/db.json"),
  read("receipt-chase/db.json"),
  read("jangad/db.json"),
  read("prices/db.json"),
]);

console.log("Counts in the whole store:");
console.log(`  pd/db.json            sheets   ${pd?.sheets?.length ?? "(absent)"}`);
console.log(`  demand/db.json        demands  ${demand?.demands?.length ?? "(absent)"}`);
console.log(`  receipt-chase/db.json chases   ${chase?.chases?.length ?? "(absent)"}`);
console.log(`  jangad/db.json        rows     ${jangad?.rows?.length ?? "(absent)"}`);
console.log(`  prices/db.json        round ${prices?.round?.length ?? "?"} / fancy ${prices?.fancy?.length ?? "?"}`);

show("pd/db.json  →  sheets[]", take(pd?.sheets).map((s) => ({
  ...s,
  assignedTo: mask(s.assignedTo),
  orderBy: mask(s.orderBy),
  pdMerchandiser: mask(s.pdMerchandiser),
  // A bulk run is up to 400 entries; two is enough to show the shape.
  pieces: take(s.pieces, 2),
  diaLines: take(s.diaLines, 3),
})));

show("demand/db.json  →  demands[]", take(demand?.demands).map((d) => ({
  ...d,
  issuedTo: mask(d.issuedTo),
  rows: take(d.rows, 3),
})));

show("receipt-chase/db.json  →  chases[]", take(chase?.chases).map((c) => ({
  ...c,
  issuedTo: mask(c.issuedTo),
  // The forwardable WhatsApp text quotes the supplier by name.
  lastMessageText: c.lastMessageText ? "(omitted, quotes the supplier)" : undefined,
  events: take(c.events, 3),
})));

show("jangad/db.json  →  rows[]", take(jangad?.rows).map((r) => ({
  ...r,
  mfgName: mask(r.mfgName),
})));

show("prices/db.json  →  round[]", take(prices?.round));
show("prices/db.json  →  fancy[]", take(prices?.fancy));

console.log(`\n${seen.size} distinct name(s) masked.`);
