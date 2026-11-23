import Link from "next/link";
import { isStorageConfigured, listPartyNames, peekNextCadNo } from "@/lib/memoStore";
import { todayInput } from "@/lib/memoFormat";
import { currentSession } from "@/lib/currentUser";
import { BLANK_CAD } from "@/lib/cadConfig";
import CadForm from "../CadForm";

export const metadata = { title: "New CAD Request — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

// The factory and category lists are read here and handed to the form, rather
// than fetched by the browser afterwards, so a list that cannot be read is said
// on this page instead of showing as an empty dropdown nobody can fill.
export default async function NewCadPage() {
  await currentSession();

  if (!isStorageConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>New CAD Request</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Set the four <code>R2_*</code>{" "}
          environment variables and redeploy.
        </div>
      </div>
    );
  }

  let mfgs: string[] = [];
  let categories: string[] = [];
  let error = "";
  try {
    const lists = await listPartyNames(["mfg", "category"]);
    mfgs = (lists.mfg || []).map((e) => e.name);
    categories = (lists.category || []).map((e) => e.name);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not read the lists.";
  }
  // A guess, shown so the seller can say the number. The save takes its own.
  const nextNo = error ? "" : await peekNextCadNo(todayInput()).catch(() => "");

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>New CAD Request</h1>
        <Link href="/orders/cad" className="btn">← All CAD requests</Link>
      </div>
      {error ? (
        <div className="notice">
          The factory and category lists could not be read, so the request
          cannot be written yet. {error}
        </div>
      ) : (
        <CadForm
          initial={BLANK_CAD}
          nextNo={nextNo || "the next number in the book"}
          mfgs={mfgs}
          categories={categories}
        />
      )}
    </div>
  );
}
