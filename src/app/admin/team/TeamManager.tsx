"use client";

import { useState } from "react";

type PublicUser = {
  username: string;
  name: string;
  role: "admin" | "staff";
  createdAt: string;
};

export default function TeamManager({
  initialUsers,
  ownerUsername,
}: {
  initialUsers: PublicUser[];
  ownerUsername: string;
}) {
  const [users, setUsers] = useState<PublicUser[]>(initialUsers);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
    }
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not add employee.");
        return;
      }
      setName("");
      setUsername("");
      setPassword("");
      setRole("staff");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeEmployee(u: PublicUser) {
    if (!confirm(`Remove ${u.name} (${u.username})? They will no longer be able to sign in.`)) return;
    const res = await fetch(`/api/users?username=${encodeURIComponent(u.username)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Could not remove employee.");
    }
  }

  async function resetPassword(u: PublicUser) {
    const pw = prompt(`New password for ${u.name} (at least 6 characters):`);
    if (!pw) return;
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.username, password: pw }),
    });
    if (res.ok) {
      alert("Password updated.");
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Could not update password.");
    }
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add an employee</h2>
        <form onSubmit={addEmployee}>
          <div className="grid3">
            <label className="field">
              <span>Full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Username (for login)</span>
              <input
                value={username}
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. ramesh"
                required
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "staff")}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <div className="grid3">
            <label className="field">
              <span>Temporary password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="at least 6 characters"
                required
              />
            </label>
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn gold" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? "Adding…" : "Add employee"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Employees ({users.length})</h2>
        {users.length === 0 ? (
          <p className="muted">No employees yet. Add your first one above.</p>
        ) : (
          <div className="team-table">
            <div className="team-row team-head">
              <span>Name</span>
              <span>Username</span>
              <span>Role</span>
              <span></span>
            </div>
            {users.map((u) => (
              <div className="team-row" key={u.username}>
                <span>{u.name}</span>
                <span className="muted">{u.username}</span>
                <span>
                  <span className={`badge ${u.role === "admin" ? "badge-admin" : "badge-staff"}`}>
                    {u.role}
                  </span>
                </span>
                <span className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn ghost small" onClick={() => resetPassword(u)}>
                    Reset password
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => removeEmployee(u)}
                    disabled={u.username.toLowerCase() === ownerUsername.toLowerCase()}
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          Note: the owner account is built in and always has admin access.
        </p>
      </div>
    </>
  );
}
