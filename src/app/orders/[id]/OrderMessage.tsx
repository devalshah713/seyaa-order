"use client";
// The drafted message, and the one button that matters: Copy text.
//
// The portal sends nothing. The text is written on the server, shown here
// exactly as it will be pasted, and the owner puts it into WhatsApp himself —
// the same hand-off the receipt chase uses, for the same reason: it works.
//
// The clipboard is not always there (an insecure origin, a browser that says
// no), and the text is on screen to be selected either way, so a failure says
// so rather than pretending.
import { useState } from "react";

export default function OrderMessage({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function copy() {
    setError("");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Could not reach the clipboard. Select the text below and copy it by hand.");
    }
  }

  return (
    <div className="ord-msg">
      <h2>Message to send</h2>
      <div className="rc-copy">
        <div className="rc-copy-head">
          <b>To send on WhatsApp</b>
          <button type="button" className="btn btn-small" onClick={copy}>
            {copied ? "Copied" : "Copy text"}
          </button>
        </div>
        <pre>{text}</pre>
      </div>
      {error && <p className="save-error">{error}</p>}
    </div>
  );
}
