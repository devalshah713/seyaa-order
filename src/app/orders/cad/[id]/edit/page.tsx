import Link from "next/link";
import { notFound } from "next/navigation";
import { getCadRequest, listPartyNames } from "@/lib/memoStore";
import { cadFormValues, canEditCad } from "@/lib/cadConfig";
import { currentSession } from "@/lib/currentUser";
import CadForm from "../../CadForm";

export const metadata = { title: "Change CAD Request — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function EditCadPage(props: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  const { id } = await props.params;

  let error = "";
  let request = null;
  try {
    request = await getCadRequest(id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not read the CAD request.";
  }
  if (!error && !request) notFound();

  const me = { username: session?.username || "", isAdmin: session?.role === "admin" };

  let mfgs: string[] = [];
  let categories: string[] = [];
  if (!error) {
    try {
      const lists = await listPartyNames(["mfg", "category"]);
      mfgs = (lists.mfg || []).map((e) => e.name);
      categories = (lists.category || []).map((e) => e.name);
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not read the lists.";
    }
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Change {request?.cadNo || "CAD request"}</h1>
        <Link href={`/orders/cad/${id}`} className="btn">← Back to the request</Link>
      </div>
      {error ? (
        <div className="notice">This could not be opened. {error}</div>
      ) : request && !canEditCad(request, me) ? (
        // The route refuses it as well; this only says so before typing.
        <div className="notice">
          {request.cadNo} cannot be changed now. A CAD has come back on it, or it
          has become an order. Ask the owner if something on it is wrong.
        </div>
      ) : request ? (
        <CadForm
          editId={request.id}
          initial={cadFormValues(request)}
          mfgs={mfgs}
          categories={categories}
        />
      ) : null}
    </div>
  );
}
