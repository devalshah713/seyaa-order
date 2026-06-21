"use client";

import { useState } from "react";

export default function LoginForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Sign in failed.");
        setBusy(false);
        return;
      }
      // Full navigation so the middleware sees the new cookie.
      window.location.href = next || "/";
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="login-form">
      <label className="field">
        <span>Username</span>
        <input
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <div className="login-error">{error}</div>}
      <button type="submit" className="btn gold" disabled={busy} style={{ marginTop: 4 }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
