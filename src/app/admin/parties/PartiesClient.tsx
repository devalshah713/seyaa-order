"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Party, PartyKind } from "@/lib/memoFormat";

// Two lists, same shape, kept on one screen: who a memo can be issued to, and
// who a design can be assigned to. Both are chosen from and neither is typed
// into anywhere else in the app.
export default function PartiesClient({
  parties,
  mfgs,
  unlisted,
}: {
  parties: Party[];
  mfgs: Party[];
  unlisted: { name: string; memos: number }[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<PartyKind>("party");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setError(""); setNotice("");
    const res = await fetch(url, init);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error || "That didn't work."); return false; }
    router.refresh();
    return true;
  }

  async function add(nameToAdd: string) {
    if (!nameToAdd.trim()) return;
    setBusy(true);
    const ok = await call("/api/parties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameToAdd, kind }),
    });
    if (ok) { setNotice(`Added ${nameToAdd.trim()}.`); setName(""); }
    setBusy(false);
  }

  async function saveRename(id: string) {
    if (await call(`/api/parties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    })) setEditId("");
  }

  async function remove(p: Party) {
    if (!window.confirm(`Remove ${p.name} from the list?`)) return;
    await call(`/api/parties/${p.id}`, { method: "DELETE" });
  }

  const mfg = kind === "mfg";
  const list = mfg ? mfgs : parties;
  const noun = mfg ? "manufacturer" : "party";

  const switchTo = (k: PartyKind) => {
    setKind(k); setName(""); setEditId(""); setError(""); setNotice("");
  };

  return (
    <>
      <div className="kind-tabs">
        <button className={!mfg ? "active" : ""} onClick={() => switchTo("party")}>
          Memo parties ({parties.length})
        </button>
        <button className={mfg ? "active" : ""} onClick={() => switchTo("mfg")}>
          Manufacturers ({mfgs.length})
        </button>
      </div>
      <p className="jg-blurb">
        {mfg
          ? "Who a PD sheet can be assigned to. The design team chooses from this list; nobody else can add to it."
          : "Who a memo can be issued to. Staff choose from this list; nobody else can add to it."}
      </p>

      <form className="party-add" onSubmit={(e) => { e.preventDefault(); void add(name); }}>
        <label className="field"><span>{mfg ? "Manufacturer name" : "Party name"}</span>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={mfg ? "e.g. Sky Jewels" : "e.g. Ghanshyam Bhai"} /></label>
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? "Adding…" : `Add ${noun}`}
        </button>
      </form>

      {error && <p className="save-error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {!mfg && unlisted.length > 0 && (
        <div className="unlisted">
          <h2>Names already used on memos</h2>
          <p>
            These were typed as free text before the list existed. Add the correct spelling of
            each — and look for the same party appearing twice.
          </p>
          <ul>
            {unlisted.map((u) => (
              <li key={u.name}>
                <span className="ul-name">{u.name}</span>
                <span className="ul-count">{u.memos} memo{u.memos === 1 ? "" : "s"}</span>
                <button type="button" className="rowbtn" onClick={() => add(u.name)}>Add as-is</button>
                <button type="button" className="rowbtn" onClick={() => setName(u.name)}>Edit then add</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="party-h">On the list ({list.length})</h2>
      {list.length === 0 ? (
        <p className="empty-state">
          {mfg
            ? "No manufacturers yet. A PD sheet cannot be assigned until one is added."
            : "No parties yet. Until one is added, memos still accept any name."}
        </p>
      ) : (
        <table className="history">
          <thead><tr><th>{mfg ? "Manufacturer" : "Party"}</th><th>Added by</th><th className="actions-col">Actions</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td className="memono">
                  {editId === p.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveRename(p.id); } }} />
                  ) : p.name}
                </td>
                <td>{p.createdBy}</td>
                <td className="row-actions">
                  {editId === p.id ? (
                    <>
                      <button className="rowbtn" onClick={() => saveRename(p.id)}>Save</button>
                      <button className="rowbtn" onClick={() => setEditId("")}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="rowbtn" onClick={() => { setEditId(p.id); setEditName(p.name); }}>Rename</button>
                      <button className="rowbtn danger" onClick={() => remove(p)}>Remove</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
