"use client";
import { useEffect } from "react";

// Opens the browser's print dialog as soon as the sheet is ready.
//
// This is what replaced the server rendering a PDF. The portal used to drive a
// headless Chrome against its own pages and hand back a file; the pages carry
// proper print CSS, so the browser already in front of the user produces the
// same sheet, and "Save as PDF" in the print dialog produces the same file.
// What it does not need is a browser running on the server, which on Cloudflare
// is a paid add-on.
//
// Used by the PDF links in the history tables, which open the sheet in a new
// tab with ?print=1. Somebody already looking at a sheet presses Print instead.
export default function AutoPrint() {
  useEffect(() => {
    // Wait for the page to finish loading before the dialog takes over. A PD
    // sheet's photo comes from Cloudinary, and printing before it arrives gives
    // a sheet with an empty photo box — which looks exactly like a sheet that
    // never had a photo, so it is worth the wait.
    let printed = false;
    const go = () => {
      if (printed) return;
      printed = true;
      // A short beat after load for layout to settle; without it Safari in
      // particular prints a half-drawn page.
      setTimeout(() => window.print(), 250);
    };

    if (document.readyState === "complete") go();
    else window.addEventListener("load", go);
    return () => window.removeEventListener("load", go);
  }, []);

  return null;
}
