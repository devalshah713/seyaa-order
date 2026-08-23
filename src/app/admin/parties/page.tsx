import { redirect } from "next/navigation";
import { currentSession } from "@/lib/currentUser";
import { listParties, unlistedPartyNames } from "@/lib/memoStore";
import { PARTY_KINDS, type Party } from "@/lib/memoFormat";
import PartiesClient from "./PartiesClient";

export const metadata = { title: "Lists — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function PartiesPage() {
  const session = await currentSession();
  if (!session) redirect("/login?next=/admin/parties");
  if (session.role !== "admin") redirect("/");

  const [loaded, unlisted] = await Promise.all([
    Promise.all(PARTY_KINDS.map((k) => listParties(k.key))),
    unlistedPartyNames(),
  ]);
  const lists: Record<string, Party[]> = {};
  PARTY_KINDS.forEach((k, i) => { lists[k.key] = loaded[i]; });

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Lists</h1>
        <p>The names staff may choose but not invent. Only admins can change them.</p>
      </div>
      <PartiesClient lists={lists} unlisted={unlisted} />
    </div>
  );
}
