"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PARTY_KINDS, hasCode, suggestCode, type Party, type PartyKind,
} from "@/lib/memoFormat";

// Every controlled list on one screen: who a memo goes to, who makes a design,
// and the boxes on a PD sheet. All the same shape, all chosen from and not
// typed into anywhere else, so all one table with a tab each.
export default function PartiesClient({
  lists,
  unlisted,
}: {
  lists: Record<string, Party[]>;
  unlisted: { name: string; memos: number; match: string; score: number }[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<PartyKind>("party");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  // What a new entry will sit under, on the lists that are a tree.
  const [parentId, setParentId] = useState("");
  // Which listed name each old typed one is being put onto. Starts at what the
  // matching suggested, and is a dropdown so a wrong guess is one change away.
  const [onto, setOnto] = useState<Record<string, string>>({});
  // The short form this entry lends a design number — BR, TN, AMF.
  const [code, setCode] = useState("");
  const [editCode, setEditCode] = useState("");

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
      body: JSON.stringify({ name: nameToAdd, kind, parentId, code }),
    });
    if (ok) {
      // The parent stays put: a category's sub-categories are added one after
      // another, so re-choosing it every time is wasted work.
      setNotice(`Added ${nameToAdd.trim()}.`);
      setName("");
      setCode("");
    }
    setBusy(false);
  }

  async function saveRename(id: string) {
    if (await call(`/api/parties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, code: editCode }),
    })) { setEditId(""); setEditCode(""); }
  }

  async function remove(p: Party) {
    if (!window.confirm(`Remove ${p.name} from the list?`)) return;
    await call(`/api/parties/${p.id}`, { method: "DELETE" });
  }

  // Clearing a whole list, for when a set of built-in options is being replaced
  // with Seyaa's own. Named in the prompt, because it cannot be undone.
  // Rewrites every memo carrying the old typed name.
  async function replaceOnMemos(u: { name: string; memos: number; match: string }) {
    // The same fallback the dropdown renders with: until it is touched, what is
    // on screen is the suggested match, and that is what the button must act on.
    const to = onto[u.name] ?? u.match;
    if (!to) return;
    if (!window.confirm(
      `Put ${u.memos} memo${u.memos === 1 ? "" : "s"} from "${u.name}" onto "${to}"? The memos will read ${to} from now on.`
    )) return;
    setBusy(true);
    const res = await fetch("/api/parties/replace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: u.name, to }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setError(d.error || "That didn't work.");
    else {
      setNotice(`${d.memos} memo${d.memos === 1 ? "" : "s"} now read ${to}.`);
      setError("");
      router.refresh();
    }
    setBusy(false);
  }

  async function clearAll() {
    const meta = PARTY_KINDS.find((k) => k.key === kind)!;
    const n = (lists[kind] || []).length;
    if (!n) return;
    if (!window.confirm(
      `Remove all ${n} from ${meta.label}? Sheets already saved keep what they say, but the list starts empty.`
    )) return;
    setBusy(true);
    if (await call(`/api/parties?kind=${kind}`, { method: "DELETE" })) {
      setNotice(`${meta.label} cleared.`);
    }
    setBusy(false);
  }

  const meta = PARTY_KINDS.find((k) => k.key === kind)!;
  const list = lists[kind] || [];
  const noun = meta.noun;
  // Only the memo list has a history of typed names behind it.
  const showUnlisted = kind === "party";

  const switchTo = (k: PartyKind) => {
    setKind(k); setName(""); setCode(""); setEditId(""); setParentId("");
    setError(""); setNotice("");
  };

  // The list this one hangs off, and what it holds.
  const coded = hasCode(kind);
  const parentKind = meta.parent;
  const parents = parentKind ? lists[parentKind] || [] : [];
  const parentMeta = PARTY_KINDS.find((k) => k.key === parentKind);
  const nameById = new Map(
    Object.values(lists).flat().map((p) => [p.id, p.name])
  );

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

      {parentKind && parents.length === 0 ? (
        <p className="party-warn">
          Add a {parentMeta?.noun} first — a {noun} has to sit under one.
        </p>
      ) : (
        <form className="party-add" onSubmit={(e) => { e.preventDefault(); void add(name); }}>
          {parentKind && (
            <label className="field"><span>Under which {parentMeta?.noun}</span>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Choose one…</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select></label>
          )}
          <label className="field"><span>New {noun}</span>
            <input value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. ${(lists[kind] || [])[0]?.name || "a new name"}`} /></label>
          {coded && (
            <label className="field"><span>Code</span>
              <input className="code-in" value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={name.trim() ? suggestCode(name) : "BR"} /></label>
          )}
          <button type="submit" className="btn btn-primary"
            disabled={busy || !name.trim() || (!!parentKind && !parentId)}>
            {busy ? "Adding…" : `Add ${noun}`}
          </button>
        </form>
      )}

      {error && <p className="save-error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {showUnlisted && unlisted.length > 0 && (
        <div className="unlisted">
          <h2>Names already used on memos</h2>
          <p>
            Typed as free text before the list existed. Each is shown against the
            party it looks like — check it, then put those memos onto that name.
            The memos keep everything else; only who they are addressed to changes.
          </p>
          <ul>
            {unlisted.map((u) => {
              const chosen = onto[u.name] ?? u.match;
              return (
                <li key={u.name}>
                  <span className="ul-name">{u.name}</span>
                  <span className="ul-count">{u.memos} memo{u.memos === 1 ? "" : "s"}</span>
                  <span className="ul-arrow" aria-hidden>→</span>
                  <select
                    className="ul-onto"
                    value={chosen}
                    onChange={(e) => setOnto({ ...onto, [u.name]: e.target.value })}
                  >
                    <option value="">Leave it alone</option>
                    {(lists.party || []).map((p) => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  {/* How sure the match is, so a guess is not mistaken for a fact. */}
                  {u.match && chosen === u.match && (
                    <span className={`ul-score ${u.score >= 0.95 ? "sure" : ""}`}>
                      {u.score >= 0.95 ? "same name" : "looks like it"}
                    </span>
                  )}
                  <button type="button" className="rowbtn" disabled={busy || !chosen}
                    onClick={() => replaceOnMemos(u)}>
                    Replace on {u.memos}
                  </button>
                  <button type="button" className="rowbtn" onClick={() => add(u.name)}>
                    Add as a new party
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="party-h-row">
        <h2 className="party-h">On the list ({list.length})</h2>
        {list.length > 0 && (
          <button type="button" className="rowbtn danger" onClick={clearAll} disabled={busy}>
            Remove all
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="empty-state">
          Nothing on this list yet — the boxes it fills have nothing to offer
          until something is added.
        </p>
      ) : (
        <table className="history">
          <thead><tr>
            <th>{meta.label}</th>
            {coded && <th>Code</th>}
            {parentKind && <th>Under</th>}
            <th>Added by</th>
            <th className="actions-col">Actions</th>
          </tr></thead>
          <tbody>
            {[...list].sort((a, b) => {
              if (!parentKind) return 0;
              const pa = nameById.get(a.parentId || "") || "";
              const pb = nameById.get(b.parentId || "") || "";
              return pa.localeCompare(pb) || a.name.localeCompare(b.name);
            }).map((p) => (
              <tr key={p.id}>
                <td className="memono">
                  {editId === p.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveRename(p.id); } }} />
                  ) : p.name}
                </td>
                {coded && (
                  <td className="code-cell">
                    {editId === p.id ? (
                      <input className="code-in" value={editCode}
                        onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveRename(p.id); } }} />
                    ) : <code>{p.code || suggestCode(p.name)}</code>}
                  </td>
                )}
                {parentKind && <td>{nameById.get(p.parentId || "") || "—"}</td>}
                <td>{p.createdBy}</td>
                <td className="row-actions">
                  {editId === p.id ? (
                    <>
                      <button className="rowbtn" onClick={() => saveRename(p.id)}>Save</button>
                      <button className="rowbtn" onClick={() => setEditId("")}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="rowbtn" onClick={() => { setEditId(p.id); setEditName(p.name); setEditCode(p.code || suggestCode(p.name)); }}>Rename</button>
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
