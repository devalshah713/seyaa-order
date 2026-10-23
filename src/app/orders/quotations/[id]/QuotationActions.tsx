"use client";
// What can be done with a saved quotation: copy the text, print it, add the
// picture it may be short of, and turn it into an order.
//
// All of it waits on the owner. The words to send carry one figure and it is
// the price; an order built from a quotation carries the figures the owner
// checked. So until he has approved it and priced it, each of those is a
// sentence saying why rather than a button that does nothing.
//
// The portal sends nothing. The text is written on the server, shown here
// exactly as it will be pasted, and the seller puts it into WhatsApp himself —
// the same hand-off the order message and the receipt chase use, for the same
// reason: it works.
//
// Printing is the browser's. There is no server-side PDF in this portal; the
// page carries print rules and "Save as PDF" in the print dialog produces the
// file.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage, uploadToCloudinary } from "@/lib/cloudinary";
import { readReply } from "@/lib/readReply";

export default function QuotationActions({
  id,
  quotationNo,
  text,
  hasPhoto,
  // Already an order. Then neither the button nor the picture is offered: the
  // page above says which order it became and links to it. The server refuses a
  // second one as well — hiding the button is a courtesy, not the rule.
  madeOrder,
  // Has the owner priced it? The words to send and the way to an order both
  // belong to a priced quotation only: an unpriced one has no price to send and
  // nothing to carry. Said in a sentence rather than left as a dead button, and
  // the order route refuses it as well.
  priced,
}: {
  id: string;
  quotationNo: string;
  text: string;
  hasPhoto: boolean;
  madeOrder: boolean;
  priced: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function copy() {
    setError("");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // The clipboard is not always there — an insecure origin, a browser that
      // says no — and the text is on screen to be selected either way.
      setError("Could not reach the clipboard. Select the text below and copy it by hand.");
    }
  }

  async function addPhoto(file: File) {
    setError("");
    setBusy("photo");
    try {
      const shot = await uploadToCloudinary(await compressImage(file), file.name);
      const res = await fetch(`/api/orders/quotations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoPath: shot.secure_url, photoPublicId: shot.public_id }),
      });
      await readReply(res, "Could not save the picture on the quotation.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The picture did not upload. Try again.");
    } finally {
      setBusy("");
    }
  }

  // The customer said yes. The order is written down the same path a seller's
  // order takes, so it gets its order number, its stamp and its place in the
  // approval chain exactly as any other order does: this sends nothing but the
  // quotation's own id, and the server builds the order from the stored
  // quotation.
  async function makeOrder() {
    setError("");
    setBusy("order");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromQuotationId: id }),
      });
      const data = await readReply(res, "Could not turn this quotation into an order.");
      const order = data.order as { id?: string } | undefined;
      // A 207 carries the order and a complaint about the quotation not being
      // marked. The order exists either way, so it is opened and the complaint
      // is shown rather than swallowed.
      if (typeof data.error === "string" && data.error) setError(data.error);
      if (!order?.id) {
        throw new Error(
          "The order was saved, but this page could not open it. Find it on the Orders list."
        );
      }
      router.push(`/orders/${order.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn this quotation into an order.");
      setBusy("");
    }
  }

  return (
    <div className="no-print">
      <div className="ord-msg">
        <h2>Quotation to send</h2>
        {priced ? (
          <>
            <div className="rc-copy">
              <div className="rc-copy-head">
                <b>To send on WhatsApp</b>
                <button type="button" className="btn btn-small" onClick={copy}>
                  {copied ? "Copied" : "Copy text"}
                </button>
              </div>
              <pre>{text}</pre>
            </div>
            <p className="hint">
              This is the customer&rsquo;s quotation, so it carries the price and
              not what the piece costs to make.
            </p>
          </>
        ) : (
          <p className="hint">
            {quotationNo} has no price on it yet, and the only figure the
            customer&rsquo;s quotation carries is the price, so there is nothing
            to send.
            <br />
            The owner approves it and puts the price on it on this page. Come
            back once it says priced.
          </p>
        )}
      </div>

      {priced && (
        <div className="ord-pd qt-act">
          <h2>Print it</h2>
          <p className="hint">
            Prints the quotation on one page, without the cost breakdown. Choose
            &ldquo;Save as PDF&rdquo; in the print dialog to send it as a file.
          </p>
          <button type="button" className="btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      )}

      {!madeOrder && (
      <div className="ord-pd qt-act">
        <h2>The customer said yes</h2>
        {!priced ? (
          <p className="hint">
            {quotationNo} has not been priced yet, so there is nothing to carry
            onto an order.
            <br />
            The owner approves it and puts the price on it on this page, and
            then this button will work.
          </p>
        ) : hasPhoto ? (
          <p className="hint">
            Writes a real order from this quotation, with its own order number,
            and sends it down the approval chain exactly as an order written on
            the order form.
            <br />
            Nothing is retyped, and {quotationNo} records the order it became.
          </p>
        ) : (
          <p className="hint">
            An order cannot be saved without a reference picture, and this
            quotation has none.
            <br />
            Add the picture below and the button will work.
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!!busy || !hasPhoto || !priced}
          onClick={makeOrder}
        >
          {busy === "order" ? "Writing the order…" : "Turn this into an order"}
        </button>
      </div>
      )}

      {!madeOrder && !hasPhoto && (
        <div className="ord-pd qt-act">
          <h2>Reference picture</h2>
          <p className="hint">
            This quotation was given without one, which is allowed. Add it when
            the customer sends it.
          </p>
          <button
            type="button"
            className="btn"
            disabled={!!busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy === "photo" ? "Uploading the picture…" : "Add the reference picture"}
          </button>
          <input
            ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void addPhoto(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {error && <p className="save-error">{error}</p>}
    </div>
  );
}
