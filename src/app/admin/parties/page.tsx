import { redirect } from "next/navigation";
import { currentSession } from "@/lib/currentUser";
import { listParties, unlistedPartyNames } from "@/lib/memoStore";
import PartiesClient from "./PartiesClient";

export const metadata = { title: "Parties — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function PartiesPage() {
  const session = await currentSession();
  if (!session) redirect("/login?next=/admin/parties");
  if (session.role !== "admin") redirect("/");

  const [parties, unlisted] = await Promise.all([listParties(), unlistedPartyNames()]);

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Parties</h1>
        <p>Everyone a memo can be issued to. Only admins can change this list.</p>
      </div>
      <PartiesClient parties={parties} unlisted={unlisted} />
    </div>
  );
}
