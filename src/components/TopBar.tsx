"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { COMPANY } from "@/lib/memoFormat";
import { canUseModule, type ModuleKey } from "@/lib/access";
import type { Role } from "@/lib/session";

type Props = { user: { username: string; role: Role; mods?: string[] } | null };

export default function TopBar({ user }: Props) {
  const path = usePathname();
  // On a phone the nav is folded behind a menu button; on a wide screen the
  // button is hidden and the links sit in the bar exactly as before.
  const [menuOpen, setMenuOpen] = useState(false);
  // Following a link has to put the menu away, or it covers the page arrived at.
  useEffect(() => setMenuOpen(false), [path]);

  // The order board is screenshotted for sharing — the app chrome must not
  // appear in the image.
  if (path === "/orders/board") return null;
  // A section is active for its list page and any detail page under it.
  const on = (base: string) =>
    path === base || (path.startsWith(`${base}/`) && path !== `${base}/new`);

  // Only show what this account may actually open; admins see everything.
  const can = (key: ModuleKey) => !!user && canUseModule(user, key);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Full load for the same reason as sign-in: a soft navigation would keep
    // the cached signed-in pages around after the cookie is gone.
    window.location.assign("/login");
  }

  return (
    <header className="topbar no-print">
      <Logo height={30} className="mark" />
      <Link href="/" className="brand" style={{ textDecoration: "none" }}>
        {COMPANY.name}
      </Link>
      {user && (
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      )}
      {user && (
        <nav className={menuOpen ? "open" : ""}>
          {can("memos") && (
            <>
              <Link href="/memo/new" className={path === "/memo/new" ? "active" : ""}>New Memo</Link>
              <Link href="/memo/new/gold" className={path === "/memo/new/gold" ? "active" : ""}>Gold Memo</Link>
            </>
          )}
          {can("orders") && (
            <Link href="/orders" className={path === "/orders" ? "active" : ""}>Orders</Link>
          )}
          {can("memos") && (
            <Link href="/memo" className={on("/memo") ? "active" : ""}>History</Link>
          )}
          {can("stock") && (
            <>
              <Link href="/stock/sheet" className={path === "/stock/sheet" ? "active" : ""}>Available</Link>
              <Link href="/stock" className={path === "/stock" ? "active" : ""}>Stock</Link>
            </>
          )}
          {can("pd") && (
            <>
              <Link href="/pd" className={on("/pd") ? "active" : ""}>PD Sheets</Link>
              <Link href="/demand" className={on("/demand") ? "active" : ""}>Demands</Link>
            </>
          )}
          {can("jangad") && (
            <Link href="/jangad" className={on("/jangad") ? "active" : ""}>Jangad</Link>
          )}
          {can("stockbook") && (
            <Link href="/stockbook" className={on("/stockbook") ? "active" : ""}>Stock Book</Link>
          )}
          {user.role === "admin" && (
            <>
              <Link href="/admin/parties" className={path === "/admin/parties" ? "active" : ""}>Parties</Link>
              <Link href="/admin/users" className={on("/admin/users") ? "active" : ""}>Users</Link>
            </>
          )}
          {/* `display: contents` on wide screens, so the bar is laid out exactly
              as it was; on a phone these three sit together on their own row. */}
          <div className="nav-tail">
            <ThemeToggle />
            <span className="whoami" title={user.role === "admin" ? "Admin" : "User"}>{user.username}</span>
            <button type="button" className="signout" onClick={signOut}>Sign out</button>
          </div>
        </nav>
      )}
    </header>
  );
}
