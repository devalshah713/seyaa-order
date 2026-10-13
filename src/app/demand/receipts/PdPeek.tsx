"use client";
import { useEffect, useRef, useState } from "react";
import { photoSrc } from "@/lib/cloudinary";
import { formatDate } from "@/lib/memoFormat";

// The PD sheet shown over the chase list rather than instead of it.
//
// Clicking a design number used to be the only way to see its photo, and that
// meant leaving the list, finding the sheet, and coming back to a page scrolled
// somewhere else. This is the sheet's photo and the lines beside it, on top of
// the list, closed with the cross. Nothing navigates, so the list is exactly
// where it was left.
type Peeked = {
  id: string;
  pdNo: string;
  designNo: string;
  product: string;
  category: string;
  subCategory: string;
  tdw: string;
  diaQuality: string;
  goldPurity: string;
  goldColor: string;
  size: string;
  assignedTo: string;
  deliveryDate: string;
  remarks: string;
  photoPath: string;
};

// Only the fields that have something in them are printed. A column of
// dashes reads as a fault on the sheet, and the sheet is not at fault: the
// office simply does not fill every line on every design.
function line(label: string, value: string) {
  if (!value) return null;
  return (
    <div className="pk-row" key={label}>
      <span className="pk-lab">{label}</span>
      <span className="pk-val">{value}</span>
    </div>
  );
}

export default function PdPeek({
  designNo, onClose,
}: {
  designNo: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<Peeked | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const open = !!designNo;

  useEffect(() => {
    if (!designNo) {
      setFound(null);
      setError("");
      return;
    }
    // A design number clicked, then another one clicked before the first
    // answer arrives, would otherwise draw the wrong sheet. The flag says
    // whether this request is still the one being waited on.
    let current = true;
    setLoading(true);
    setError("");
    setFound(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/pd/lookup?design=${encodeURIComponent(designNo)}`
        );
        // When a request runs out of processor time the platform answers with
        // an HTML page, not JSON. Reading the text first means that shows up
        // as a sentence about the server rather than a parsing complaint
        // nobody can act on.
        const text = await res.text();
        let data: { results?: Peeked[]; error?: string } | null = null;
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = null;
        }
        if (!current) return;
        if (!data) {
          setError(
            `The server answered with something this page could not read (status ${res.status}). ` +
            "Please try again in a moment."
          );
          return;
        }
        if (!res.ok) {
          setError(data.error || "Could not look that design number up.");
          return;
        }
        const first = (data.results || [])[0];
        if (!first) {
          setError(`No PD sheet was found for ${designNo}.`);
          return;
        }
        setFound(first);
      } catch {
        if (current) setError("Could not reach the server to look that design number up.");
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, [designNo]);

  // Escape closes it, the same as the cross.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Two scrollbars at once is confusing and the wheel ends up moving the list
  // behind instead of the panel, so the page behind is held still while this
  // is up and given its scrolling back on the way out.
  useEffect(() => {
    if (!open) return;
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = was; };
  }, [open]);

  // The cross takes the keyboard on open, so Escape and the keyboard both
  // reach the panel rather than the list still sitting behind it.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const photo = found ? photoSrc(found.photoPath) : "";
  const gold = found
    ? [found.goldPurity, found.goldColor].filter(Boolean).join(" ")
    : "";

  return (
    <div className="pk-back" onClick={onClose}>
      {/* A click inside the panel is somebody reading, not somebody leaving. */}
      <div
        className="pk-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`PD sheet for ${designNo}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          ref={closeRef}
          className="pk-close"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>

        {loading && <p className="pk-note">Loading…</p>}
        {!loading && error && <p className="pk-note">{error}</p>}

        {!loading && found && (
          <>
            {photo ? (
              <img className="pk-photo" src={photo} alt={`Design ${found.designNo}`} />
            ) : (
              <p className="pk-note">There is no photo on this PD sheet.</p>
            )}

            <h2 className="pk-design">{found.designNo}</h2>

            <div className="pk-rows">
              {line("PD number", found.pdNo)}
              {line("Product", found.category || found.product)}
              {line("Sub-category", found.subCategory)}
              {line("Total diamond weight", found.tdw)}
              {line("Dia. quality", found.diaQuality)}
              {line("Gold", gold)}
              {line("Size", found.size)}
              {line("Assigned to", found.assignedTo)}
              {line("Delivery date", found.deliveryDate ? formatDate(found.deliveryDate) : "")}
              {line("Remarks", found.remarks)}
            </div>

            {/* A new tab, because the chase list behind is where the work is
                and a back button should not be needed to get back to it. */}
            <a
              className="pk-full"
              href={`/pd/${encodeURIComponent(found.id)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open the full PD sheet ↗
            </a>
          </>
        )}
      </div>
    </div>
  );
}
