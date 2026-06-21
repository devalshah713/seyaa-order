"use client";

export default function UserMenu({ name, role }: { name: string; role: string }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <div className="row" style={{ gap: 10, alignItems: "center" }}>
      <span className="user-chip" title={role}>
        {name}
        <span className="user-role">{role}</span>
      </span>
      <button className="btn ghost small" onClick={logout} style={{ color: "#fff", borderColor: "#3f3f46" }}>
        Sign out
      </button>
    </div>
  );
}
