"use client";
import { useEffect, useState } from "react";
import type { PublicUser } from "@/lib/userStore";

export default function UsersClient({ meId }: { meId: string }) {
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/users");
    const data = (await res.json()) as { users?: PublicUser[]; error?: string };
    if (!res.ok) { setError(data.error || "Could not load users."); return; }
    setUsers(data.users || []);
  }

  useEffect(() => { void load(); }, []);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setError(data.error || "Could not create the user."); return; }
      setNotice(`Created ${username}. Give them this password — they will need it to sign in.`);
      setUsername(""); setPassword(""); setRole("user");
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

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Users</h1>
        <p>Everyone who can sign in to the memo app.</p>
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
            <option value="user">User — can create and view memos</option>
            <option value="admin">Admin — can also manage users</option>
          </select>
        </label>
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
            <tr><th>Username</th><th>Role</th><th>Created</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}{u.id === meId && <span className="you-tag">you</span>}</td>
                <td>{u.role === "admin" ? "Admin" : "User"}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
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
