"use client";
import { useEffect, useState } from "react";
import type { PublicUser } from "@/lib/userStore";
import { MODULES, allowedModules, type ModuleKey } from "@/lib/access";

export default function UsersClient({ meId }: { meId: string }) {
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [mods, setMods] = useState<ModuleKey[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // The row being edited, with its pending changes.
  const [editing, setEditing] = useState<{ id: string; role: "user" | "admin"; mods: ModuleKey[] } | null>(null);

  async function load() {
    const res = await fetch("/api/users");
    const data = (await res.json()) as { users?: PublicUser[]; error?: string };
    if (!res.ok) { setError(data.error || "Could not load users."); return; }
    setUsers(data.users || []);
  }

  useEffect(() => { void load(); }, []);

  const toggle = (list: ModuleKey[], key: ModuleKey) =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, role, modules: mods }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setError(data.error || "Could not create the user."); return; }
      setNotice(`Created ${username}. Give them this password — they will need it to sign in.`);
      setUsername(""); setPassword(""); setRole("user"); setMods([]);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveAccess() {
    if (!editing) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      const res = await fetch(`/api/users/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: editing.role, modules: editing.mods }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setError(data.error || "Could not save access."); return; }
      setNotice("Access updated. It applies the next time they sign in.");
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(u: PublicUser) {
    if (!window.confirm(`Delete ${u.username}? They will lose access immediately.`)) return;
    setError(""); setNotice("");
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) { setError(data.error || "Could not delete the user."); return; }
    setNotice(`Deleted ${u.username}.`);
    await load();
  }

  function accessLabel(u: PublicUser): string {
    if (u.role === "admin") return "Everything";
    const mine = allowedModules(u);
    if (!Array.isArray(u.modules)) return "Everything (not yet restricted)";
    if (mine.length === 0) return "None";
    return MODULES.filter((m) => mine.includes(m.key)).map((m) => m.label).join(", ");
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Users</h1>
        <p>Everyone who can sign in, and which features they may use.</p>
      </div>

      <form className="user-add" onSubmit={addUser}>
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "user")}>
            <option value="user">User — only the features you tick</option>
            <option value="admin">Admin — everything, plus user management</option>
          </select>
        </label>

        {role === "user" && (
          <div className="field access-pick">
            <span>Features they can use</span>
            <div className="access-grid">
              {MODULES.map((m) => (
                <label key={m.key} className="access-opt">
                  <input
                    type="checkbox"
                    checked={mods.includes(m.key)}
                    onChange={() => setMods((l) => toggle(l, m.key))}
                  />
                  <span>
                    <b>{m.label}</b>
                    <small>{m.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Adding…" : "Add user"}
        </button>
      </form>

      {error && <p className="save-error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {users === null ? (
        <p className="auth-muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="empty-state">No users yet.</p>
      ) : (
        <table className="user-table">
          <thead>
            <tr><th>Username</th><th>Role</th><th>Features</th><th>Created</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}{u.id === meId && <span className="you-tag">you</span>}</td>
                <td>{u.role === "admin" ? "Admin" : "User"}</td>
                <td>
                  {editing?.id === u.id ? (
                    <div className="access-edit">
                      <select
                        value={editing.role}
                        onChange={(e) =>
                          setEditing({ ...editing, role: e.target.value === "admin" ? "admin" : "user" })
                        }
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                      {editing.role === "user" && (
                        <div className="access-grid tight">
                          {MODULES.map((m) => (
                            <label key={m.key} className="access-opt">
                              <input
                                type="checkbox"
                                checked={editing.mods.includes(m.key)}
                                onChange={() =>
                                  setEditing({ ...editing, mods: toggle(editing.mods, m.key) })
                                }
                              />
                              <span><b>{m.label}</b></span>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="access-actions">
                        <button type="button" className="btn btn-primary" onClick={saveAccess} disabled={busy}>
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    accessLabel(u)
                  )}
                </td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="user-actions">
                  {editing?.id !== u.id && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        setEditing({
                          id: u.id,
                          role: u.role === "admin" ? "admin" : "user",
                          mods: u.role === "admin" ? [] : allowedModules(u),
                        })
                      }
                    >
                      Access
                    </button>
                  )}
                  {u.id !== meId && (
                    <button type="button" className="btn del" onClick={() => removeUser(u)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
