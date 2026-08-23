"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PARTY_KINDS, type Party, type PartyKind } from "@/lib/memoFormat";

// Every controlled list on one screen: who a memo goes to, who makes a design,
// and the boxes on a PD sheet. All the same shape, all chosen from and not
// typed into anywhere else, so all one table with a tab each.
export default function PartiesClient({
  lists,
  unlisted,
}: {
  lists: Record<string, Party[]>;
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

  const meta = PARTY_KINDS.find((k) => k.key === kind)!;
  const list = lists[kind] || [];
  const noun = meta.noun;
  // Only the memo list has a history of typed names behind it.
  const showUnlisted = kind === "party";

  const switchTo = (k: PartyKind) => {
    setKind(k); setName(""); setEditId(""); setError(""); setNotice("");
  };

  return (
    <>
      <div className="kind-tabs many">
        {PARTY_KINDS.map((k) => (
          <button key={k.key} className={kind === k.key ? "active" : ""}
            onClick={() => switchTo(k.key)}>
            {k.label} ({(lists[k.key] || []).length})
          </button>
        ))}
      </div>
      <p className="jg-blurb">
        {meta.blurb} Staff choose from this list; only an admin changes it.
      </p>

      <form className="party-add" onSubmit={(e) => { e.preventDefault(); void add(name); }}>
        <label className="field"><span>New {noun}</span>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={`e.g. ${(lists[kind] || [])[0]?.name || "a new name"}`} /></label>
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? "Adding…" : `Add ${noun}`}
        </button>
      </form>

      {error && <p className="save-error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {showUnlisted && unlisted.length > 0 && (
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
          Nothing on this list yet — the boxes it fills have nothing to offer
          until something is added.
        </p>
      ) : (
        <table className="history">
          <thead><tr>
            <th>{meta.label}</th><th>Added by</th>
            <th className="actions-col">Actions</th>
          </tr></thead>
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
