"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { COMPANY } from "@/lib/memoFormat";
import type { Role } from "@/lib/session";

type Props = { user: { username: string; role: Role } | null };

export default function TopBar({ user }: Props) {
  const path = usePathname();
  // The order board is screenshotted for sharing — the app chrome must not
  // appear in the image.
  if (path === "/orders/board") return null;
  const on = (href: string) =>
    href === "/memo" ? path === "/memo" || path.startsWith("/memo/") && path !== "/memo/new" : path === href;

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
        <nav>
          <Link href="/memo/new" className={path === "/memo/new" ? "active" : ""}>New Memo</Link>
          <Link href="/memo/new/gold" className={path === "/memo/new/gold" ? "active" : ""}>Gold Memo</Link>
          <Link href="/orders" className={path === "/orders" ? "active" : ""}>Orders</Link>
          <Link href="/memo" className={on("/memo") ? "active" : ""}>History</Link>
          <Link href="/stock/sheet" className={path === "/stock/sheet" ? "active" : ""}>Available</Link>
          <Link href="/stock" className={path === "/stock" ? "active" : ""}>Stock</Link>
          {user.role === "admin" && (
            <>
              <Link href="/admin/parties" className={path === "/admin/parties" ? "active" : ""}>Parties</Link>
              <Link href="/admin/users" className={on("/admin/users") ? "active" : ""}>Users</Link>
            </>
          )}
          <ThemeToggle />
          <span className="whoami" title={user.role === "admin" ? "Admin" : "User"}>{user.username}</span>
          <button type="button" className="signout" onClick={signOut}>Sign out</button>
        </nav>
      )}
    </header>
  );
}
