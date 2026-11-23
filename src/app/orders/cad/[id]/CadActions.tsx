"use client";
// What can be done with a CAD request: send it to the factory, put the CAD on,
// decide on it, turn it into an order, or remove it.
//
// Sending: the portal sends nothing itself. On a phone, "Send on WhatsApp"
// hands the photos and the message to the phone's own share sheet, where the
// seller picks WhatsApp and the factory. Where a browser cannot share files
// (most computers), it opens WhatsApp with the message written in and says to
// attach the photos, which "Download photos" saves first.
//
// Every button here is also checked by the route behind it. Hiding one is a
// courtesy, not the rule.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { compressImage, uploadToCloudinary } from "@/lib/cloudinary";
import { readReply } from "@/lib/readReply";
import type { CadStatus } from "@/lib/cadConfig";

export type SharePhoto = { url: string; name: string };

// Cloudinary sends a file as a download, rather than opening it, when this is
// in its address. Used only when the photo cannot be fetched into the page.
function attachmentUrl(url: string): string {
  return url.includes("/upload/") ? url.replace("/upload/", "/upload/fl_attachment/") : url;
}

async function fetchFile(p: SharePhoto): Promise<File> {
  const res = await fetch(p.url, { mode: "cors" });
  if (!res.ok) throw new Error(`Photo could not be fetched (${res.status}).`);
  const blob = await res.blob();
  return new File([blob], p.name, { type: blob.type || "image/jpeg" });
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

export default function CadActions({
  id,
  cadNo,
  status,
  text,
  photos,
  canAdd,
  canApprove,
  canAskChanges,
  canOrder,
  canDelete,
  isAdmin,
}: {
  id: string;
  cadNo: string;
  status: CadStatus;
  text: string;
  photos: SharePhoto[];
  canAdd: boolean;
  canApprove: boolean;
  canAskChanges: boolean;
  canOrder: boolean;
  canDelete: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const [copied, setCopied] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const cadRef = useRef<HTMLInputElement>(null);

  // The photos, fetched into the page ahead of the press, on a browser that can
  // share files. A phone only lets a page open the share sheet straight from the
  // tap, so the photos have to be in hand already; fetching them after the tap
  // loses the permission on an iPhone. Null while they are on their way.
  // "checking" until the page knows which of the two ways this browser can
  // send; the button waits rather than guessing and opening the wrong one.
  const [files, setFiles] = useState<File[]>([]);
  const [way, setWay] = useState<"checking" | "files" | "text">("checking");
  const photoKey = photos.map((p) => p.url).join("|");

  useEffect(() => {
    let off = false;
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") {
      setWay("text");
      return;
    }
    setWay("checking");
    Promise.all(photos.map(fetchFile))
      .then((got) => {
        if (off) return;
        const ok = got.length > 0 && nav.canShare({ files: got, text });
        setFiles(ok ? got : []);
        setWay(ok ? "files" : "text");
      })
      .catch(() => {
        if (!off) setWay("text");
      });
    return () => { off = true; };
    // photoKey stands for `photos`, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey, text]);

  const sharingReady = way !== "checking";

  function openWhatsAppText() {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    setSaid(
      "WhatsApp is opening with the message written in. Choose the factory, " +
        "then attach the photos there. If they are not on this device, press " +
        "Download photos first."
    );
  }

  async function sendOnWhatsApp() {
    setError("");
    setSaid("");
    if (way === "files" && files.length > 0) {
      // WhatsApp sometimes keeps the photos and drops the words, so the words
      // go on the clipboard as well. Not awaited: the share sheet has to open
      // from the tap itself.
      navigator.clipboard?.writeText(text).catch(() => {});
      try {
        await navigator.share({ files, text });
        setSaid(
          "Shared. If the message did not arrive with the photos, it is copied: " +
            "paste it into the chat."
        );
      } catch (err) {
        // Closing the share sheet is not a failure.
        if (err instanceof Error && err.name === "AbortError") return;
        openWhatsAppText();
      }
      return;
    }
    openWhatsAppText();
  }

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

  async function download() {
    setError("");
    setSaid("");
    setBusy("download");
    try {
      for (const p of photos) {
        try {
          const file = await fetchFile(p);
          const href = URL.createObjectURL(file);
          const a = document.createElement("a");
          a.href = href;
          a.download = p.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(href), 10_000);
        } catch {
          window.open(attachmentUrl(p.url), "_blank", "noopener");
        }
        // A beat between files, or the browser treats the second as a pop-up.
        await pause(400);
      }
      setSaid(
        photos.length === 1
          ? "The photo is saved in Downloads."
          : `${photos.length} photos are saved in Downloads. If only one arrived, allow this site to download more than one file.`
      );
    } finally {
      setBusy("");
    }
  }

  async function addCad(list: File[]) {
    setError("");
    setSaid("");
    setBusy("cad");
    try {
      const images: { url: string; publicId: string }[] = [];
      for (const file of list) {
        const shot = await uploadToCloudinary(await compressImage(file, 1800), file.name);
        images.push({ url: shot.secure_url, publicId: shot.public_id });
      }
      const res = await fetch(`/api/orders/cad/${id}/cad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      await readReply(res, "Could not put the CAD on the request.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The CAD did not upload. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function decide(decision: "approve" | "changes") {
    setError("");
    if (decision === "changes" && !changeNote.trim()) {
      setError("Write what the factory should change.");
      document.getElementById("cad-change")?.focus();
      return;
    }
    setBusy(decision);
    try {
      const res = await fetch(`/api/orders/cad/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: changeNote }),
      });
      await readReply(res, "Could not save the decision.");
      setChangeNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the decision.");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${cadNo}? This cannot be undone.`)) return;
    setError("");
    setBusy("delete");
    try {
      const res = await fetch(`/api/orders/cad/${id}`, { method: "DELETE" });
      await readReply(res, "Could not delete the CAD request.");
      router.push("/orders/cad");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the CAD request.");
      setBusy("");
    }
  }

  const sendHeading =
    status === "changes" ? "Send the changes to the factory" : "Send to the factory";

  return (
    <div className="no-print">
      {status !== "ordered" && (
        <div className="ord-msg cad-send">
          <h2>{sendHeading}</h2>
          <div className="cad-btns">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!!busy || !sharingReady}
              onClick={sendOnWhatsApp}
            >
              {sharingReady ? "Send on WhatsApp" : "Getting the photos ready…"}
            </button>
            <button type="button" className="btn" onClick={copy}>
              {copied ? "Copied" : "Copy message"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!!busy || photos.length === 0}
              onClick={download}
            >
              {busy === "download"
                ? "Saving the photos…"
                : photos.length === 1 ? "Download photo" : "Download photos"}
            </button>
            <a
              className="btn"
              href={`/orders/cad/${id}/print?print=1`}
              target="_blank"
              rel="noopener noreferrer"
            >
              PDF
            </a>
          </div>
          {said && <p className="cad-said">{said}</p>}
          <div className="rc-copy">
            <pre>{text}</pre>
          </div>
          <p className="hint">
            {photos.length} {photos.length === 1 ? "photo goes" : "photos go"} with
            this message.
            <br />
            PDF opens a page with the photos and the details. Choose
            &ldquo;Save as PDF&rdquo; in the print box to send it as a file.
          </p>
        </div>
      )}

      {canAdd && (
        <div className="ord-pd cad-act">
          <h2>CAD came back</h2>
          <p className="hint">
            Put the factory&rsquo;s CAD images on this request. It then goes to
            the owner to approve.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!busy}
            onClick={() => cadRef.current?.click()}
          >
            {busy === "cad"
              ? "Uploading the CAD…"
              : status === "received" ? "Add more CAD images" : "Put the CAD on"}
          </button>
          <input
            ref={cadRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => {
              const list = Array.from(e.target.files || []);
              if (list.length) void addCad(list);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {isAdmin && (canApprove || canAskChanges) && (
        <div className="ord-approval cad-decide a-waiting">
          <h2>Your decision</h2>
          {canApprove && (
            <>
              <p className="hint">Approve it if the CAD is right. Then it can become an order.</p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!!busy}
                onClick={() => decide("approve")}
              >
                {busy === "approve" ? "Saving…" : "Approve the CAD"}
              </button>
            </>
          )}
          {canAskChanges && (
            <div className="cad-changes">
              <label className="field" htmlFor="cad-change">
                <span>What should the factory change</span>
                <textarea
                  id="cad-change"
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder="Make the band thinner. Raise the centre stone."
                />
              </label>
              <button
                type="button"
                className="btn"
                disabled={!!busy}
                onClick={() => decide("changes")}
              >
                {busy === "changes" ? "Saving…" : "Ask for changes"}
              </button>
            </div>
          )}
        </div>
      )}

      {canOrder && (
        <div className="ord-pd cad-act">
          <h2>Make the order</h2>
          <p className="hint">
            Opens the order form filled in from this request, with the approved
            CAD as the picture.
            <br />
            Check it, fill in what is missing, and save it as any order.
          </p>
          <Link href={`/orders/new?fromCad=${encodeURIComponent(id)}`} className="btn btn-primary">
            Make order
          </Link>
        </div>
      )}

      {canDelete && (
        <div className="ord-pd cad-act">
          <h2>Remove it</h2>
          <button type="button" className="btn" disabled={!!busy} onClick={remove}>
            {busy === "delete" ? "Deleting…" : "Delete this request"}
          </button>
        </div>
      )}

      {error && <p className="save-error">{error}</p>}
    </div>
  );
}
