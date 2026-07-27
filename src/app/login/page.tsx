"use client";
// Single entry point for signing in. On a brand-new install there are no
// accounts yet, so this same screen switches into "create the admin" mode —
// that is how the first password gets set, by the owner, on their own machine.
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { COMPANY } from "@/lib/memoFormat";

type Mode = "loading" | "login" | "setup" | "unconfigured";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("loading");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d: { configured?: boolean; needsSetup?: boolean; error?: string }) => {
        if (!d.configured) {
          setMode("unconfigured");
          setError(d.error || "Sign-in is not configured yet.");
          return;
        }
        setMode(d.needsSetup ? "setup" : "login");
      })
      .catch(() => {
        setMode("unconfigured");
        setError("Could not reach the server.");
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "setup" && password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(mode === "setup" ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not sign in.");
        setBusy(false);
        return;
      }
      // Deliberately a full page load, not router.replace(). The user reached
      // this screen via a middleware redirect, and that redirect is sitting in
      // the client router cache — a soft navigation just replays it and bounces
      // straight back here with the button stuck on "Please wait…". A real
      // navigation re-runs middleware with the cookie that was just set.
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next && next.startsWith("/") ? next : "/");
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  if (mode === "loading") {
    return <div className="auth-wrap"><p className="auth-muted">Loading…</p></div>;
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo height={54} className="mark" />
        <h1>{COMPANY.name}</h1>

        {mode === "unconfigured" ? (
          <p className="save-error">{error}</p>
        ) : (
          <>
            <p className="auth-muted">
              {mode === "setup"
                ? "No accounts exist yet. Create the admin account to get started."
                : "Sign in to continue."}
            </p>

            <label className="field">
              <span>Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "setup" ? "new-password" : "current-password"}
                required
              />
            </label>

            {mode === "setup" && (
              <label className="field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
            )}

            {error && <p className="save-error">{error}</p>}

            <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "setup" ? "Create admin account" : "Sign in"}
            </button>

            {mode === "setup" && (
              <p className="auth-hint">
                Use at least 8 characters. Your password is stored scrambled — it cannot be
                read back by anyone, including from the database.
              </p>
            )}
          </>
        )}
      </form>
    </div>
  );
}
