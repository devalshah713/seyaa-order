import Link from "next/link";
import { getCadRequest } from "@/lib/memoStore";
import { canMakeOrder, cadStatusLabel, type CadRequest } from "@/lib/cadConfig";
import { orderPrefillFromCad } from "@/lib/cadToOrder";
import NewOrderForm from "./NewOrderForm";

export const metadata = { title: "New Order — Seyaa Solitaire" };

// ?fromCad=CAD-26-27-001 opens the form filled in from an approved CAD request.
// Without it this is the plain order form, exactly as before.
export default async function NewOrderPage(props: {
  searchParams: Promise<{ fromCad?: string }>;
}) {
  const { fromCad } = await props.searchParams;
  if (!fromCad) return <NewOrderForm />;

  // A request that cannot be read, or is not approved, is said in words. The
  // form is not shown half-filled in its place: an order saved from it would
  // not be linked to the request, and the request would wait for ever.
  let cad: CadRequest | null = null;
  let problem = "";
  try {
    cad = await getCadRequest(fromCad);
    if (!cad) problem = "That CAD request could not be found.";
    else if (cad.orderId) {
      problem = `${cad.cadNo} already became order ${cad.orderNo || cad.orderId}.`;
    } else if (!canMakeOrder(cad)) {
      problem = `${cad.cadNo} is ${cadStatusLabel(cad.status).toLowerCase()}. Only an approved CAD can become an order.`;
    }
  } catch (err) {
    problem = `The CAD request could not be read. ${err instanceof Error ? err.message : ""}`;
  }

  if (problem || !cad) {
    return (
      <div className="wrap">
        <div className="page-head">
          <h1>New Order</h1>
          <Link href="/orders/cad" className="btn">← All CAD requests</Link>
        </div>
        <div className="notice">{problem}</div>
      </div>
    );
  }

  return (
    <NewOrderForm
      prefill={orderPrefillFromCad(cad)}
      fromCad={{ id: cad.id, no: cad.cadNo }}
    />
  );
}
